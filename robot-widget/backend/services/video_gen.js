'use strict';
require('dotenv').config();
const fs   = require('fs');
const path = require('path');

const GEMINI_API_BASE   = 'https://generativelanguage.googleapis.com/v1beta';
const VEO_MODEL         = 'veo-2.0-generate-001';
const POLL_INTERVAL_MS  = 8000;
const MAX_POLL_ATTEMPTS = 45;

const STYLE_PREFIXES = {
    cinematic:   'Hollywood cinematic quality, dramatic depth of field, professional color grading, movie-grade cinematography.',
    animated:    'High-quality 3D animation, fluid character motion, vivid colors, studio-quality rendering.',
    documentary: 'Documentary-style realism, naturalistic handheld camera, authentic soft lighting, observational framing.',
    nature:      'Nature documentary quality, macro detail, David Attenborough aesthetic, pristine natural lighting.',
    'sci-fi':    'Epic sci-fi aesthetic, futuristic neon lighting, advanced technology visuals, otherworldly atmosphere.',
    commercial:  'High-end commercial production, polished clean look, aspirational lifestyle feel, sharp focus.',
};

function buildVideoPrompt({ subject, style, setting, characters, dialogue_script, camera_style, mood_color }) {
    const parts = [];
    const stylePrefix = STYLE_PREFIXES[style] || 'Professional quality video.';
    parts.push(stylePrefix);
    parts.push(subject);
    if (setting)         parts.push(`Setting: ${setting}.`);
    if (characters)      parts.push(`Characters: ${characters}.`);
    if (dialogue_script) parts.push(`Scene and dialogue: ${dialogue_script}.`);
    if (camera_style)    parts.push(`Camera: ${camera_style}.`);
    if (mood_color)      parts.push(`Color and mood: ${mood_color}.`);
    parts.push('8-second continuous shot, smooth motion throughout, coherent narrative arc, 4K ultra-high definition, cinematic composition, no jump cuts.');
    return parts.join(' ');
}

function sanitizeFilename(name) {
    return name.replace(/[\/\\:*?"<>|]/g, '-').replace(/\s+/g, '_').trim().slice(0, 50);
}

/**
 * Starts video generation. Returns { operationName } immediately.
 * The caller should poll using pollVideoStatus().
 */
async function startVideoGeneration(args) {
    const {
        subject, style = 'cinematic', setting, characters,
        dialogue_script, camera_style, mood_color, aspect_ratio = 'landscape',
    } = args;

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error('GEMINI_API_KEY is not set');
    if (!subject) throw new Error('subject is required for video generation');

    const prompt = buildVideoPrompt({ subject, style, setting, characters, dialogue_script, camera_style, mood_color });
    const ratio   = aspect_ratio === 'portrait' ? '9:16' : aspect_ratio === 'square' ? '1:1' : '16:9';

    const url     = `${GEMINI_API_BASE}/models/${VEO_MODEL}:predictLongRunning?key=${apiKey}`;
    const payload = {
        instances: [{ prompt }],
        parameters: { aspectRatio: ratio, sampleCount: 1 },
    };

    const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
    });

    if (!res.ok) {
        const errText = await res.text();
        throw new Error(`Veo generation failed: ${errText}`);
    }

    const data = await res.json();
    const operationName = data.name;
    if (!operationName) throw new Error('No operation name in Veo response');

    console.log(`🎥 [VideoGen] Operation started: ${operationName}`);
    return { operationName, prompt };
}

/**
 * Polls the operation ONCE. Returns:
 *   { status: 'pending' }
 *   { status: 'completed', videoUri, mimeType }
 *   { status: 'error', message }
 */
async function pollVideoStatus(operationName) {
    const apiKey = process.env.GEMINI_API_KEY;
    const url = `${GEMINI_API_BASE}/${operationName}?key=${apiKey}`;

    const res = await fetch(url);
    if (!res.ok) {
        const errText = await res.text();
        return { status: 'error', message: `Poll failed: ${errText}` };
    }

    const data = await res.json();

    if (data.done) {
        const video = data.response?.predictions?.[0]?.bytesBase64Encoded
            ? { type: 'base64', data: data.response.predictions[0].bytesBase64Encoded, mimeType: 'video/mp4' }
            : data.response?.predictions?.[0]?.video
            ? { type: 'uri', uri: data.response.predictions[0].video.uri, mimeType: data.response.predictions[0].video.mimeType || 'video/mp4' }
            : null;

        if (!video) {
            const errMsg = data.error?.message || 'No video in completed operation';
            return { status: 'error', message: errMsg };
        }
        return { status: 'completed', ...video };
    }

    return { status: 'pending' };
}

/**
 * Full generation with polling — kept for legacy/non-Heroku use.
 * Returns { status, speak } with downloadUrl or base64.
 */
async function generateVideoSync(args, logFn = console.log) {
    try {
        const { operationName } = await startVideoGeneration(args);
        logFn(`🎥 [VideoGen] Polling operation: ${operationName}`);

        for (let i = 0; i < MAX_POLL_ATTEMPTS; i++) {
            await new Promise(r => setTimeout(r, POLL_INTERVAL_MS));
            const poll = await pollVideoStatus(operationName);
            logFn(`🎥 [VideoGen] Poll ${i + 1}: status=${poll.status}`);
            if (poll.status === 'completed') {
                return {
                    status:        'completed',
                    operationName,
                    videoData:     poll.type === 'base64' ? poll.data : null,
                    videoUri:      poll.type === 'uri'    ? poll.uri  : null,
                    mimeType:      poll.mimeType,
                    speak:         'Your video is ready! I\'m saving it to your Videos folder now.',
                };
            }
            if (poll.status === 'error') {
                return { status: 'error', speak: `Video generation failed: ${poll.message}` };
            }
        }
        return { status: 'error', speak: 'Video generation timed out. The server took too long to process your video.' };
    } catch (e) {
        return { status: 'error', speak: `Video generation error: ${e.message}` };
    }
}

// ── Prompt cache helpers (for list/delete operations) ─────────────────────────

function getNovaCacheDir() {
    return path.join(process.env.HOME || '/tmp', 'Nova', 'video_prompts');
}

function listPrompts() {
    const dir = getNovaCacheDir();
    if (!fs.existsSync(dir)) return [];
    return fs.readdirSync(dir)
        .filter(f => f.endsWith('.json'))
        .map(f => { try { return JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')); } catch { return null; } })
        .filter(Boolean)
        .sort((a, b) => b.created.localeCompare(a.created));
}

function deletePrompt(promptId) {
    const dir = getNovaCacheDir();
    const filePath = path.join(dir, `${promptId}.json`);
    if (fs.existsSync(filePath)) { fs.unlinkSync(filePath); return true; }
    return false;
}

async function handleVideoGenerationTool(args, logFn = console.log) {
    const action = args.action || 'generate';

    if (action === 'list_prompts') {
        const prompts = listPrompts();
        if (prompts.length === 0) return { status: 'ok', speak: 'You have no saved video prompts yet.' };
        const list = prompts.slice(0, 10).map((p, i) => `${i + 1}. "${p.title}" (${p.id})`).join('\n');
        return { status: 'ok', speak: `You have ${prompts.length} saved prompt${prompts.length !== 1 ? 's' : ''}:\n${list}` };
    }

    if (action === 'delete_prompt') {
        const { prompt_id_to_delete } = args;
        if (!prompt_id_to_delete) return { status: 'error', speak: 'I need the prompt ID to delete it.' };
        const deleted = deletePrompt(prompt_id_to_delete);
        return { status: deleted ? 'ok' : 'error', speak: deleted ? 'Prompt deleted.' : 'Prompt not found.' };
    }

    // action === 'generate'
    return await generateVideoSync(args, logFn);
}

module.exports = { handleVideoGenerationTool, startVideoGeneration, pollVideoStatus };
