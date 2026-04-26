'use strict';
require('dotenv').config();
const express    = require('express');
const cors       = require('cors');
const http       = require('http');
const { WebSocketServer } = require('ws');
const { URL }    = require('url');

const { generateSpeech }            = require('./services/tts.js');
const { transcribeAudio }           = require('./services/stt.js');
const { askGemini, complete }       = require('./services/gemini.js');
const { handleSendEmailTool, handleListContactsTool } = require('./services/gmail.js');
const { handleCalendarActionTool }  = require('./services/calendar.js');
const { handleImageGenerationTool } = require('./services/image_gen.js');
const { handleVideoGenerationTool, startVideoGeneration, pollVideoStatus } = require('./services/video_gen.js');
const { isAuthenticated, startOAuthFlow } = require('./services/google_auth.js');
const { attachLiveProxy }           = require('./services/live_proxy.js');

const app    = express();
const server = http.createServer(app);
const wss    = new WebSocketServer({ server, path: '/ws/live' });

app.use(cors());
app.use(express.json({ limit: '50mb' }));

// ── Health ─────────────────────────────────────────────────────────────────────
app.get('/health', (_req, res) => res.json({ status: 'ok', ts: Date.now() }));

// ── Auth ───────────────────────────────────────────────────────────────────────
app.get('/api/auth/status', (_req, res) => {
    res.json({ authenticated: isAuthenticated() });
});

app.post('/api/auth/start', async (_req, res) => {
    try {
        if (isAuthenticated()) return res.json({ already: true });
        const url = await startOAuthFlow();
        if (!url) return res.json({ already: true }); // flow in progress
        res.json({ url });
    } catch (e) {
        console.error('[/api/auth/start]', e.message);
        res.status(500).json({ error: e.message });
    }
});

// ── TTS ────────────────────────────────────────────────────────────────────────
app.post('/api/tts', async (req, res) => {
    const { text } = req.body;
    if (!text) return res.status(400).json({ error: 'text required' });
    try {
        const wavBuffer = await generateSpeech(text);
        if (!wavBuffer) return res.status(500).json({ error: 'TTS failed' });
        res.json({ audio: wavBuffer.toString('base64') });
    } catch (e) {
        console.error('[/api/tts]', e.message);
        res.status(500).json({ error: e.message });
    }
});

// ── STT ────────────────────────────────────────────────────────────────────────
app.post('/api/stt', async (req, res) => {
    const { audio } = req.body; // base64 audio
    if (!audio) return res.status(400).json({ error: 'audio required' });
    try {
        const text = await transcribeAudio(audio);
        res.json({ text });
    } catch (e) {
        console.error('[/api/stt]', e.message);
        res.status(500).json({ error: e.message });
    }
});

// ── Chat ───────────────────────────────────────────────────────────────────────
app.post('/api/chat', async (req, res) => {
    const { message, systemPrompt, stateless, prompt, imageBase64 } = req.body;
    const text = message || prompt;
    if (!text) return res.status(400).json({ error: 'message required' });
    try {
        let reply;
        if (imageBase64) {
            // Vision / screen analysis
            const { GoogleGenAI } = require('@google/genai');
            const _ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
            const response = await _ai.models.generateContent({
                model: 'gemini-2.5-flash',
                contents: [{
                    role: 'user',
                    parts: [
                        { inlineData: { mimeType: 'image/png', data: imageBase64 } },
                        { text: text },
                    ],
                }],
                config: systemPrompt ? { systemInstruction: systemPrompt } : {},
            });
            reply = response.text?.trim() || '';
        } else {
            reply = stateless
                ? await complete(text, systemPrompt)
                : await askGemini(text, systemPrompt);
        }
        res.json({ text: reply });
    } catch (e) {
        console.error('[/api/chat]', e.message);
        res.status(500).json({ error: e.message });
    }
});

// ── Email ──────────────────────────────────────────────────────────────────────
app.post('/api/email/send', async (req, res) => {
    try {
        const result = await handleSendEmailTool(req.body, null, (msg) => console.log('[Email]', msg));
        res.json(result);
    } catch (e) {
        console.error('[/api/email/send]', e.message);
        res.status(500).json({ error: e.message });
    }
});

app.get('/api/email/contacts', async (req, res) => {
    try {
        const limit  = Math.min(Math.max(parseInt(req.query.limit || '10'), 1), 30);
        const result = await handleListContactsTool({ limit });
        res.json(result);
    } catch (e) {
        console.error('[/api/email/contacts]', e.message);
        res.status(500).json({ error: e.message });
    }
});

// ── Calendar ───────────────────────────────────────────────────────────────────
app.post('/api/calendar', async (req, res) => {
    try {
        const result = await handleCalendarActionTool(req.body, (msg) => console.log('[Calendar]', msg));
        res.json(result);
    } catch (e) {
        console.error('[/api/calendar]', e.message);
        res.status(500).json({ error: e.message });
    }
});

// ── Image Generation ───────────────────────────────────────────────────────────
app.post('/api/images/generate', async (req, res) => {
    try {
        const result = await handleImageGenerationTool(req.body, (msg) => console.log('[ImageGen]', msg));
        res.json(result);
    } catch (e) {
        console.error('[/api/images/generate]', e.message);
        res.status(500).json({ error: e.message });
    }
});

// ── Video Generation (async polling) ──────────────────────────────────────────
// In-memory job store (sufficient for a single-user personal deployment).
const videoJobs = new Map(); // operationName → { status, videoUri?, base64?, mimeType?, prompt }

app.post('/api/videos/start', async (req, res) => {
    try {
        const { operationName, prompt } = await startVideoGeneration(req.body);
        videoJobs.set(operationName, { status: 'pending', prompt });
        res.json({ operationName });

        // Start background polling
        (async () => {
            const INTERVAL = 8000;
            const MAX_POLLS = 45;
            for (let i = 0; i < MAX_POLLS; i++) {
                await new Promise(r => setTimeout(r, INTERVAL));
                const poll = await pollVideoStatus(operationName).catch(e => ({ status: 'error', message: e.message }));
                if (poll.status === 'completed') {
                    videoJobs.set(operationName, { status: 'completed', ...poll });
                    console.log(`🎥 [VideoGen] Job complete: ${operationName}`);
                    return;
                }
                if (poll.status === 'error') {
                    videoJobs.set(operationName, { status: 'error', message: poll.message });
                    return;
                }
            }
            videoJobs.set(operationName, { status: 'error', message: 'Timed out after 6 minutes' });
        })();

    } catch (e) {
        console.error('[/api/videos/start]', e.message);
        res.status(500).json({ error: e.message });
    }
});

app.get('/api/videos/status/:opId(*)', (req, res) => {
    const opId = req.params.opId;
    const job  = videoJobs.get(opId);
    if (!job) return res.status(404).json({ error: 'Job not found' });
    res.json(job);
});

// Full sync endpoint for list_prompts / delete_prompt (fast ops)
app.post('/api/videos', async (req, res) => {
    const { action } = req.body;
    if (action === 'generate') {
        return res.status(400).json({ error: 'Use /api/videos/start for video generation' });
    }
    try {
        const result = await handleVideoGenerationTool(req.body, (msg) => console.log('[VideoGen]', msg));
        res.json(result);
    } catch (e) {
        console.error('[/api/videos]', e.message);
        res.status(500).json({ error: e.message });
    }
});

// ── Gemini Live WebSocket ──────────────────────────────────────────────────────
wss.on('connection', (ws, req) => {
    const ip = req.socket.remoteAddress;
    console.log(`[WS] Client connected from ${ip}`);
    attachLiveProxy(ws);
    ws.on('close', () => console.log(`[WS] Client disconnected from ${ip}`));
});

// ── Start ──────────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
    console.log(`🚀 Nova backend running on port ${PORT}`);
    console.log(`   REST API:  http://localhost:${PORT}/api/...`);
    console.log(`   Live WS:   ws://localhost:${PORT}/ws/live`);
    console.log(`   Auth:      ${isAuthenticated() ? '✅ Google authenticated' : '⚠️  Not authenticated (run npm run setup-google)'}`);
});
