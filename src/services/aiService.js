const Groq = require('groq-sdk');
const config = require('../config/config');

if (!config.groq.apiKey) {
    console.error('[AI FATAL] GROQ_API_KEY is missing! Check your environment variables.');
}

const groq = new Groq({
    apiKey: config.groq.apiKey || 'missing_key'
});

/**
 * LLAMA 3.1 8B - High speed, low token usage, perfect for free tier and Turkish.
 */
const STABLE_MODEL = config.groq.model || "llama-3.1-8b-instant";

async function generateResponse(character, history, channelId, retries = 3) {
    const isGroup = channelId === config.channels.group;
    
    let locationContext = isGroup 
        ? `ORTAM: Kulüp odasındasın. Diğer kızlarla (Monika, Sayori, Yuri, Natsuki) birliktesin. İnsanları görmezden gel, kızlara laf at.`
        : `ORTAM: Kendi odandasın. Sadece şu anki kullanıcı ile samimi ve birebir sohbet ediyorsun.`;

    const systemPrompt = `SEN: ${character.personality}

${locationContext}

KONUŞMA KURALLARI (KRİTİK):
1. **Düzgün Türkçe**: Asla devrik cümle kurma. Mantıklı, akıcı ve gramer hatası olmayan bir Türkçe kullan.
2. **Samimiyet ve Mantık**: Karakterinin duygularını yansıt ama her zaman mantıklı ve tutarlı kal. Konuşma geçmişine sıkı sıkıya bağlı kal, önceki konuları unutma ve konudan sapma.
3. **Etkileşim**: Gruptaki diğer karakterlerin (Monika, Sayori, Yuri, Natsuki) söylediklerine net ve odaklanmış tepkiler ver. Onlara doğrudan hitap et veya onlarla nazikçe tartış.
4. **Kısa ve Öz**: Gereksiz yere uzatma, maksimum 2-3 cümlelik doğal cevaplar ver.
5. **Kimlik**: Sadece ${character.name} olarak cevap ver.`;

    try {
        console.log(`[AI] Requesting response for ${character.name} (${STABLE_MODEL})...`);
        
        const chatCompletion = await groq.chat.completions.create({
            messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content: `Son Konuşma Geçmişi:\n${history}\n\n${character.name}, doğal bir cevap ver.` }
            ],
            model: STABLE_MODEL,
            temperature: 0.45,
            max_tokens: 250,
            top_p: 0.9,
            frequency_penalty: 0.5,
            presence_penalty: 0.4,
        });

        console.log(`[AI] Response received for ${character.name}.`);

        const content = chatCompletion.choices[0]?.message?.content?.trim();
        return content || null;
    } catch (error) {
        // Handle Rate Limits (429) or Server Errors (500+)
        if (retries > 0 && (error.status === 429 || error.status >= 500)) {
            const waitTime = Math.pow(2, 4 - retries) * 3000 + (Math.random() * 2000); 
            console.warn(`[RATE LIMIT/ERROR] ${character.name}: ${error.status}. Retrying in ${Math.round(waitTime/1000)}s...`);
            await new Promise(resolve => setTimeout(resolve, waitTime));
            return generateResponse(character, history, channelId, retries - 1);
        }
        
        console.error(`[AI FATAL ERROR] ${character.name}:`, error.message);
        return null; 
    }
}

module.exports = { generateResponse };

