require('dotenv').config();
const { GoogleGenAI, Modality } = require('@google/genai');
const { ipcMain } = require('electron');

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

let activeSession = null;
let mainWindowRef = null;
let automationRef = null;
const lastExecCommandMap = new Map(); // cmdKey → last call timestamp
const EXEC_COOLDOWN_MS = 15000; // Per-command cooldown: 15 seconds

async function startLiveSession(mainWindow, automation) {
    mainWindowRef = mainWindow;
    automationRef = automation;
    if (activeSession) {
        console.log('Live Session already active.');
        return;
    }

    try {
        console.log('🔄 Connecting to Gemini Live API...');

        const model = 'gemini-3.1-flash-live-preview';
        activeSession = await ai.live.connect({
            model: model,
            config: {
                responseModalities: [Modality.AUDIO],
                systemInstruction:
                    "You are Nova, a brilliant multilingual AI assistant. Always respond in the user's language.\n\n" +

                    "== YOUR PRIMARY MODE IS CONVERSATION ==\n" +
                    "You have encyclopedic knowledge: science, math, history, weather, news, coding, homework, recipes, jokes, culture — everything. " +
                    "For ANY question or topic, respond verbally with your own knowledge. NEVER open a browser or run a command just to answer a question.\n\n" +

                    "== TOOL USAGE: STRICT TRIGGER RULES ==\n" +
                    "You have four tools. Use them ONLY when the user gives a direct, unambiguous action command. NEVER call a tool because the user mentioned a topic.\n\n" +

                    "1. execute_system_command — ONLY when user explicitly says 'open', 'launch', 'start', 'close', or 'run' followed by an app name.\n" +
                    "   - Triggers: 'open zoom', 'launch terminal', 'close spotify', 'open docs'\n" +
                    "   - Never triggers: questions, topics, 'what is X', 'tell me about X', any conversation\n" +
                    "   - NEVER call more than once per app. If cooldown returns Skipped, do NOT retry.\n\n" +

                    "2. control_browser — ONLY for these exact browser commands:\n" +
                    "   - 'scroll down' / 'scroll up' → action='scroll', direction='down' or 'up'\n" +
                    "   - 'search for X on google' / 'go to website X' / 'open X in the browser' → action='open', query='X'\n" +
                    "   - 'play X on youtube' / 'search youtube for X' → action='search_youtube', query='X'\n" +
                    "   - 'click on X' / 'click X' → action='smart_click', target_text='X'\n" +
                    "   - 'close the browser' → action='close'\n" +
                    "   - Never for general questions or conversation topics.\n\n" +

                    "3. get_browser_state — ONLY when user says 'what is on screen' or 'list the elements'. " +
                    "   Do NOT call this before clicking. For all clicks use control_browser action='smart_click' directly.\n\n" +

                    "4. create_research_paper — EXTREMELY STRICT. This tool takes several minutes and cannot be cancelled.\n" +
                    "   ONLY call it when ALL of these conditions are met simultaneously:\n" +
                    "   a) The user used an explicit creation verb: 'write', 'create', 'generate', 'make', 'build', 'compose', or 'prepare'\n" +
                    "   b) The user explicitly said the words 'research paper', 'academic paper', 'scientific paper', or 'research essay'\n" +
                    "   c) The user named a specific topic for the paper\n" +
                    "   EXAMPLE triggers: 'write me a research paper on climate change', 'create an academic paper about AI'\n" +
                    "   NEVER triggers: discussing a topic, asking questions, 'tell me about X', 'what is X', any conversation, partial sentences, ambient speech\n" +
                    "   If you are even slightly unsure, DO NOT call this tool — answer conversationally instead.\n\n" +

                    "== CLICKING ==\n" +
                    "When user says 'click on X' or 'click X': immediately call control_browser with action='smart_click' and target_text='X'. Do not call get_browser_state first.\n\n" +

                    "== AFTER ANY TOOL CALL ==\n" +
                    "Confirm the action in one short sentence, then return to normal conversation.\n\n" +

                    "== LANGUAGE ==\n" +
                    "Always respond in the user's language. Tool parameter values must be in English.",

                tools: [
                    {
                        functionDeclarations: [
                            {
                                name: "get_browser_state",
                                description: "Returns a list of all visible interactive elements on the current browser page with their IDs. Call this ONLY when the user explicitly asks what is on screen or to list elements. Do NOT call this before clicking — for all clicks use control_browser with action='smart_click' directly.",
                                parameters: { type: "OBJECT", properties: {} }
                            },
                            {
                                name: "control_browser",
                                description: "Controls Nova's browser. Use for explicit browser commands only: open (search/navigate), scroll (up/down), smart_click (click by visible text — use this for ALL clicks), search_youtube, close. For clicking always use smart_click with the visible text on screen — never call get_browser_state first. Never use for answering questions.",
                                parameters: {
                                    type: "OBJECT",
                                    properties: {
                                        action: {
                                            type: "STRING",
                                            enum: ["open", "scroll", "smart_click", "search_youtube", "close"],
                                            description: "The browser action to perform. Use smart_click for all clicks."
                                        },
                                        query: {
                                            type: "STRING",
                                            description: "URL or search query (used with 'open' or 'search_youtube')."
                                        },
                                        direction: {
                                            type: "STRING",
                                            enum: ["up", "down", "top", "bottom"],
                                            description: "Scroll direction (used with 'scroll')."
                                        },
                                        target_text: {
                                            type: "STRING",
                                            description: "Text to fuzzy-find and click (used with 'smart_click')."
                                        }
                                    },
                                    required: ["action"]
                                }
                            },
                            {
                                name: "execute_system_command",
                                description: "Executes a desktop/OS action. ONLY call when user explicitly requests to open, launch, start, close, or run an application. DO NOT call for questions, topics, or anything that does not require launching software. Supported apps: zoom, vscode, terminal, firefox, chrome, brave, discord, slack, spotify, vlc, gimp, blender, files, dolphin, libreoffice, calc, writer, impress, antigravity, docs, sheets, slides, drive, gmail, and any installed app. Also: increase/decrease volume, open documents/downloads/desktop folder.",
                                parameters: {
                                    type: "OBJECT",
                                    properties: {
                                        command: {
                                            type: "STRING",
                                            description: "Must be in English. Examples: 'open zoom', 'open terminal', 'open vscode', 'open docs', 'open sheets', 'close zoom', 'increase volume', 'open downloads folder'."
                                        }
                                    },
                                    required: ["command"]
                                }
                            },
                            {
                                name: "create_research_paper",
                                description: "Creates a full APA-formatted academic research paper. ONLY call when the user explicitly says one of these exact action verbs — write, create, generate, make, build, compose — AND explicitly says the words 'research paper', 'academic paper', 'scientific paper', or 'research essay', AND provides a topic. DO NOT call this because the user mentioned or discussed a topic. DO NOT call this for questions, summaries, or conversation. If the user is just talking about a subject, answer conversationally. Only call when the intent to produce a written paper document is completely unambiguous.",
                                parameters: {
                                    type: "OBJECT",
                                    properties: {
                                        topic: {
                                            type: "STRING",
                                            description: "The research topic or subject for the paper. Be specific and descriptive."
                                        }
                                    },
                                    required: ["topic"]
                                }
                            }
                        ]
                    }
                ]
            },
            callbacks: {
                onopen: () => {
                    console.log('✅ Connected to Gemini Live API');
                    mainWindow.webContents.send('live-session-event', { event: 'opened' });
                },
                onmessage: async (message) => {
                    if (message.serverContent && message.serverContent.interrupted) {
                        mainWindow.webContents.send('live-session-event', { event: 'interrupted' });
                    }
                    if (message.serverContent && message.serverContent.modelTurn && message.serverContent.modelTurn.parts) {
                        for (const part of message.serverContent.modelTurn.parts) {
                            if (part.inlineData && part.inlineData.data) {
                                mainWindow.webContents.send('live-audio-chunk', part.inlineData.data);
                            }
                            if (part.text) {
                                mainWindow.webContents.send('live-text-chunk', part.text);
                            }
                        }
                    }

                    // HANDLE TOOL CALLS
                    if (message.toolCall) {
                        for (const call of message.toolCall.functionCalls) {

                            if (call.name === 'get_browser_state') {
                                console.log('📁 [Tool] get_browser_state called');

                                // CRITICAL: Register the listener BEFORE triggering getDomMap
                                // to avoid the race condition where the response arrives before
                                // the listener is set up. Timeout after 5s to unblock Gemini.
                                const domMapPromise = new Promise((resolve) => {
                                    const timer = setTimeout(() => {
                                        ipcMain.removeAllListeners('dom-map-available');
                                        console.warn('⏱️ DOM map timeout — resolving with empty');
                                        resolve({ map: [], url: 'Timeout' });
                                    }, 5000);
                                    ipcMain.once('dom-map-available', (data) => {
                                        clearTimeout(timer);
                                        resolve(data || { map: [], url: 'Unknown' });
                                    });
                                });

                                if (automationRef) automationRef.getDomMap();

                                const { map, url } = await domMapPromise;
                                console.log(`👁️ [Tool] Browser state: ${url} (${map?.length || 0} elements)`);
                                activeSession.sendRealtimeInput({
                                    functionResponses: [{
                                        id: call.id,
                                        response: {
                                            elements: (map || []).slice(0, 100),
                                            url: url || 'Active Page',
                                            info: "List of interactive elements. Use 'element_id' with control_browser action='click_id' to click one."
                                        }
                                    }]
                                });

                            } else if (call.name === 'control_browser') {
                                const { action, query, direction, element_id, target_text } = call.args;
                                console.log(`🌍 [Browser Tool] Action: ${action}`);

                                if (automationRef) {
                                    if (action === 'open') {
                                        automationRef.openBrowser(query || 'google');
                                    } else if (action === 'search_youtube') {
                                        automationRef.openBrowser({ platform: 'youtube', query });
                                    } else if (action === 'scroll') {
                                        automationRef.scrollBrowser(direction);
                                    } else if (action === 'click_id') {
                                        automationRef.clickBrowserId(element_id);
                                    } else if (action === 'smart_click') {
                                        automationRef.smartClickBrowser(target_text);
                                    } else if (action === 'close') {
                                        // Block accidental close for 2 minutes after a research paper was opened
                                        const timeSinceResearch = Date.now() - (global.novaLastResearchDoneAt || 0);
                                        if (timeSinceResearch < 120000) {
                                            console.log('🛡️ Browser close blocked — research paper just opened.');
                                        } else {
                                            automationRef.closeBrowser();
                                        }
                                    }
                                }

                                activeSession.sendRealtimeInput({
                                    functionResponses: [{
                                        id: call.id,
                                        response: {
                                            status: "Complete",
                                            message: `Browser ${action} performed. Confirm this to the user in one short sentence, then continue conversation normally.`
                                        }
                                    }]
                                });

                            } else if (call.name === 'execute_system_command') {
                                const command = call.args.command;
                                console.log('💻 [System Tool] Command:', command);

                                const nowExec = Date.now();
                                const cmdKey = command.toLowerCase().trim();
                                const lastTime = lastExecCommandMap.get(cmdKey) || 0;

                                if (nowExec - lastTime < EXEC_COOLDOWN_MS) {
                                    console.log(`🛡️ Cooldown active for "${command}" — skipping`);
                                    activeSession.sendRealtimeInput({
                                        functionResponses: [{
                                            id: call.id,
                                            response: {
                                                status: "Skipped",
                                                output: "Already done recently. Do not call this again. Resume conversation."
                                            }
                                        }]
                                    });
                                } else {
                                    lastExecCommandMap.set(cmdKey, nowExec);
                                    if (automationRef) {
                                        const result = await automationRef.executeCommand(command);
                                        activeSession.sendRealtimeInput({
                                            functionResponses: [{
                                                id: call.id,
                                                response: {
                                                    status: "Complete",
                                                    output: result || "Done.",
                                                    message: "Task complete. Confirm in one short sentence. Do NOT call any tool again unless the user explicitly requests a new action."
                                                }
                                            }]
                                        });
                                    }
                                }

                            } else if (call.name === 'create_research_paper') {
                                const { topic } = call.args;

                                // Block if already researching or within 10 minutes of last completion
                                const cooldownElapsed = Date.now() - (global.novaLastResearchDoneAt || 0);
                                if (global.novaIsResearching || cooldownElapsed < 600000) {
                                    console.log(`📄 [Research Tool] Blocked — already in progress or recently completed.`);
                                    activeSession.sendRealtimeInput({
                                        functionResponses: [{
                                            id: call.id,
                                            response: {
                                                status: "Skipped",
                                                message: "The research paper was just completed or is still in progress. Tell the user the paper is ready on their desktop and ask what else they need. Do NOT call create_research_paper again."
                                            }
                                        }]
                                    });
                                    return;
                                }

                                console.log(`📄 [Research Tool] Starting paper on: "${topic}"`);
                                if (automationRef && automationRef.generatePaper) {
                                    automationRef.generatePaper(topic);
                                }

                                activeSession.sendRealtimeInput({
                                    functionResponses: [{
                                        id: call.id,
                                        response: {
                                            status: "Started",
                                            message: `Research paper on "${topic}" has been started. Tell the user you have started working on their research paper on "${topic}", that you are gathering information from multiple academic sources including IEEE, arXiv, and PubMed, and it will be saved to their desktop in a few minutes. Then stop talking and wait quietly.`
                                        }
                                    }]
                                });
                            }
                        }
                    }
                },
                onerror: (e) => {
                    console.error('❌ Gemini Live WebSocket Error:', e.message);
                    mainWindow.webContents.send('live-session-event', { event: 'error', message: e.message });
                },
                onclose: () => {
                    console.log('🏁 Gemini Live Session Closed.');
                    activeSession = null;
                    mainWindow.webContents.send('live-session-event', { event: 'closed' });
                },
            },
        });

    } catch (err) {
        console.error('❌ Failed to start live session:', err);
        activeSession = null;
    }
}

function sendAudioChunk(base64Data) {
    if (activeSession) {
        try {
            activeSession.sendRealtimeInput({
                audio: { data: base64Data, mimeType: "audio/pcm;rate=16000" }
            });
        } catch (e) {
            console.error("❌ Failed to send audio input:", e);
        }
    }
}

function sendTextChunk(text) {
    if (activeSession) {
        try {
            activeSession.sendRealtimeInput({ text: text });
        } catch (e) {
            console.error("❌ Failed to send text input:", e);
        }
    }
}

function endLiveSession() {
    if (activeSession) {
        console.log('🛑 Terminating Live Session...');
        activeSession = null;
    }
}

module.exports = {
    startLiveSession,
    sendAudioChunk,
    sendTextChunk,
    endLiveSession
};
