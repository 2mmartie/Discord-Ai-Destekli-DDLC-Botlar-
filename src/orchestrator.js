const personalities = require('./config/personalities');
const { generateResponse } = require('./services/aiService');
const config = require('./config/config');

class RPOrchestrator {
    constructor() {
        this.histories = {}; // channelId -> array of messages
        this.maxHistory = 15; // Increased memory for Gemma 2
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
        
        // Check if all clients are ready to kickstart the group channel
        if (Object.keys(this.clients).length === 4) {
            console.log("[SYSTEM] All bots connected. Stabilizing...");
            setTimeout(() => {
                if (this.autoTalkActive) {
                    console.log("[SYSTEM] Auto-talk starting in group channel.");
                    this.resetAutoTalkTimer(config.channels.group);
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
        
        // Skip adding AI error messages to history
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
        
        // Reverse iterate to get the most recent messages that fit within character limit
        for (let i = fullHistory.length - 1; i >= 0; i--) {
            const msg = fullHistory[i];
            if (totalChars + msg.length > 5000) break; // Limit history to ~1250 tokens
            truncatedHistory.unshift(msg);
            totalChars += msg.length;
        }
        
        return truncatedHistory.join('\n');
    }

    resetAutoTalkTimer(channelId) {
        if (!channelId || channelId.includes('PASTE')) return;
        if (!this.isWorkingHours()) return;
        if (!this.autoTalkActive && channelId === config.channels.group) return;
        
        if (this.autoTalkTimeouts[channelId]) clearTimeout(this.autoTalkTimeouts[channelId]);
        
        // Balanced delays for active group chat (1 to 3 minutes)
        const min = channelId === config.channels.group ? 60000 : config.minDelay;
        const max = channelId === config.channels.group ? 180000 : config.maxDelay;
        
        const delay = Math.floor(Math.random() * (max - min + 1) + min);
        this.autoTalkTimeouts[channelId] = setTimeout(() => this.triggerAutoTalk(channelId), delay);
    }

    async triggerAutoTalk(channelId) {
        if (!this.isWorkingHours()) return;
        const keys = Object.keys(personalities);
        const randomKey = keys[Math.floor(Math.random() * keys.length)];
        await this.queueResponse(randomKey, channelId);
    }

    async queueResponse(charKey, channelId) {
        if (!this.isWorkingHours()) return;
        if (!channelId || channelId.includes('PASTE')) return;
        
        // Prevent concurrent requests globally (across all bots)
        if (this.globalLock || this.processingBots.has(charKey)) return;

        // CHANNEL COOLDOWN: Prevent any bot from talking too soon after the last message
        const now = Date.now();
        const lastTalk = this.channelCooldowns[channelId] || 0;
        const cooldownMs = channelId === config.channels.group ? 18000 : 3000; // 18s for group, 3s for private
        if (now - lastTalk < cooldownMs) return;

        // LOWER rejection chance in group chat for better flow
        // If a bot is specifically triggered by a chain reaction, we lower it further
        let currentRejectionChance = channelId === config.channels.group ? 0.35 : 0.05; 
        
        if (Math.random() < currentRejectionChance) return;

        this.processingBots.add(charKey);
        this.globalLock = true; // Lock the API

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

            // Small initial jitter to prevent race conditions on triggers
            await new Promise(resolve => setTimeout(resolve, Math.random() * 2000));

            await channel.sendTyping();
            const response = await generateResponse(character, this.getHistoryString(channelId), channelId);
            
            if (!response) {
                console.log(`[SILENT FAIL] ${character.name} skipped response due to API error.`);
                this.releaseLocks(charKey);
                return;
            }

            const typingMs = Math.min(Math.max(response.length * 40, 1500), 4000);
            await new Promise(resolve => setTimeout(resolve, typingMs));

            const sentMessage = await channel.send(response);
            this.addMessage(channelId, character.name, response, sentMessage.id);

            // Update Cooldown
            this.channelCooldowns[channelId] = Date.now();

            this.releaseLocks(charKey);

            // Chain Reaction (Ensure dots are connected)
            if (channelId === config.channels.group && Math.random() < config.autoReplyChance) {
                const otherKeys = Object.keys(personalities).filter(k => k !== charKey);
                const nextKey = otherKeys[Math.floor(Math.random() * otherKeys.length)];
                
                // Add a slightly longer delay between chain reactions to stay under RPM
                const reactionDelay = config.chainReactionDelay + (Math.random() * 8000) + 5000;
                setTimeout(() => this.queueResponse(nextKey, channelId), reactionDelay);
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
            this.resetAutoTalkTimer(config.channels.group);
        } else {
            if (this.autoTalkTimeouts[config.channels.group]) {
                clearTimeout(this.autoTalkTimeouts[config.channels.group]);
            }
        }
    }
}

module.exports = new RPOrchestrator();
