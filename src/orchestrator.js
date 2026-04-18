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
    }

    addClient(charKey, client) {
        this.clients[charKey] = client;
        
        // When all clients are ready, kickstart the group channel if needed
        setTimeout(() => {
            if (Object.keys(this.clients).length === 4) {
                this.resetAutoTalkTimer(config.channels.group);
            }
        }, 5000);
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
        return (this.histories[channelId] || []).join('\n');
    }

    resetAutoTalkTimer(channelId) {
        if (!channelId || channelId.includes('PASTE')) return;
        if (!this.isWorkingHours()) return;
        
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

        // Higher rejection chance in group chat to avoid spam
        const rejectionChance = channelId === config.channels.group ? 0.65 : 0.05;
        if (Math.random() < rejectionChance) return;

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

            // Chain Reaction (Optional Follow-up)
            if (channelId === config.channels.group && Math.random() < config.autoReplyChance) {
                const otherKeys = Object.keys(personalities).filter(k => k !== charKey);
                const nextKey = otherKeys[Math.floor(Math.random() * otherKeys.length)];
                setTimeout(() => this.queueResponse(nextKey, channelId), config.chainReactionDelay + (Math.random() * 5000));
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
}

module.exports = new RPOrchestrator();
