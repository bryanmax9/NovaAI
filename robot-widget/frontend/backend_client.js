'use strict';
// HTTP helper for the Electron main process to call the Nova backend.
// Automatically injects the user's Google token (X-Google-Token header)
// into every request so the backend can make per-user Google API calls.

const { BACKEND_URL } = require('./config.js');

// Loaded once at startup; updated whenever OAuth completes.
let _googleToken = null;

function setGoogleToken(token) { _googleToken = token; }
function getGoogleToken()      { return _googleToken; }

function _authHeaders() {
    const h = { 'Content-Type': 'application/json' };
    if (_googleToken) h['X-Google-Token'] = JSON.stringify(_googleToken);
    return h;
}

async function post(path, body) {
    const res = await fetch(`${BACKEND_URL}${path}`, {
        method:  'POST',
        headers: _authHeaders(),
        body:    JSON.stringify(body),
    });
    if (!res.ok) {
        const errText = await res.text();
        throw new Error(`Backend ${path} failed (${res.status}): ${errText}`);
    }
    return res.json();
}

async function get(path) {
    const res = await fetch(`${BACKEND_URL}${path}`, { headers: _authHeaders() });
    if (!res.ok) {
        const errText = await res.text();
        throw new Error(`Backend GET ${path} failed (${res.status}): ${errText}`);
    }
    return res.json();
}

/**
 * Single-turn completion via the backend (stateless).
 * Replaces direct Gemini SDK calls in notes.js, calendar.js, code_agent.js.
 */
async function complete(prompt, systemInstruction) {
    const data = await post('/api/chat', { message: prompt, systemPrompt: systemInstruction, stateless: true });
    return data.text || '';
}

/**
 * Multi-turn conversation chat.
 */
async function chat(message) {
    const data = await post('/api/chat', { message });
    return data.text || '';
}

/**
 * Generate speech — returns base64 WAV string.
 */
async function generateSpeech(text) {
    const data = await post('/api/tts', { text });
    return data.audio || null;
}

/**
 * Transcribe audio — audioBase64 is a base64 string.
 */
async function transcribeAudio(audioBase64) {
    const data = await post('/api/stt', { audio: audioBase64 });
    return data.text || '';
}

/**
 * Analyze screen — imageBase64 is a base64 PNG.
 */
async function analyzeScreenImage(imageBase64, question) {
    const data = await post('/api/chat', {
        message: question + '\n\nImage data (base64 PNG):\n[IMAGE_ATTACHED]',
        // We send as a separate field for the backend to handle multimodal input
        systemPrompt: 'You are analyzing a screenshot of a desktop. Be concise — 2 to 4 sentences max unless the user asked for something detailed. Speak naturally as if describing it to someone who cannot see the screen.',
        stateless: true,
        imageBase64,
    });
    return data.text || '';
}

module.exports = { complete, chat, generateSpeech, transcribeAudio, analyzeScreenImage, post, get, setGoogleToken, getGoogleToken };
