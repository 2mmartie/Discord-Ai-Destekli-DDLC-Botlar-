const Groq = require('groq-sdk');
const config = require('../config/config');

const groq = new Groq({
    apiKey: config.groq.apiKey
});

/**
 * GEMMA 2 (9B-IT) - Perfect balance between Turkish quality and Quota efficiency.
 * Low temperature (0.4) for maximum consistency.
 */
const STABLE_MODEL = config.groq.model || "gemma2-9b-it";

async function generateResponse(character, history, channelId, retries = 3) {
    const isGroup = channelId === config.channels.group;
    
    let locationContext = isGroup 
        ? `ORTAM: Kulüp odasındasın. Diğer kızlarla (Monika, Sayori, Yuri, Natsuki) birliktesin. İnsanları görmezden gel, kızlara laf at.`
        : `ORTAM: Kendi odandasın. Sadece şu anki kullanıcı ile samimi ve birebir sohbet ediyorsun.`;

    const systemPrompt = `SYSTEM: ${character.personality}\n\n${locationContext}\n\nKonuşma Geçmişi:\n${history}\n\nKURALLAR:\n1. %100 DOĞAL TÜRKÇE konuş. Saçma sapan veya uydurma kelimeler kullanma.\n2. Samimi bir lise dili kullan, resmiyetten kaçın.\n3. Sadece ${character.name} olarak cevap ver.`;

    try {
        const chatCompletion = await groq.chat.completions.create({
            messages: [{ role: "system", content: systemPrompt }],
            model: STABLE_MODEL,
            temperature: 0.5, // Slightly increased for more natural flow
            max_tokens: 300,
            top_p: 1,
            frequency_penalty: 0.4,
            presence_penalty: 0.3,
        });

        const content = chatCompletion.choices[0]?.message?.content?.trim();
        return content || null;
    } catch (error) {
        // Handle Rate Limits (429) or Server Errors (500+)
        if (retries > 0 && (error.status === 429 || error.status >= 500)) {
            const waitTime = Math.pow(2, 4 - retries) * 3000 + (Math.random() * 2000); // More aggressive backoff
            console.warn(`[RATE LIMIT/ERROR] ${character.name}: ${error.status}. Retrying in ${Math.round(waitTime/1000)}s...`);
            await new Promise(resolve => setTimeout(resolve, waitTime));
            return generateResponse(character, history, channelId, retries - 1);
        }
        
        console.error(`[AI FATAL ERROR] ${character.name}:`, error.message);
        return null; // Silent failure to break loops
    }
}

module.exports = { generateResponse };
