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
                            // Block automated service addresses that often appear in sent mail
                            // with a real person's name as the display name (e.g. LinkedIn InMails,
                            // calendar invites, Slack notifications) — these cause false matches.
                            if (/invitations?@|notifications?@|alerts?@|updates?@|reply@|bounce@/i.test(addr.email)) continue;
                            if (/@(linkedin|slack|github|twitter|facebook|instagram|zoom|calendly|eventbrite|mailchimp|hubspot|salesforce)\./i.test(addr.email)) continue;

                            const emailLower   = addr.email.toLowerCase();
                            const displayLower = (addr.displayName || '').toLowerCase();
                            const matches = nameParts.every(part =>
                                emailLower.includes(part) || displayLower.includes(part)
                            );

                            if (matches) {
                                // Weighted scoring — prevents last-name / email-address
                                // substring matches from outranking first-name matches.
                                //
                                // Example: query "Bryan"
                                //   "Bryan Tineo"          → firstName match → weight 4
                                //   "Danielle Bryan"       → display contains  → weight 1
                                //   "foo@bryan-corp.com"   → email-only match  → weight 0.25
                                //
                                // A first-name match is always preferred over a same-frequency
                                // last-name or email match, regardless of sent-mail volume.
                                const displayWords  = displayLower.split(/\s+/);
                                const isFirstName   = nameParts.length === 1 && displayWords[0] === nameParts[0];
                                const isInDisplay   = nameParts.every(p => displayLower.includes(p));
                                const weight        = isFirstName ? 4 : isInDisplay ? 1 : 0.25;

                                const entry = seen.get(emailLower) || { count: 0, displayName: addr.displayName || '' };
                                entry.count += weight;
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

// Common phonetic name pairs that voice recognition frequently confuses.
// Each inner array is a set of spellings that should be treated as identical.
const PHONETIC_ALIASES = [
    ['bryan', 'brian', 'brien'],
    ['steven', 'stephen', 'stefan'],
    ['catherine', 'katherine', 'kathryn', 'katrina'],
    ['jeffrey', 'geoffrey'],
    ['sean', 'shawn', 'shaun'],
    ['kristin', 'kristen', 'christine', 'christina'],
    ['phillip', 'philip', 'filip'],
    ['matthew', 'mathew'],
    ['sara', 'sarah'],
];

/**
 * Expand a single name to include phonetic variants so voice-recognition
 * misspellings (e.g. "Brian" for "Bryan") still resolve correctly.
 * Returns the original name plus any known alternates.
 */
function phoneticVariants(name) {
    const lower = name.toLowerCase().trim();
    for (const group of PHONETIC_ALIASES) {
        if (group.includes(lower)) {
            // Preserve original capitalisation style for the primary query,
            // add lowercase variants for additional searches.
            return [name, ...group.filter(v => v !== lower)];
        }
    }
    return [name];
}

/**
 * Search the authenticated user's Google Contacts (People API) for a name.
 * Returns an array of { displayName, email } objects (may be empty).
 * Falls back to [] on any error so the caller's chain always completes.
 */
async function searchGoogleContacts(name) {
    try {
        const authClient = await getAuthClient();
        const people     = google.people({ version: 'v1', auth: authClient });

        const seenEmails = new Set();

        // Reusable helper: run one query against both main Contacts and Other Contacts.
        async function runQuery(query) {
            const results = [];
            try {
                const res = await people.people.searchContacts({
                    query,
                    readMask: 'names,emailAddresses',
                    pageSize: 10,
                    sources:  ['READ_SOURCE_TYPE_CONTACT'],
                });
                for (const r of (res.data.results || [])) {
                    const email = r.person.emailAddresses?.[0]?.value || null;
                    if (!email || seenEmails.has(email.toLowerCase())) continue;
                    seenEmails.add(email.toLowerCase());
                    results.push({ displayName: r.person.names?.[0]?.displayName || query, email });
                }
            } catch (e) {
                console.warn('[Gmail] searchContacts error:', e.message);
            }
            try {
                const otherRes = await people.otherContacts.search({
                    query, readMask: 'names,emailAddresses', pageSize: 10,
                });
                for (const r of (otherRes.data.results || [])) {
                    const email = r.person.emailAddresses?.[0]?.value || null;
                    if (!email || seenEmails.has(email.toLowerCase())) continue;
                    seenEmails.add(email.toLowerCase());
                    results.push({ displayName: r.person.names?.[0]?.displayName || query, email });
                }
            } catch (e) {
                if (!/PERMISSION_DENIED|other\.readonly|otherContacts/i.test(e.message)) {
                    console.warn('[Gmail] otherContacts.search error:', e.message);
                }
            }
            return results;
        }

        // PHASE 1 — Full-name variants (most precise, stops on first hit).
        for (const variant of phoneticVariants(name)) {
            const results = await runQuery(variant);
            if (results.length > 0) {
                console.log(`[Gmail] People API: "${name}" matched via full-name "${variant}" → ${results.length} result(s)`);
                return results;
            }
        }

        // PHASE 2 — First-name-only fallback for when Vosk mangles the last name
        // (e.g. "Tineo" → "Tino").  Collect ALL results from ALL phonetic first-name
        // variants so we don't stop on the wrong "Brian" before trying "Bryan".
        const nameParts = name.trim().split(/\s+/);
        if (nameParts.length < 2) {
            console.log(`[Gmail] People API: "${name}" → 0 results`);
            return [];
        }

        const firstName        = nameParts[0];
        const requestedLastRaw = nameParts.slice(1).join(' ').toLowerCase();
        const candidates       = [];

        for (const variant of phoneticVariants(firstName)) {
            const results = await runQuery(variant);
            for (const r of results) candidates.push(r);
        }

        if (candidates.length === 0) {
            console.log(`[Gmail] People API: "${name}" → 0 results (first-name fallback exhausted)`);
            return [];
        }

        // Score each candidate by how many leading characters its last name shares
        // with the requested last name — handles Vosk prefix truncation ("Tino" ≈ "Tineo").
        function prefixScore(a, b) {
            let score = 0;
            const len = Math.min(a.length, b.length);
            for (let i = 0; i < len; i++) {
                if (a[i] === b[i]) score++;
                else break;
            }
            return score;
        }

        const scored = candidates.map(r => {
            const parts   = r.displayName.toLowerCase().split(/\s+/);
            const lastName = parts.slice(1).join(' ');
            return { ...r, _score: prefixScore(lastName, requestedLastRaw) };
        });
        scored.sort((a, b) => b._score - a._score);

        const best = scored[0];
        console.log(`[Gmail] People API: "${name}" first-name fallback → best match "${best.displayName}" (last-name score: ${best._score})`);
        return scored.map(({ _score, ...r }) => r);

    } catch (err) {
        console.error('[Nova Gmail] People API error:', err.message);
        return [];
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
 *
 * Resolution priority (4 layers):
 *   1. recipient_email already provided by a prior re-invocation → skip lookup
 *      a. Partial (no @)  → ask for domain (word-by-word turn 2)
 *      b. Has @ but no .  → ask for domain part after @
 *      c. Complete         → proceed to confirmation
 *   2. Google People API  → best source for known contacts
 *   3. Gmail sent history → fallback for contacts not in address book
 *   4. Multiple matches   → disambiguation list (user picks 1-4)
 *   5. No matches         → word-by-word fallback (username then domain)
 *
 * confirmed=true is the ONLY condition under which sendEmail() / draftEmail()
 * is called. Every other path returns a spoken prompt to Gemini Live.
 *
 * @param {object}   args
 * @param {string}   args.recipient_name    - spoken name of the recipient
 * @param {string}   [args.subject]         - subject line (generated if absent)
 * @param {string}   args.message_intent    - what the email should say
 * @param {boolean}  [args.draft_only]      - save as draft instead of sending
 * @param {string}   [args.recipient_email] - resolved address from prior turn
 * @param {boolean}  [args.confirmed]       - true after user verbally confirms
 * @param {number}   [args.selected_index]  - 1-based pick from a multi-match list
 * @param {Function} speakFn  - optional direct TTS (not used in live-session path)
 * @param {Function} logFn    - optional automation-log logger
 * @returns {object} { status, speak, message, ... }
 */
async function handleSendEmailTool(
    {
        recipient_name,
        subject,
        message_intent,
        draft_only      = false,
        recipient_email = null,
        confirmed       = false,
        selected_index  = null,
    },
    speakFn,
    logFn
) {
    const log = logFn || ((msg) => console.log('[Gmail Tool]', msg));

    if (!isAuthenticated()) {
        const msg =
            'Gmail is not connected yet. Open a terminal in the robot-widget folder ' +
            'and run: npm run setup-google — it will open a browser to authorize access. ' +
            'After that, restart Nova and email will work.';
        log('⚠️ [Gmail] Not authenticated');
        return { status: 'auth_required', speak: msg, message: msg };
    }

    try {
        let resolvedEmail = null;
        let resolvedName  = recipient_name;

        // ── LAYER 4 (word-by-word): partial address from a prior re-invocation ─
        if (recipient_email) {
            if (!recipient_email.includes('@')) {
                // Got the username — ask for the domain.
                const username = recipient_email.trim().replace(/\s+/g, '');
                const msg = `Got it. And what's the domain? For example gmail.com, outlook.com, or your work domain.`;
                return { status: 'needs_domain', speak: msg, message: msg, partial_username: username };
            }

            if (recipient_email.endsWith('@')) {
                // Has "@" but nothing after it.
                const username = recipient_email.replace('@', '').trim();
                const msg = `What comes after the @ sign — the domain name?`;
                return { status: 'needs_domain', speak: msg, message: msg, partial_username: username };
            }

            // recipient_email looks complete — accept it and proceed to confirmation.
            resolvedEmail = recipient_email.toLowerCase().trim();
            resolvedName  = recipient_name || resolvedEmail;
        }

        // ── LAYERS 1-3: contact lookup (only when no address is already resolved) ─
        if (!resolvedEmail) {
            log(`📧 Resolving contact: "${recipient_name}"...`);

            // LAYER 1: Google People API (primary source)
            let allMatches = await searchGoogleContacts(recipient_name);

            // LAYER 2: Gmail sent-history fallback
            if (allMatches.length === 0) {
                const sentMatch = await searchContacts(recipient_name);
                if (sentMatch && sentMatch.email) {
                    allMatches = [{ email: sentMatch.email, displayName: sentMatch.displayName || recipient_name }];
                }
            }

            if (selected_index !== null && selected_index >= 1 && allMatches.length >= selected_index) {
                // LAYER 3a: user already picked from a disambiguation list
                const picked  = allMatches[selected_index - 1];
                resolvedEmail = picked.email;
                resolvedName  = picked.displayName || recipient_name;
                log(`📧 Disambiguation pick ${selected_index}: ${resolvedEmail}`);

            } else if (allMatches.length === 1) {
                // Single match — use it directly
                resolvedEmail = allMatches[0].email;
                resolvedName  = allMatches[0].displayName || recipient_name;
                log(`📧 Single match: ${resolvedEmail}`);

            } else if (allMatches.length > 1) {
                // LAYER 3b: multiple matches — present disambiguation list
                const options = allMatches
                    .slice(0, 4)
                    .map((m, i) => `${i + 1}: ${m.displayName} at ${m.email}`)
                    .join(', ');
                const msg =
                    `I found ${allMatches.length} contacts named ${recipient_name}. ` +
                    `${options}. Which one did you mean? Say the number or their full name.`;
                return { status: 'needs_disambiguation', speak: msg, message: msg };

            } else {
                // LAYER 4: no match anywhere — start word-by-word fallback
                const msg =
                    `I don't have a contact for ${recipient_name}. ` +
                    `What's the username — the part before the @ symbol?`;
                return { status: 'needs_username', speak: msg, message: msg };
            }
        }

        // ── LAYER 2: confirmation (mandatory before every send) ───────────────
        if (!confirmed) {
            const verb    = draft_only ? 'save a draft' : 'send an email';
            const confirm = draft_only ? 'save the draft' : 'send it';
            const sub     = subject || 'your message';
            const msg =
                `I'll ${verb} to ${resolvedName} at ${resolvedEmail}, ` +
                `subject: "${sub}". Should I ${confirm}?`;
            return {
                status:            'needs_confirmation',
                speak:             msg,
                message:           msg,
                recipient_email:   resolvedEmail,
                recipient_display: resolvedName,
            };
        }

        // ── SEND / DRAFT ───────────────────────────────────────────────────────
        log(`📧 Generating body for ${resolvedEmail}...`);
        const { subject: generatedSubject, body } = await generateEmailContent(
            resolvedName,
            subject,
            message_intent
        );
        const finalSubject = subject || generatedSubject;

        log(`📧 ${draft_only ? 'Drafting' : 'Sending'} to ${resolvedEmail} — "${finalSubject}"`);
        const result = draft_only
            ? await draftEmail({ to: resolvedEmail, subject: finalSubject, body })
            : await sendEmail({ to: resolvedEmail, subject: finalSubject, body });

        if (!result.success) {
            const errMsg =
                `I couldn't ${draft_only ? 'save the draft' : 'send the email'}. ` +
                `${result.error || 'Unknown error.'}`;
            log(`❌ ${errMsg}`);
            return { status: 'error', speak: errMsg, message: errMsg };
        }

        const successMsg = draft_only
            ? `Draft saved for ${resolvedName}.`
            : `Email sent to ${resolvedName} successfully.`;
        const successStatus = draft_only ? 'draft_saved' : 'success';
        log(`✅ ${successMsg}`);

        return {
            status:    successStatus,
            speak:     successMsg,
            message:   successMsg,
            recipient: resolvedEmail,
            subject:   finalSubject,
        };

    } catch (err) {
        if (err.message && (err.message.includes('GOOGLE_CLIENT_ID') || err.message.includes('credentials'))) {
            const authMsg =
                'Gmail access is not configured. Please run npm run setup-google ' +
                'in a terminal to authorize Nova.';
            return { status: 'auth_required', speak: authMsg, message: authMsg };
        }
        const errMsg = `I couldn't complete the email request. ${err.message}`;
        console.error('[Gmail] handleSendEmailTool error:', err.message);
        return { status: 'error', speak: errMsg, message: errMsg };
    }
}

/**
 * Fetch up to `limit` contacts from Google Contacts (main + other contacts).
 * Returns an array of { displayName, email } sorted alphabetically.
 */
async function listContacts(limit = 20) {
    try {
        const authClient = await getAuthClient();
        const people     = google.people({ version: 'v1', auth: authClient });

        const seenEmails = new Set();
        const contacts   = [];

        // Main contacts list
        try {
            const res = await people.people.connections.list({
                resourceName: 'people/me',
                pageSize:     Math.min(limit, 100),
                personFields: 'names,emailAddresses',
                sortOrder:    'FIRST_NAME_ASCENDING',
            });
            for (const p of (res.data.connections || [])) {
                const email = p.emailAddresses?.[0]?.value || null;
                if (!email || seenEmails.has(email.toLowerCase())) continue;
                seenEmails.add(email.toLowerCase());
                contacts.push({ displayName: p.names?.[0]?.displayName || email, email });
            }
        } catch (e) {
            console.warn('[Gmail] listContacts connections error:', e.message);
        }

        // Other contacts (frequently emailed, auto-populated)
        if (contacts.length < limit) {
            try {
                const otherRes = await people.otherContacts.list({
                    pageSize:    Math.min(limit - contacts.length, 100),
                    readMask:    'names,emailAddresses',
                });
                for (const p of (otherRes.data.otherContacts || [])) {
                    const email = p.emailAddresses?.[0]?.value || null;
                    if (!email || seenEmails.has(email.toLowerCase())) continue;
                    seenEmails.add(email.toLowerCase());
                    contacts.push({ displayName: p.names?.[0]?.displayName || email, email });
                }
            } catch (e) {
                if (!/PERMISSION_DENIED|other\.readonly/i.test(e.message)) {
                    console.warn('[Gmail] listContacts otherContacts error:', e.message);
                }
            }
        }

        contacts.sort((a, b) => a.displayName.localeCompare(b.displayName));
        return contacts.slice(0, limit);
    } catch (err) {
        console.error('[Gmail] listContacts error:', err.message);
        return [];
    }
}

/**
 * Tool handler: returns a spoken/structured list of the user's contacts.
 */
async function handleListContactsTool({ limit = 10 } = {}) {
    const contacts = await listContacts(limit);
    if (contacts.length === 0) {
        return {
            status: 'empty',
            speak:  "I couldn't find any contacts in your Google Contacts. Try adding some at contacts.google.com.",
            contacts: [],
        };
    }
    const lines = contacts.map((c, i) => `${i + 1}. ${c.displayName} — ${c.email}`).join('\n');
    const spoken = contacts.map(c => c.displayName).join(', ');
    return {
        status:   'success',
        speak:    `You have ${contacts.length} contact${contacts.length !== 1 ? 's' : ''}: ${spoken}.`,
        contacts,
        text:     lines,
    };
}

module.exports = {
    sendEmail,
    draftEmail,
    searchContacts,
    searchGoogleContacts,
    listContacts,
    generateEmailContent,
    handleSendEmailTool,
    handleListContactsTool,
};
