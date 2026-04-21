const Groq = require('groq-sdk');
const config = require('../config/config');

const groq = new Groq({
    apiKey: config.groq.apiKey
});

/**
 * MIXTRAL 8x7B - Middle ground between 70B and 8B. Good Turkish support.
 */
const STABLE_MODEL = config.groq.model || "mixtral-8x7b-32768";

async function generateResponse(character, history, channelId, retries = 3) {
    const isGroup = channelId === config.channels.group;
    
    let locationContext = isGroup 
        ? `ORTAM: Kulüp odasındasın. Diğer kızlarla (Monika, Sayori, Yuri, Natsuki) birliktesin. İnsanları görmezden gel, kızlara laf at.`
        : `ORTAM: Kendi odandasın. Sadece şu anki kullanıcı ile samimi ve birebir sohbet ediyorsun.`;

    const systemPrompt = `SEN: ${character.personality}

${locationContext}

KONUŞMA KURALLARI (KRİTİK):
1. **Düzgün Türkçe**: Asla devrik cümle kurma. Mantıklı, akıcı ve gramer hatası olmayan bir Türkçe kullan.
2. **Samimiyet ve Mantık**: Karakterinin duygularını yansıt ama mantık çerçevesinden çıkma. Saçma sapan, anlamsız ifadelerden kaçın.
3. **Etkileşim**: Gruptaki diğer karakterlerin (Monika, Sayori, Yuri, Natsuki) söylediklerine tepki ver, onlara laf at veya onlarla sohbete gir.
4. **Kısa ve Öz**: Gereksiz yere uzatma, maksimum 2-3 cümlelik doğal cevaplar ver.
5. **Kimlik**: Sadece ${character.name} olarak cevap ver.

KONUŞMA GEÇMİŞİ:
${history}`;

    try {
        const chatCompletion = await groq.chat.completions.create({
            messages: [{ role: "system", content: systemPrompt }],
            model: STABLE_MODEL,
            temperature: 0.45, // Logic-favored balance
            max_tokens: 250,
            top_p: 0.9,
            frequency_penalty: 0.5,
            presence_penalty: 0.4,
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
