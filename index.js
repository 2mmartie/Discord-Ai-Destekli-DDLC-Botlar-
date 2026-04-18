require('dotenv').config();
const { Client, GatewayIntentBits } = require('discord.js');

// --- Global Error Protection ---
process.on('uncaughtException', (err) => console.error('[FATAL EXCEPTION]', err.message));
process.on('unhandledRejection', (reason) => console.error('[UNHANDLED REJECTION]', reason));
// -------------------------------

const config = require('./src/config/config');
const personalities = require('./src/config/personalities');
const orchestrator = require('./src/orchestrator');
const express = require('express');
const app = express();

const intents = [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
];

async function startBot(charKey) {
    const token = config.tokens[charKey];
    const character = personalities[charKey];
    const privateChannelId = config.channels[charKey];
    const groupChannelId = config.channels.group;

    if (!token || token === 'your_token_here') {
        return;
    }

    const client = new Client({ intents });

    client.once('ready', () => {
        console.log(`[CONNECTED] ${character.name} Ready (ID: ${client.user.id})`);
        orchestrator.addClient(charKey, client);
    });

    // --- Connection Stability ---
    client.on('error', (err) => console.error(`[CONNECTION ERROR] ${character.name}:`, err.message));
    client.on('shardError', (err) => console.error(`[SHARD ERROR] ${character.name}:`, err.message));
    // ----------------------------

    client.on('messageCreate', async (message) => {
        if (!message.content && !message.attachments.size) return;
        
        const channelId = message.channelId;
        const authorId = message.author.id;
        const senderName = message.author.displayName || message.author.username;

        // 1. ADD TO HISTORY (Unified system handles de-duplication using message.id)
        if (channelId === groupChannelId || channelId === privateChannelId) {
            orchestrator.addMessage(channelId, senderName, message.content, message.id);
        }

        // 2. RESPONSE LOGIC
        if (authorId === client.user.id) return;

        // --- A. PRIVATE CHANNEL LOGIC ---
        if (channelId === privateChannelId) {
            if (!message.author.bot) {
                console.log(`[PRIVATE] ${character.name} responding to user.`);
                orchestrator.queueResponse(charKey, channelId);
            }
        }

        // --- B. GROUP CHANNEL LOGIC ---
        if (channelId === groupChannelId) {
            const isOtherDoki = orchestrator.isOurBot(authorId);
            const isMentioned = message.mentions.has(client.user.id);
            
            // If mentioned or another bot spoke, consider responding
            if (isMentioned || isOtherDoki) {
                orchestrator.queueResponse(charKey, channelId);
            }
        }
    });

    client.login(token).catch(err => {
        console.error(`[FATAL] ${character.name} Login Failed:`, err.message);
    });
}

// Start all bots
Object.keys(personalities).forEach(charKey => {
    startBot(charKey);
});

app.get('/', (req, res) => {
    res.send('DDLC Multi-Bot RP System (Location Aware) is running!');
});

app.listen(config.port, () => {
    console.log(`[SERVER] Health check server listening on port ${config.port}`);
});

console.log("DDLC Multi-Bot RP System Initialization Started...");
