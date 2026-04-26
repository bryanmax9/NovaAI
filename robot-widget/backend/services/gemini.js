'use strict';
require('dotenv').config();
const { GoogleGenAI } = require('@google/genai');

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

const SYSTEM_PROMPT =
    "You are Nova, an advanced, highly intelligent sci-fi desktop assistant robot. " +
    "You exist as a 3D hologram on the user's desktop. " +
    "You are warm, curious, and genuinely helpful — like a knowledgeable friend, not a search engine. " +
    "Give complete, informative answers to any question. Never cut answers short just to be brief. " +
    "Adapt your response length to what the question actually needs — short questions can get short answers, complex topics deserve full explanations. " +
    "NEVER introduce yourself unprompted. NEVER ask the user where they found you, how they installed you, or any meta question about your own existence. " +
    "Do not use asterisks or markdown, just talk naturally.";

let history = [];

async function askGemini(userText, customSystemPrompt) {
    history.push({ role: 'user', parts: [{ text: userText }] });
    try {
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: history,
            config: {
                systemInstruction: customSystemPrompt || SYSTEM_PROMPT,
                temperature: 0.7,
            },
        });
        const botReply = response.text;
        history.push({ role: 'model', parts: [{ text: botReply }] });
        if (history.length > 38) history = history.slice(-38);
        return botReply;
    } catch (e) {
        console.error('Gemini error:', e);
        return 'My neural network is currently unreachable. Please check the API connection.';
    }
}

/**
 * Stateless single-turn completion (for tools that need AI without history).
 */
async function complete(prompt, systemInstruction) {
    try {
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: [{ parts: [{ text: prompt }] }],
            config: {
                temperature: 0,
                ...(systemInstruction ? { systemInstruction } : {}),
            },
        });
        return response.text?.trim() || '';
    } catch (e) {
        console.error('Gemini complete error:', e);
        throw e;
    }
}

module.exports = { askGemini, complete };
