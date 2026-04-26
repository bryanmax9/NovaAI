'use strict';
require('dotenv').config();
const express    = require('express');
const cors       = require('cors');
const http       = require('http');
const { WebSocketServer } = require('ws');

const { generateSpeech }            = require('./services/tts.js');
const { transcribeAudio }           = require('./services/stt.js');
const { askGemini, complete }       = require('./services/gemini.js');
const { handleSendEmailTool, handleListContactsTool } = require('./services/gmail.js');
const { handleCalendarActionTool }  = require('./services/calendar.js');
const { handleImageGenerationTool } = require('./services/image_gen.js');
const { handleVideoGenerationTool, startVideoGeneration, pollVideoStatus } = require('./services/video_gen.js');
const { getAuthUrl, exchangeCodeForToken, createAuthClientFromToken } = require('./services/google_auth.js');
const { attachLiveProxy }           = require('./services/live_proxy.js');

const app    = express();
const server = http.createServer(app);
const wss    = new WebSocketServer({ server, path: '/ws/live' });

app.use(cors());
app.use(express.json({ limit: '50mb' }));

// ── Helper: extract per-user Google token from request header ─────────────────
function getTokenFromRequest(req) {
    const raw = req.headers['x-google-token'];
    if (!raw) return null;
    try { return JSON.parse(raw); } catch (_) { return null; }
}

// ── Health ─────────────────────────────────────────────────────────────────────
app.get('/health', (_req, res) => res.json({ status: 'ok', ts: Date.now() }));

// ── Auth ───────────────────────────────────────────────────────────────────────
// Returns the Google OAuth consent URL. Redirect URI is localhost:3141 on the
// USER'S machine — each user's Electron app catches the callback locally.
app.get('/api/auth/url', (_req, res) => {
    try {
        res.json({ url: getAuthUrl() });
    } catch (e) {
        console.error('[/api/auth/url]', e.message);
        res.status(500).json({ error: e.message });
    }
});

// Exchange the OAuth code (caught locally by the Electron app) for tokens.
// Returns the full token JSON to the frontend — the frontend stores it locally.
app.post('/api/auth/exchange', async (req, res) => {
    const { code } = req.body;
    if (!code) return res.status(400).json({ error: 'code required' });
    try {
        const tokens = await exchangeCodeForToken(code);
        res.json({ tokens });
    } catch (e) {
        console.error('[/api/auth/exchange]', e.message);
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
    const { audio } = req.body;
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
            const { GoogleGenAI } = require('@google/genai');
            const _ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
            const response = await _ai.models.generateContent({
                model: 'gemini-2.5-flash',
                contents: [{
                    role: 'user',
                    parts: [
                        { inlineData: { mimeType: 'image/png', data: imageBase64 } },
                        { text },
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
// Reads the user's Google token from the X-Google-Token header.
app.post('/api/email/send', async (req, res) => {
    try {
        const token = getTokenFromRequest(req);
        if (!token) return res.status(401).json({ error: 'auth_required', message: 'No Google token provided.' });
        const { client, refreshedToken } = await createAuthClientFromToken(token);
        const result = await handleSendEmailTool(req.body, client, (msg) => console.log('[Email]', msg));
        if (refreshedToken) result.refreshedToken = refreshedToken;
        res.json(result);
    } catch (e) {
        console.error('[/api/email/send]', e.message);
        res.status(500).json({ error: e.message });
    }
});

app.get('/api/email/contacts', async (req, res) => {
    try {
        const token = getTokenFromRequest(req);
        if (!token) return res.status(401).json({ error: 'auth_required', message: 'No Google token provided.' });
        const { client, refreshedToken } = await createAuthClientFromToken(token);
        const limit  = Math.min(Math.max(parseInt(req.query.limit || '10'), 1), 30);
        const result = await handleListContactsTool({ limit }, client);
        if (refreshedToken) result.refreshedToken = refreshedToken;
        res.json(result);
    } catch (e) {
        console.error('[/api/email/contacts]', e.message);
        res.status(500).json({ error: e.message });
    }
});

// ── Calendar ───────────────────────────────────────────────────────────────────
app.post('/api/calendar', async (req, res) => {
    try {
        const token = getTokenFromRequest(req);
        if (!token) return res.status(401).json({ error: 'auth_required', message: 'No Google token provided.' });
        const { client, refreshedToken } = await createAuthClientFromToken(token);
        const result = await handleCalendarActionTool(req.body, client, (msg) => console.log('[Calendar]', msg));
        if (refreshedToken) result.refreshedToken = refreshedToken;
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

// ── Video Generation ───────────────────────────────────────────────────────────
const videoJobs = new Map();

app.post('/api/videos/start', async (req, res) => {
    try {
        const { operationName, prompt } = await startVideoGeneration(req.body);
        videoJobs.set(operationName, { status: 'pending', prompt });
        res.json({ operationName });
        (async () => {
            const INTERVAL = 8000;
            const MAX_POLLS = 45;
            for (let i = 0; i < MAX_POLLS; i++) {
                await new Promise(r => setTimeout(r, INTERVAL));
                const poll = await pollVideoStatus(operationName).catch(e => ({ status: 'error', message: e.message }));
                if (poll.status === 'completed') { videoJobs.set(operationName, { status: 'completed', ...poll }); return; }
                if (poll.status === 'error')     { videoJobs.set(operationName, { status: 'error', message: poll.message }); return; }
            }
            videoJobs.set(operationName, { status: 'error', message: 'Timed out after 6 minutes' });
        })();
    } catch (e) {
        console.error('[/api/videos/start]', e.message);
        res.status(500).json({ error: e.message });
    }
});

app.get('/api/videos/status/:opId(*)', (req, res) => {
    const job = videoJobs.get(req.params.opId);
    if (!job) return res.status(404).json({ error: 'Job not found' });
    res.json(job);
});

app.post('/api/videos', async (req, res) => {
    if (req.body.action === 'generate') return res.status(400).json({ error: 'Use /api/videos/start' });
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
    console.log(`[WS] Client connected from ${req.socket.remoteAddress}`);
    attachLiveProxy(ws);
    ws.on('close', () => console.log(`[WS] Client disconnected`));
});

// ── Start ──────────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
    console.log(`🚀 Nova backend running on port ${PORT}`);
    console.log(`   REST API:  http://localhost:${PORT}/api/...`);
    console.log(`   Live WS:   ws://localhost:${PORT}/ws/live`);
});
