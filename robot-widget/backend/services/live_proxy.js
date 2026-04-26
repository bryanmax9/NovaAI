'use strict';
require('dotenv').config();
const { GoogleGenAI, Modality } = require('@google/genai');

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

/**
 * Attach a Gemini Live relay to a WebSocket connection (ws).
 *
 * Protocol — Electron → Backend:
 *   { type: 'SESSION_START', config: { model, systemInstruction, tools, responseModalities } }
 *   { type: 'AUDIO_CHUNK',   data: '<base64 PCM>' }
 *   { type: 'TEXT_CHUNK',    text: '...' }
 *   { type: 'TOOL_RESULT',   callId: '...', functionResponse: {...} }
 *   { type: 'INJECT_TEXT',   text: '...' }
 *   { type: 'SESSION_END' }
 *
 * Protocol — Backend → Electron:
 *   { type: 'SESSION_READY' }
 *   { type: 'SESSION_CLOSED' }
 *   { type: 'SESSION_ERROR', message: '...' }
 *   { type: 'AUDIO_RESPONSE', data: '<base64 PCM>' }
 *   { type: 'TEXT_RESPONSE',  text: '...' }
 *   { type: 'TOOL_REQUEST',   callId: '...', name: '...', args: {...} }
 */
function attachLiveProxy(ws) {
    let activeSession = null;

    function send(obj) {
        if (ws.readyState === ws.OPEN) {
            ws.send(JSON.stringify(obj));
        }
    }

    async function startSession(config) {
        if (activeSession) {
            console.log('[LiveProxy] Session already active — ignoring SESSION_START');
            return;
        }

        const model = config.model || 'gemini-3.1-flash-live-preview';
        console.log(`[LiveProxy] Connecting to Gemini Live model=${model}`);

        let audioChunksReceived = 0;
        let msgCount = 0;

        try {
            activeSession = await ai.live.connect({
                model,
                config: {
                    responseModalities: config.responseModalities || [Modality.AUDIO],
                    systemInstruction: config.systemInstruction,
                    tools: config.tools,
                    speechConfig: {
                        voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Puck' } },
                    },
                    realtimeInputConfig: {
                        automaticActivityDetection: {
                            disabled: false,
                            startOfSpeechSensitivity: 'START_SENSITIVITY_HIGH',
                            endOfSpeechSensitivity: 'END_SENSITIVITY_LOW',
                            prefixPaddingMs: 20,
                            silenceDurationMs: 500,
                        },
                    },
                },
                callbacks: {
                    onmessage: (message) => {
                        msgCount++;
                        const keys = Object.keys(message).filter(k => message[k] != null && typeof message[k] !== 'function');
                        if (msgCount <= 10 || msgCount % 50 === 0) {
                            console.log(`[LiveProxy] Gemini msg #${msgCount} keys: ${keys.join(', ')}`);
                        }

                        // Audio / text responses
                        if (message.serverContent?.modelTurn?.parts) {
                            for (const part of message.serverContent.modelTurn.parts) {
                                if (part.inlineData?.data) {
                                    audioChunksReceived++;
                                    if (audioChunksReceived <= 3) console.log(`[LiveProxy] Audio chunk #${audioChunksReceived} received from Gemini`);
                                    send({ type: 'AUDIO_RESPONSE', data: part.inlineData.data });
                                }
                                if (part.text) {
                                    console.log(`[LiveProxy] Text from Gemini: ${part.text.slice(0, 80)}`);
                                    send({ type: 'TEXT_RESPONSE', text: part.text });
                                }
                            }
                        }

                        if (message.serverContent?.turnComplete) {
                            console.log(`[LiveProxy] Turn complete. Audio chunks this turn: ${audioChunksReceived}`);
                            audioChunksReceived = 0;
                        }

                        // Tool calls — forward to Electron to execute
                        if (message.toolCall?.functionCalls) {
                            for (const call of message.toolCall.functionCalls) {
                                console.log(`[LiveProxy] Tool request → client: ${call.name}`);
                                send({ type: 'TOOL_REQUEST', callId: call.id, name: call.name, args: call.args });
                            }
                        }
                    },
                    onerror: (e) => {
                        console.error('[LiveProxy] Gemini Live error:', e.message);
                        send({ type: 'SESSION_ERROR', message: e.message });
                    },
                    onclose: () => {
                        console.log('[LiveProxy] Gemini Live session closed');
                        activeSession = null;
                        send({ type: 'SESSION_CLOSED' });
                    },
                },
            });

            send({ type: 'SESSION_READY' });
            console.log('[LiveProxy] Session ready');
        } catch (err) {
            console.error('[LiveProxy] Failed to start session:', err.message);
            activeSession = null;
            send({ type: 'SESSION_ERROR', message: err.message });
        }
    }

    function endSession() {
        if (activeSession) {
            console.log('[LiveProxy] Ending session');
            activeSession = null;
        }
    }

    ws.on('message', async (raw) => {
        let msg;
        try {
            msg = JSON.parse(raw.toString());
        } catch (e) {
            console.warn('[LiveProxy] Invalid JSON from client');
            return;
        }

        switch (msg.type) {
            case 'SESSION_START':
                await startSession(msg.config || {});
                break;

            case 'AUDIO_CHUNK': {
                if (activeSession && msg.data) {
                    try {
                        activeSession.sendRealtimeInput({
                            audio: { data: msg.data, mimeType: 'audio/pcm;rate=16000' },
                        });
                    } catch (e) {
                        console.error('[LiveProxy] sendAudio error:', e.message);
                    }
                } else if (!activeSession) {
                    console.warn('[LiveProxy] AUDIO_CHUNK received but no active session');
                }
                break;
            }

            // sendRealtimeInput({text}) is the only form this model responds to.
            // sendClientContent is silently ignored by gemini-3.1-flash-live-preview.
            case 'TEXT_CHUNK':
                if (activeSession && msg.text) {
                    try {
                        activeSession.sendRealtimeInput({ text: msg.text });
                    } catch (e) {
                        console.error('[LiveProxy] sendText error:', e.message);
                    }
                }
                break;

            // SDK 1.50+ requires sendToolResponse for function responses,
            // not sendRealtimeInput({ functionResponses: [...] }).
            case 'TOOL_RESULT':
                if (activeSession && msg.callId) {
                    try {
                        activeSession.sendToolResponse({
                            functionResponses: [{ id: msg.callId, response: msg.functionResponse }],
                        });
                    } catch (e) {
                        console.error('[LiveProxy] sendToolResult error:', e.message);
                    }
                }
                break;

            case 'INJECT_TEXT':
                if (activeSession && msg.text) {
                    try {
                        activeSession.sendRealtimeInput({ text: msg.text });
                    } catch (e) {
                        console.error('[LiveProxy] injectText error:', e.message);
                    }
                }
                break;

            case 'SESSION_END':
                endSession();
                break;

            default:
                console.warn('[LiveProxy] Unknown message type:', msg.type);
        }
    });

    ws.on('close', () => {
        console.log('[LiveProxy] Client WebSocket closed');
        endSession();
    });

    ws.on('error', (e) => {
        console.error('[LiveProxy] Client WebSocket error:', e.message);
        endSession();
    });
}

module.exports = { attachLiveProxy };
