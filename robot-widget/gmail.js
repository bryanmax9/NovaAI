'use strict';
require('dotenv').config();
const { google }      = require('googleapis');
const { GoogleGenAI } = require('@google/genai');
const { getAuthClient, isAuthenticated } = require('./google_auth');

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

async function getGmailClient() {
    const auth = await getAuthClient();
    return google.gmail({ version: 'v1', auth });
}

/**
 * Resolve a person's name to their email address by searching the user's
 * sent mail history. Returns { email, displayName } or null if not found.
 * If the input already looks like an email address, it is returned as-is.
 */
async function searchContacts(name) {
    if (!name) return null;

    if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(name.trim())) {
        return { email: name.trim().toLowerCase(), displayName: name.trim() };
    }

    try {
        const gmail = await getGmailClient();
        const queries = [
            `to:"${name}" in:sent`,
            `from:"${name}"`,
            `"${name}" in:sent`,
        ];

        const seen      = new Map();
        const nameParts = name.toLowerCase().trim().split(/\s+/).filter(Boolean);

        for (const q of queries) {
            let messages;
            try {
                const res = await gmail.users.messages.list({ userId: 'me', q, maxResults: 10 });
                messages = res.data.messages || [];
            } catch (e) {
                continue;
            }

            for (const msg of messages) {
                try {
                    const detail = await gmail.users.messages.get({
                        userId: 'me',
                        id: msg.id,
                        format: 'metadata',
                        metadataHeaders: ['To', 'From', 'Cc'],
                    });

                    const headers = detail.data.payload?.headers || [];

                    for (const header of headers) {
                        if (!['To', 'From', 'Cc'].includes(header.name)) continue;
                        for (const addr of parseAddressHeader(header.value)) {
                            if (!addr.email) continue;
                            if (/noreply|no-reply|mailer-daemon|postmaster/i.test(addr.email)) continue;

                            const emailLower   = addr.email.toLowerCase();
                            const displayLower = (addr.displayName || '').toLowerCase();
                            const matches = nameParts.every(part =>
                                emailLower.includes(part) || displayLower.includes(part)
                            );

                            if (matches) {
                                const entry = seen.get(emailLower) || { count: 0, displayName: addr.displayName || '' };
                                entry.count++;
                                if (addr.displayName && addr.displayName.length > entry.displayName.length) {
                                    entry.displayName = addr.displayName;
                                }
                                seen.set(emailLower, entry);
                            }
                        }
                    }
                } catch (e) {
                    // Skip messages that can't be fetched
                }
            }

            if (seen.size > 0) break;
        }

        if (seen.size === 0) return null;

        let bestEmail = null, bestCount = 0, bestDisplay = '';
        for (const [email, data] of seen) {
            if (data.count > bestCount) {
                bestCount   = data.count;
                bestEmail   = email;
                bestDisplay = data.displayName;
            }
        }

        console.log(`[Gmail] Resolved "${name}" → ${bestEmail} (${bestCount} match(es))`);
        return { email: bestEmail, displayName: bestDisplay };

    } catch (e) {
        console.error('[Gmail] searchContacts error:', e.message);
        return null;
    }
}

/**
 * Parse a raw address header value like "John Doe <john@example.com>, jane@example.com"
 * into an array of { displayName, email } objects.
 */
function parseAddressHeader(headerValue) {
    if (!headerValue) return [];
    const results = [];
    const parts = headerValue.split(/,(?![^<]*>)/);
    for (const part of parts) {
        const trimmed    = part.trim();
        const angleMatch = trimmed.match(/^(.*?)<([^>]+)>$/);
        if (angleMatch) {
            results.push({
                displayName: angleMatch[1].trim().replace(/^"|"$/g, ''),
                email: angleMatch[2].trim().toLowerCase(),
            });
        } else if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
            results.push({ displayName: '', email: trimmed.toLowerCase() });
        }
    }
    return results;
}

/**
 * Use Gemini to expand the user's spoken intent into a professional email body.
 * Returns { subject, body }.
 */
async function generateEmailContent(recipientName, subjectHint, messageIntent) {
    const prompt =
        `Write a short, professional email body (2–4 sentences unless more detail was requested).\n` +
        `Recipient: ${recipientName}\n` +
        `Subject hint: ${subjectHint || '(none)'}\n` +
        `What the email should say: "${messageIntent}"\n\n` +
        `Rules:\n` +
        `- Do NOT include a subject line, salutation, or sign-off in the body\n` +
        `- Just write the body paragraphs\n` +
        `- Be professional but warm\n` +
        `- Keep it concise unless the user asked for detail\n` +
        `Also suggest a concise subject line (max 8 words).\n\n` +
        `Respond as JSON only: { "subject": "...", "body": "..." }`;

    try {
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: [{ parts: [{ text: prompt }] }],
            config: { temperature: 0.4 },
        });

        const text      = (response.text || '').trim();
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
            const parsed = JSON.parse(jsonMatch[0]);
            return {
                subject: parsed.subject || subjectHint || '(no subject)',
                body:    parsed.body    || messageIntent,
            };
        }
    } catch (e) {
        console.error('[Gmail] generateEmailContent error:', e.message);
    }

    return { subject: subjectHint || '(no subject)', body: messageIntent };
}

function buildRawMime({ to, subject, body }) {
    const headers = [
        `To: ${to}`,
        `Subject: =?UTF-8?B?${Buffer.from(subject).toString('base64')}?=`,
        'MIME-Version: 1.0',
        'Content-Type: text/plain; charset=UTF-8',
        'Content-Transfer-Encoding: base64',
    ].join('\r\n');

    const raw = `${headers}\r\n\r\n${Buffer.from(body).toString('base64')}`;
    return Buffer.from(raw).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * Send an email immediately via Gmail.
 * @param {{ to: string, subject: string, body: string }}
 * @returns {{ success: boolean, messageId?: string, error?: string }}
 */
async function sendEmail({ to, subject, body }) {
    try {
        const gmail    = await getGmailClient();
        const response = await gmail.users.messages.send({
            userId: 'me',
            requestBody: { raw: buildRawMime({ to, subject, body }) },
        });
        console.log('[Gmail] Email sent — messageId:', response.data.id);
        return { success: true, messageId: response.data.id };
    } catch (e) {
        console.error('[Gmail] sendEmail error:', e.message);
        return { success: false, error: e.message };
    }
}

/**
 * Save an email as a Gmail draft.
 * @param {{ to: string, subject: string, body: string }}
 * @returns {{ success: boolean, draftId?: string, error?: string }}
 */
async function draftEmail({ to, subject, body }) {
    try {
        const gmail    = await getGmailClient();
        const response = await gmail.users.drafts.create({
            userId: 'me',
            requestBody: { message: { raw: buildRawMime({ to, subject, body }) } },
        });
        console.log('[Gmail] Draft saved — draftId:', response.data.id);
        return { success: true, draftId: response.data.id };
    } catch (e) {
        console.error('[Gmail] draftEmail error:', e.message);
        return { success: false, error: e.message };
    }
}

/**
 * Top-level handler called by the Gemini Live send_email tool dispatch.
 * Resolves the recipient name to an email, generates a body from the spoken
 * intent, then sends or drafts depending on draft_only.
 *
 * @param {{ recipient_name, subject, message_intent, draft_only? }} args
 * @param {Function} speakFn  - optional, speak text back to the user
 * @param {Function} logFn    - optional, write to the automation-log IPC channel
 * @returns {object} tool call response payload
 */
async function handleSendEmailTool({ recipient_name, subject, message_intent, draft_only }, speakFn, logFn) {
    const log = logFn   || ((msg) => console.log('[Gmail Tool]', msg));
    const say = speakFn || ((msg) => console.log('[Gmail TTS]', msg));

    // Guard: never trigger the interactive OAuth browser flow inside the live session.
    if (!isAuthenticated()) {
        const msg = 'Gmail is not connected yet. Open a terminal in the robot-widget folder and run: npm run setup-google — it will open a browser to authorize access. After that, restart Nova and email will work.';
        log('⚠️ [Gmail] Not authenticated — returning auth_required');
        return { status: 'auth_required', speak: msg, message: msg };
    }

    try {
        log(`📧 Resolving "${recipient_name}"...`);

        const contact = await searchContacts(recipient_name);
        if (!contact) {
            const msg = `I couldn't find ${recipient_name}'s email address. What's their email?`;
            say(msg);
            return { status: 'needs_clarification', message: msg, speak: msg };
        }

        log(`📧 Generating email body...`);
        const { subject: generatedSubject, body } = await generateEmailContent(
            contact.displayName || recipient_name,
            subject,
            message_intent
        );

        const finalSubject = subject || generatedSubject;

        const preMsg = draft_only
            ? `Saving a draft to ${contact.displayName || recipient_name} — subject: ${finalSubject}.`
            : `Sending email to ${contact.displayName || recipient_name} — subject: ${finalSubject}.`;
        log(`📧 ${preMsg}`);

        const result = draft_only
            ? await draftEmail({ to: contact.email, subject: finalSubject, body })
            : await sendEmail({ to: contact.email, subject: finalSubject, body });

        if (!result.success) {
            const errMsg = `I couldn't ${draft_only ? 'save the draft' : 'send the email'}. ${result.error || 'Unknown error.'}`;
            say(errMsg);
            return { status: 'error', message: errMsg, speak: errMsg };
        }

        const successMsg = draft_only
            ? `Draft saved for ${contact.displayName || recipient_name}.`
            : `Email sent successfully to ${contact.displayName || recipient_name}.`;
        log(`✅ ${successMsg}`);

        return {
            status: 'success',
            message: successMsg,
            speak: successMsg,
            recipient: contact.email,
            subject: finalSubject,
        };

    } catch (e) {
        if (e.message.includes('GOOGLE_CLIENT_ID') || e.message.includes('credentials')) {
            const authMsg = 'I need permission to access Gmail. Opening authorization in your browser.';
            say(authMsg);
            return { status: 'auth_required', message: authMsg, speak: authMsg };
        }

        const errMsg = `I couldn't send the email. ${e.message}`;
        console.error('[Gmail] handleSendEmailTool error:', e.message);
        say(errMsg);
        return { status: 'error', message: errMsg, speak: errMsg };
    }
}

module.exports = {
    sendEmail,
    draftEmail,
    searchContacts,
    generateEmailContent,
    handleSendEmailTool,
};
