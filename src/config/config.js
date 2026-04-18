require('dotenv').config();

module.exports = {
    tokens: {
        monika: process.env.MONIKA_TOKEN,
        sayori: process.env.SAYORI_TOKEN,
        yuri: process.env.YURI_TOKEN,
        natsuki: process.env.NATSUKI_TOKEN
    },
    channels: {
        group: process.env.GROUP_CHANNEL_ID,
        monika: process.env.MONIKA_CHANNEL_ID,
        sayori: process.env.SAYORI_CHANNEL_ID,
        yuri: process.env.YURI_CHANNEL_ID,
        natsuki: process.env.NATSUKI_CHANNEL_ID
    },
    groq: {
        apiKey: process.env.GROQ_API_KEY,
        model: process.env.GROQ_MODEL || 'llama-3.3-70b-versatile'
    },
    port: process.env.PORT || 3000,
    // RP Settings
    minDelay: 60000, // 1 minute
    maxDelay: 180000, // 3 minutes
    chainReactionDelay: 12000, // 12 seconds
    autoReplyChance: 0.6
};
