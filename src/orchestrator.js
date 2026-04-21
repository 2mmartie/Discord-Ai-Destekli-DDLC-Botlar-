const personalities = require('./config/personalities');
const { generateResponse } = require('./services/aiService');
const config = require('./config/config');

class RPOrchestrator {
    constructor() {
        this.histories = {}; // channelId -> array of messages
        this.maxHistory = 15; 
        this.clients = {}; // charKey -> DiscordClient
        this.processingBots = new Set(); // charKey -> is thinking
        this.autoTalkTimeouts = {}; // channelId -> timeout
        this.processedMessageIds = new Set(); // To prevent duplicate logging
        this.globalLock = false; // Global lock to prevent multiple API requests at once
        this.channelCooldowns = {}; // channelId -> lastResponseTimestamp
        this.autoTalkActive = true; // Manual toggle for auto-talk
    }

    addClient(charKey, client) {
        this.clients[charKey] = client;
        console.log(`[SYSTEM] Client registered: ${charKey}`);
        
        if (Object.keys(this.clients).length === 4) {
            console.log("[SYSTEM] All bots connected. Initializing group auto-talk...");
            setTimeout(() => {
                if (this.autoTalkActive) {
                    this.resetAutoTalkTimer(config.channels.group, true);
                }
            }, 5000);
        }
    }

    isWorkingHours() {
        const now = new Date();
        const hour = now.getHours();
        return (hour >= 9 || hour < 1);
    }

    isOurBot(userId) {
        return Object.values(this.clients).some(client => client.user && client.user.id === userId);
    }

    async addMessage(channelId, senderName, content, messageId = null) {
        if (messageId && this.processedMessageIds.has(messageId)) return;
        
        console.log(`[MSG] New message in ${channelId} from ${senderName}: "${content.substring(0, 30)}..."`);

        if (content && (content.includes('düşünmem gerek') || content.includes('kafam biraz karışık') || content.includes('(...)'))) {
            return;
        }

        if (messageId) {
            this.processedMessageIds.add(messageId);
            if (this.processedMessageIds.size > 100) {
                const firstItem = this.processedMessageIds.values().next().value;
                this.processedMessageIds.delete(firstItem);
            }
        }

        if (!this.histories[channelId]) this.histories[channelId] = [];
        
        this.histories[channelId].push(`${senderName}: ${content}`);
        if (this.histories[channelId].length > this.maxHistory) this.histories[channelId].shift();
        
        if (channelId === config.channels.group && this.isWorkingHours()) {
            this.resetAutoTalkTimer(channelId);
        }
    }

    getHistoryString(channelId) {
        const fullHistory = this.histories[channelId] || [];
        let totalChars = 0;
        const truncatedHistory = [];
        
        for (let i = fullHistory.length - 1; i >= 0; i--) {
            const msg = fullHistory[i];
            if (totalChars + msg.length > 5000) break;
            truncatedHistory.unshift(msg);
            totalChars += msg.length;
        }
        
        return truncatedHistory.join('\n');
    }

    resetAutoTalkTimer(channelId, immediate = false) {
        if (!channelId || channelId.includes('PASTE')) return;
        if (!this.isWorkingHours()) return;
        if (!this.autoTalkActive && channelId === config.channels.group) return;
        
        if (this.autoTalkTimeouts[channelId]) clearTimeout(this.autoTalkTimeouts[channelId]);
        
        // Longer delays for safe continuous operation (30s to 90s)
        const min = immediate ? 3000 : (channelId === config.channels.group ? 30000 : config.minDelay);
        const max = immediate ? 10000 : (channelId === config.channels.group ? 90000 : config.maxDelay);
        
        const delay = Math.floor(Math.random() * (max - min + 1) + min);
        console.log(`[TIMER] Next auto-talk in ${Math.round(delay/1000)}s for channel ${channelId}`);
        this.autoTalkTimeouts[channelId] = setTimeout(() => this.triggerAutoTalk(channelId), delay);
    }

    async triggerAutoTalk(channelId) {
        if (!this.isWorkingHours()) {
            console.log("[SYSTEM] Outside working hours. Auto-talk skipped.");
            return;
        }
        const keys = Object.keys(personalities);
        const randomKey = keys[Math.floor(Math.random() * keys.length)];
        console.log(`[SYSTEM] Auto-talk triggered for ${randomKey}`);
        await this.queueResponse(randomKey, channelId);
    }

    async queueResponse(charKey, channelId, force = false) {
        if (!this.isWorkingHours()) return;
        if (!channelId || channelId.includes('PASTE')) return;
        
        if (this.processingBots.has(charKey)) {
             console.log(`[SKIP] ${charKey} is already thinking.`);
             return;
        }
        if (this.globalLock && !force) {
             console.log(`[SKIP] Global lock active. ${charKey} waiting.`);
             return;
        }

        // CHANNEL COOLDOWN: 30s minimum for group chat to save tokens and improve readability
        const now = Date.now();
        const lastTalk = this.channelCooldowns[channelId] || 0;
        const cooldownMs = channelId === config.channels.group ? 30000 : 3000; 
        
        if (!force && (now - lastTalk < cooldownMs)) {
            console.log(`[SKIP] ${charKey}: Channel cooldown active (${Math.round((cooldownMs - (now-lastTalk))/1000)}s left).`);
            return;
        }

        // NO RNG: User wants 100% response rate
        let rejectionChance = 0; 
        
        if (Math.random() < rejectionChance) {
            console.log(`[SKIP] ${charKey}: RNG Rejection.`);
            return;
        }

        console.log(`[AI] ${charKey} starts thinking for channel ${channelId}...`);
        this.processingBots.add(charKey);
        this.globalLock = true; 

        try {
            const character = personalities[charKey];
            const client = this.clients[charKey];
            
            if (!client || !client.isReady()) {
                this.releaseLocks(charKey);
                return;
            }

            const channel = await client.channels.fetch(channelId).catch(() => null);
            if (!channel) {
                this.releaseLocks(charKey);
                return;
            }

            await new Promise(resolve => setTimeout(resolve, Math.random() * 2000));
            await channel.sendTyping();
            
            const response = await generateResponse(character, this.getHistoryString(channelId), channelId);
            
            // Update cooldown and release lock so other bots can start their AI processing
            this.channelCooldowns[channelId] = Date.now();
            this.releaseLocks(charKey);
            
            if (!response) {
                console.log(`[AI] ${character.name} produced empty response.`);
                return;
            }

            const typingMs = Math.min(Math.max(response.length * 40, 1500), 4000);
            await new Promise(resolve => setTimeout(resolve, typingMs));

            const sentMessage = await channel.send(response);
            this.addMessage(channelId, character.name, response, sentMessage.id);

            if (channelId === config.channels.group && Math.random() < config.autoReplyChance) {
                const otherKeys = Object.keys(personalities).filter(k => k !== charKey);
                const nextKey = otherKeys[Math.floor(Math.random() * otherKeys.length)];
                
                // Staggered delay for chain reactions (30-50s) to keep things steady
                const reactionDelay = 30000 + (Math.random() * 20000);
                console.log(`[CHAIN] Triggering follow-up for ${nextKey} in ${Math.round(reactionDelay/1000)}s`);
                setTimeout(() => this.queueResponse(nextKey, channelId, true), reactionDelay);
            }
        } catch (error) {
            console.error(`[ERROR] queueResponse failed for ${charKey}:`, error.message);
            this.releaseLocks(charKey);
        }
    }

    releaseLocks(charKey) {
        this.processingBots.delete(charKey);
        this.globalLock = false;
    }

    setAutoTalk(status) {
        this.autoTalkActive = status;
        if (status) {
            console.log("[SYSTEM] Auto-talk: ENABLED");
            this.resetAutoTalkTimer(config.channels.group, true); // FAST START
        } else {
            console.log("[SYSTEM] Auto-talk: DISABLED");
            if (this.autoTalkTimeouts[config.channels.group]) {
                clearTimeout(this.autoTalkTimeouts[config.channels.group]);
            }
        }
    }
}

module.exports = new RPOrchestrator();

