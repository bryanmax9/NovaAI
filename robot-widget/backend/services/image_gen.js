'use strict';
require('dotenv').config();

const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

const IMAGE_MODELS = [
    'gemini-2.5-flash-image',
    'gemini-3.1-flash-image-preview',
    'gemini-3-pro-image-preview',
];
const MAX_BATCH = 6;

const STYLE_DESCRIPTORS = {
    realistic:    'photorealistic, ultra-detailed, high-resolution photograph, DSLR quality',
    cartoon:      'cartoon illustration style, bright colors, clean outlines, animated feel',
    anime:        'anime style, Japanese animation, detailed character art, vibrant colors',
    futuristic:   'futuristic sci-fi aesthetic, neon lights, advanced technology, cybernetic',
    fantasy:      'high fantasy art, magical atmosphere, epic landscape, detailed painterly style',
    oil_painting: 'oil painting style, rich textures, classical art technique, brushstroke detail',
    watercolor:   'watercolor painting, soft edges, translucent washes, artistic and dreamy',
    sketch:       'detailed pencil sketch, fine lines, cross-hatching, monochrome drawing',
    cyberpunk:    'cyberpunk aesthetic, neon-lit dystopia, rain-slicked streets, dark atmosphere',
    abstract:     'abstract art, bold geometric shapes, expressive colors, non-representational',
    '3d_render':  '3D render, physically-based rendering, studio lighting, ultra-realistic CGI',
};

const MOOD_DESCRIPTORS = {
    dark:       'dark, moody, shadowy atmosphere',
    bright:     'bright, vibrant, well-lit, cheerful',
    dramatic:   'dramatic lighting, high contrast, cinematic composition',
    calm:       'calm, serene, peaceful atmosphere, soft lighting',
    mysterious: 'mysterious, foggy, atmospheric depth, enigmatic',
    epic:       'epic scale, grand, awe-inspiring, heroic',
};

const ASPECT_HINTS = {
    square:    'square composition (1:1 aspect ratio)',
    landscape: 'wide landscape composition (16:9 aspect ratio)',
    portrait:  'tall portrait composition (9:16 aspect ratio)',
};

function buildFullPrompt(subjectPrompt, style, mood, extra_details, aspect_ratio) {
    const parts = [subjectPrompt];
    if (style && STYLE_DESCRIPTORS[style]) parts.push(STYLE_DESCRIPTORS[style]);
    if (mood  && MOOD_DESCRIPTORS[mood])   parts.push(MOOD_DESCRIPTORS[mood]);
    if (extra_details)                     parts.push(extra_details);
    if (aspect_ratio && ASPECT_HINTS[aspect_ratio]) parts.push(ASPECT_HINTS[aspect_ratio]);
    return parts.join(', ');
}

function sanitizeFilename(name) {
    return name.replace(/[\/\\:*?"<>|]/g, '-').replace(/\s+/g, '_').trim().slice(0, 50);
}

/**
 * Returns { base64, mimeType, filenameHint } instead of writing to disk.
 * The Electron frontend is responsible for saving the file locally.
 */
async function generateSingleImage({ subjectPrompt, style, mood, extra_details, aspect_ratio, filenameSlug }, logFn) {
    const fullPrompt = buildFullPrompt(subjectPrompt, style, mood, extra_details, aspect_ratio);
    logFn(`[ImageGen] subject="${subjectPrompt.slice(0, 70)}"`);

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error('GEMINI_API_KEY is not set');

    let lastError;
    for (let attempt = 0; attempt < IMAGE_MODELS.length; attempt++) {
        const model = IMAGE_MODELS[attempt];
        try {
            logFn(`[ImageGen] Attempt ${attempt + 1} model=${model}`);

            const url = `${GEMINI_API_BASE}/${model}:generateContent?key=${apiKey}`;
            const res = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: [{ role: 'user', parts: [{ text: `Generate an image: ${fullPrompt}` }] }],
                    generationConfig: { responseModalities: ['TEXT', 'IMAGE'] },
                }),
            });

            if (!res.ok) {
                const errText = await res.text();
                throw new Error(errText);
            }

            const data = await res.json();
            const parts = data.candidates?.[0]?.content?.parts || [];
            const imagePart = parts.find(p => p.inlineData && p.inlineData.data);

            if (!imagePart) {
                const textPart = parts.find(p => p.text);
                throw new Error(textPart ? `Model text-only: ${textPart.text.slice(0, 100)}` : 'No image part in response');
            }

            const mimeType = imagePart.inlineData.mimeType || 'image/png';
            const ext      = mimeType.includes('jpeg') ? 'jpg' : 'png';
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
            const fileName  = `Nova_${filenameSlug}_${timestamp}.${ext}`;

            logFn(`[ImageGen] Generated: ${fileName}`);
            return {
                status:      'created',
                base64:      imagePart.inlineData.data,
                mimeType,
                fileName,
            };

        } catch (e) {
            lastError = e;
            logFn(`[ImageGen] Attempt ${attempt + 1} (${model}) failed: ${e.message.slice(0, 200)}`);
            const isOverloaded = e.message.includes('overloaded') || e.message.includes('503') || e.message.includes('429');
            if (isOverloaded && attempt < IMAGE_MODELS.length - 1) {
                await new Promise(r => setTimeout(r, 3000 * (attempt + 1)));
            }
        }
    }
    throw lastError || new Error('All image generation models exhausted');
}

async function handleImageGenerationTool(args, logFn = console.log) {
    const {
        prompt        = '',
        style         = 'realistic',
        aspect_ratio  = 'square',
        mood          = '',
        extra_details = '',
        filename_hint = '',
        subjects,
    } = args;

    const hasBatch = Array.isArray(subjects) && subjects.length > 1;

    if (hasBatch) {
        const batch = subjects.slice(0, MAX_BATCH);
        logFn(`[ImageGen] Batch mode: ${batch.length} subjects, style=${style}`);

        const tasks = batch.map((subject, i) => {
            const subjectPrompt = prompt ? `${subject.trim()}, ${prompt}` : subject.trim();
            const slug = sanitizeFilename((filename_hint || style) + `_${i + 1}_` + subject.replace(/\W+/g, '_').slice(0, 20));
            return generateSingleImage({ subjectPrompt, style, mood, extra_details, aspect_ratio, filenameSlug: slug }, logFn)
                .then(r => ({ ...r, subject }))
                .catch(e => ({ status: 'error', subject, error: e.message }));
        });

        const results   = await Promise.all(tasks);
        const succeeded = results.filter(r => r.status === 'created');
        const failed    = results.filter(r => r.status === 'error');

        if (succeeded.length === 0) {
            return { status: 'error', speak: `I could not generate any of the ${batch.length} images. Please try again in a moment.` };
        }

        return {
            status:   'batch_created',
            count:    succeeded.length,
            images:   succeeded.map(r => ({ base64: r.base64, mimeType: r.mimeType, fileName: r.fileName, subject: r.subject })),
            speak:    `Done! I created ${succeeded.length} ${style} image${succeeded.length !== 1 ? 's' : ''}.${failed.length > 0 ? ` ${failed.length} could not be generated.` : ''} Saving them to your Desktop now!`,
        };
    }

    if (!prompt || prompt.trim().length < 3) {
        return { status: 'error', speak: 'I need a description to generate an image. What would you like me to create?' };
    }

    logFn(`[ImageGen] Single mode: prompt="${prompt.slice(0, 60)}" style=${style} aspect=${aspect_ratio}`);

    try {
        const slug   = sanitizeFilename(filename_hint || prompt.slice(0, 40));
        const result = await generateSingleImage({
            subjectPrompt: prompt, style, mood, extra_details, aspect_ratio,
            filenameSlug:  slug,
        }, logFn);

        return {
            ...result,
            style,
            speak: `Done! Your ${style} image is ready — saving it to your Desktop now!`,
        };
    } catch (e) {
        return { status: 'error', speak: `I had trouble generating the image: ${e.message.slice(0, 150)}. Please try again in a moment.` };
    }
}

module.exports = { handleImageGenerationTool };
