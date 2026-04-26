'use strict';
require('dotenv').config();
const { google } = require('googleapis');
const fs   = require('fs');
const path = require('path');
const { URL } = require('url');

const TOKEN_PATH    = path.join(__dirname, '..', 'credentials', 'google_token.json');
const REDIRECT_PORT = 3141;
// In multi-user mode the frontend catches the callback locally.
const REDIRECT_URI  = `http://localhost:${REDIRECT_PORT}/oauth2callback`;

const SCOPES = [
    'https://www.googleapis.com/auth/gmail.send',
    'https://www.googleapis.com/auth/gmail.readonly',
    'https://www.googleapis.com/auth/calendar',
    'https://www.googleapis.com/auth/contacts.readonly',
    'https://www.googleapis.com/auth/contacts.other.readonly',
];

function createOAuth2Client() {
    const clientId     = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    if (!clientId || !clientSecret) {
        throw new Error('GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET must be set.');
    }
    return new google.auth.OAuth2(clientId, clientSecret, REDIRECT_URI);
}

/**
 * Create a ready-to-use OAuth2 client from a token object the frontend provides.
 * Automatically refreshes the access token if it is close to expiry.
 */
async function createAuthClientFromToken(tokenObj) {
    if (!tokenObj) throw new Error('No token provided.');
    const client = createOAuth2Client();
    client.setCredentials(tokenObj);

    if (tokenObj.expiry_date && Date.now() > tokenObj.expiry_date - 120_000) {
        try {
            const { credentials } = await client.refreshAccessToken();
            client.setCredentials(credentials);
            return { client, refreshedToken: credentials };
        } catch (e) {
            console.warn('[GoogleAuth] Token refresh failed:', e.message);
        }
    }
    return { client, refreshedToken: null };
}

/**
 * Exchange an OAuth authorization code for tokens.
 * Called by the backend after the frontend catches the code on localhost:3141.
 */
async function exchangeCodeForToken(code) {
    const client = createOAuth2Client();
    const { tokens } = await client.getToken(code);
    return tokens;
}

/**
 * Returns the OAuth consent URL. The frontend opens this in the system browser.
 * The redirect goes to localhost:3141 on the USER'S machine (not Heroku).
 */
function getAuthUrl() {
    const client = createOAuth2Client();
    return client.generateAuthUrl({ access_type: 'offline', scope: SCOPES, prompt: 'consent' });
}

// ── Legacy single-user helpers (for local dev / backward compat) ─────────────

function loadToken() {
    if (process.env.GOOGLE_TOKEN_JSON) {
        try { return JSON.parse(process.env.GOOGLE_TOKEN_JSON); } catch (_) {}
    }
    try {
        if (fs.existsSync(TOKEN_PATH)) {
            return JSON.parse(fs.readFileSync(TOKEN_PATH, 'utf8'));
        }
    } catch (e) {}
    return null;
}

async function getAuthClient() {
    const token = loadToken();
    if (!token) throw new Error('No Google token available. Authenticate first.');
    const { client } = await createAuthClientFromToken(token);
    return client;
}

function isAuthenticated() {
    if (process.env.GOOGLE_TOKEN_JSON) return true;
    return fs.existsSync(TOKEN_PATH);
}

module.exports = {
    getAuthClient,
    createAuthClientFromToken,
    exchangeCodeForToken,
    getAuthUrl,
    isAuthenticated,
    SCOPES,
};
