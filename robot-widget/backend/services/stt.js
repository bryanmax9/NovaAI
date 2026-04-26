'use strict';
require('dotenv').config();
const { GoogleGenAI } = require('@google/genai');

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

async function transcribeAudio(audioBuffer) {
    const base64Audio = Buffer.isBuffer(audioBuffer)
        ? audioBuffer.toString('base64')
        : audioBuffer; // already base64

    try {
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: [{
                parts: [
                    { inlineData: { mimeType: 'audio/webm', data: base64Audio } },
                    { text: 'Please transcribe this audio accurately. Return only the spoken words with no extra commentary.' },
                ],
            }],
        });
        return response.text?.trim() || '';
    } catch (error) {
        if (error.status === 400) return '';
        console.error('❌ STT failed:', error);
        throw error;
    }
}

module.exports = { transcribeAudio };
