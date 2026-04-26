'use strict';
// Backend URL for the Electron frontend to use.
// Set NOVA_BACKEND_URL env var to point to your Heroku deployment.
// Example: NOVA_BACKEND_URL=https://your-nova-backend.herokuapp.com

const BACKEND_URL    = process.env.NOVA_BACKEND_URL    || 'http://localhost:3001';
const BACKEND_WS_URL = process.env.NOVA_BACKEND_WS_URL || BACKEND_URL.replace(/^http/, 'ws');

module.exports = { BACKEND_URL, BACKEND_WS_URL };
