'use strict';
require('dotenv').config();
const { GoogleGenAI } = require('@google/genai');

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

function pcmToWav(pcmBuffer, sampleRate = 24000, numChannels = 1, bitDepth = 16) {
    const dataSize = pcmBuffer.length;
    const header = Buffer.alloc(44);
    header.write('RIFF', 0);
    header.writeUInt32LE(36 + dataSize, 4);
    header.write('WAVE', 8);
    header.write('fmt ', 12);
    header.writeUInt32LE(16, 16);
    header.writeUInt16LE(1, 20);
    header.writeUInt16LE(numChannels, 22);
    header.writeUInt32LE(sampleRate, 24);
    header.writeUInt32LE(sampleRate * numChannels * (bitDepth / 8), 28);
    header.writeUInt16LE(numChannels * (bitDepth / 8), 32);
    header.writeUInt16LE(bitDepth, 34);
    header.write('data', 36);
    header.writeUInt32LE(dataSize, 40);
    return Buffer.concat([header, pcmBuffer]);
}

/**
 * Generate speech. Returns a WAV Buffer (not a file path).
 */
async function generateSpeech(text) {
    const VOICE = 'Orus';

    const tryModel = async (model, inputText = text) => {
        const response = await ai.models.generateContent({
            model,
            contents: [{ parts: [{ text: inputText }] }],
            config: {
                responseModalities: ['AUDIO'],
                speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: VOICE } } },
            },
        });
        const audioPart = response?.candidates?.[0]?.content?.parts?.[0];
        if (!audioPart?.inlineData?.data) throw new Error('No audio data in response');
        return Buffer.from(audioPart.inlineData.data, 'base64');
    };

    const isQuotaError = (e) =>
        e?.status === 429 ||
        String(e?.message || '').includes('429') ||
        String(e?.message || '').includes('RESOURCE_EXHAUSTED');

    let pcmBuffer = null;
    try {
        pcmBuffer = await tryModel('gemini-2.5-flash-preview-tts');
    } catch (e) {
        if (!isQuotaError(e)) {
            console.error('❌ TTS error on primary model:', e.message);
            return null;
        }
        console.warn('⚠️ Quota hit on TTS — switching to fallback pipeline...');
        try {
            const textResponse = await ai.models.generateContent({
                model: 'gemini-2.5-flash',
                contents: [{ parts: [{ text: `Rewrite the following for natural text-to-speech delivery. Keep the same meaning and language. Return only the rewritten text, no commentary:\n\n${text}` }] }],
            });
            const preparedText = textResponse.text?.trim() || text;
            pcmBuffer = await tryModel('gemini-3.1-flash-preview-tts', preparedText);
        } catch (e2) {
            console.error('❌ Fallback TTS pipeline failed:', e2.message);
            return null;
        }
    }

    if (!pcmBuffer) return null;
    return pcmToWav(pcmBuffer);
}

module.exports = { generateSpeech };
