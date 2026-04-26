'use strict';
require('dotenv').config();
const { google } = require('googleapis');
const fs   = require('fs');
const path = require('path');
const http = require('http');
const { URL } = require('url');

// Token can live in a file (local dev) or in GOOGLE_TOKEN_JSON env var (Heroku).
const TOKEN_PATH    = path.join(__dirname, '..', 'credentials', 'google_token.json');
const REDIRECT_PORT = 3141;
const REDIRECT_URI  = process.env.GOOGLE_REDIRECT_URI || `http://localhost:${REDIRECT_PORT}/oauth2callback`;

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

function loadToken() {
    // Heroku: token stored in env var as JSON string
    if (process.env.GOOGLE_TOKEN_JSON) {
        try { return JSON.parse(process.env.GOOGLE_TOKEN_JSON); } catch (_) {}
    }
    // Local: token stored in file
    try {
        if (fs.existsSync(TOKEN_PATH)) {
            return JSON.parse(fs.readFileSync(TOKEN_PATH, 'utf8'));
        }
    } catch (e) {
        console.warn('[GoogleAuth] Could not read token file:', e.message);
    }
    return null;
}

function saveToken(token) {
    try {
        const dir = path.dirname(TOKEN_PATH);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(TOKEN_PATH, JSON.stringify(token, null, 2));
        console.log('[GoogleAuth] Token saved to', TOKEN_PATH);
    } catch (e) {
        // On Heroku with ephemeral FS this will fail — that's expected.
        console.warn('[GoogleAuth] Could not save token to file (use GOOGLE_TOKEN_JSON env var on Heroku):', e.message);
    }
}

function waitForOAuthCode() {
    return new Promise((resolve, reject) => {
        const server = http.createServer((req, res) => {
            try {
                const url  = new URL(req.url, `http://localhost:${REDIRECT_PORT}`);
                const code = url.searchParams.get('code');
                const err  = url.searchParams.get('error');
                if (code) {
                    res.writeHead(200, { 'Content-Type': 'text/html' });
                    res.end(`<html><body style="font-family:sans-serif;background:#0d1117;color:#fff;text-align:center;padding:60px">
                        <h2 style="color:#00ffcc">✅ Nova Authorization Complete</h2>
                        <p style="color:#8b949e">Google access granted. You can close this window.</p></body></html>`);
                    server.close();
                    resolve(code);
                } else {
                    const reason = err || 'Unknown error';
                    res.writeHead(400, { 'Content-Type': 'text/html' });
                    res.end(`<html><body style="font-family:sans-serif;padding:40px"><h2>❌ Authorization failed</h2><p>${reason}</p></body></html>`);
                    server.close();
                    reject(new Error(`OAuth denied: ${reason}`));
                }
            } catch (parseErr) { server.close(); reject(parseErr); }
        });

        server.listen(REDIRECT_PORT, 'localhost', () => {
            console.log(`[GoogleAuth] Waiting for OAuth callback on http://localhost:${REDIRECT_PORT}/oauth2callback`);
        });
        server.on('error', (e) => reject(new Error(`OAuth callback server error: ${e.message}`)));
        setTimeout(() => { server.close(); reject(new Error('OAuth flow timed out after 5 minutes.')); }, 5 * 60 * 1000);
    });
}

async function runOAuthFlow(client) {
    const authUrl = client.generateAuthUrl({ access_type: 'offline', scope: SCOPES, prompt: 'consent' });
    console.log('\n[GoogleAuth] ─────────────────────────────────────────────');
    console.log('[GoogleAuth] Opening OAuth consent URL in your browser...');
    console.log('[GoogleAuth] Copy and paste this URL if browser does not open:\n');
    console.log('  ' + authUrl + '\n');
    console.log('[GoogleAuth] ─────────────────────────────────────────────\n');

    const { exec } = require('child_process');
    const openCmd = process.platform === 'darwin' ? `open "${authUrl}"` :
                    process.platform === 'win32'  ? `start "" "${authUrl}"` :
                    `xdg-open "${authUrl}"`;
    exec(openCmd, () => {});

    const code = await waitForOAuthCode();
    const { tokens } = await client.getToken(code);
    client.setCredentials(tokens);
    saveToken(tokens);
    return client;
}

async function getAuthClient() {
    const client = createOAuth2Client();
    const token  = loadToken();

    if (token) {
        const savedScopes  = (token.scope || '').split(' ').filter(Boolean);
        const missingScopes = SCOPES.filter(s => !savedScopes.includes(s));
        if (missingScopes.length > 0) {
            console.warn('[GoogleAuth] Token missing scopes, re-authenticating:', missingScopes);
            try { fs.unlinkSync(TOKEN_PATH); } catch (_) {}
            return await runOAuthFlow(client);
        }

        client.setCredentials(token);

        if (token.expiry_date && Date.now() > token.expiry_date - 120_000) {
            try {
                const { credentials } = await client.refreshAccessToken();
                client.setCredentials(credentials);
                saveToken(credentials);
                console.log('[GoogleAuth] Access token refreshed.');
            } catch (refreshErr) {
                console.warn('[GoogleAuth] Token refresh failed, re-authenticating:', refreshErr.message);
                return await runOAuthFlow(client);
            }
        }

        return client;
    }

    return await runOAuthFlow(client);
}

function isAuthenticated() {
    if (process.env.GOOGLE_TOKEN_JSON) return true;
    return fs.existsSync(TOKEN_PATH);
}

async function revokeAccess() {
    try {
        if (isAuthenticated()) {
            const client = createOAuth2Client();
            const token  = loadToken();
            if (token) { client.setCredentials(token); await client.revokeCredentials(); }
            try { fs.unlinkSync(TOKEN_PATH); } catch (_) {}
            console.log('[GoogleAuth] Access revoked.');
        }
        return true;
    } catch (e) {
        console.error('[GoogleAuth] revokeAccess error:', e.message);
        return false;
    }
}

let _oauthFlowActive = false;

async function startOAuthFlow() {
    if (_oauthFlowActive) return null;
    _oauthFlowActive = true;
    try {
        const client = createOAuth2Client();
        const authUrl = client.generateAuthUrl({ access_type: 'offline', scope: SCOPES, prompt: 'consent' });
        // Start the callback server in background; saves token when complete
        waitForOAuthCode().then(async (code) => {
            try {
                const { tokens } = await client.getToken(code);
                client.setCredentials(tokens);
                saveToken(tokens);
                console.log('[GoogleAuth] In-app OAuth complete. Token saved.');
            } catch (e) {
                console.error('[GoogleAuth] Failed to exchange code:', e.message);
            } finally {
                _oauthFlowActive = false;
            }
        }).catch(e => {
            console.error('[GoogleAuth] OAuth callback error:', e.message);
            _oauthFlowActive = false;
        });
        return authUrl;
    } catch (e) {
        _oauthFlowActive = false;
        throw e;
    }
}

module.exports = { getAuthClient, isAuthenticated, revokeAccess, startOAuthFlow };
