'use strict';
const WebSocket = require('ws');
const fs   = require('fs');
const path = require('path');
const os   = require('os');
const https = require('https');
const { BACKEND_URL, BACKEND_WS_URL } = require('./config.js');
const backendClient = require('./backend_client.js');

// ── Video folder helpers ────────────────────────────────────────────────────
const VIDEO_EXTS = ['.mp4', '.mkv', '.avi', '.mov', '.webm', '.wmv', '.flv', '.m4v'];
function getSystemVideosDir() {
    return process.platform === 'darwin' ? path.join(os.homedir(), 'Movies') : path.join(os.homedir(), 'Videos');
}
function getSystemVideosFolderName() {
    return process.platform === 'darwin' ? 'Movies' : 'Videos';
}
function scanVideoFiles() {
    const dir = getSystemVideosDir();
    try { return fs.readdirSync(dir).filter(f => VIDEO_EXTS.some(e => f.toLowerCase().endsWith(e))); }
    catch { return []; }
}
function scanOspProjects() {
    const dir = getSystemVideosDir();
    try { return fs.readdirSync(dir).filter(f => f.toLowerCase().endsWith('.osp')).map(f => f.replace(/\.osp$/i, '')); }
    catch { return []; }
}
const DOC_EXTS = ['.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx', '.txt', '.odt', '.ods', '.odp', '.csv', '.rtf'];
const IMG_EXTS = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.tiff', '.svg'];

function scanAttachableFiles(fileType) {
    const home = os.homedir();
    const configs = {
        video:    { dirs: [path.join(home, 'Videos'), path.join(home, 'Movies'), path.join(home, 'Downloads'), path.join(home, 'Desktop')], exts: VIDEO_EXTS },
        document: { dirs: [path.join(home, 'Documents'), path.join(home, 'Downloads'), path.join(home, 'Desktop')], exts: DOC_EXTS },
        image:    { dirs: [path.join(home, 'Pictures'), path.join(home, 'Desktop'), path.join(home, 'Downloads')], exts: IMG_EXTS },
    };
    const { dirs, exts } = configs[fileType] || { dirs: [], exts: [] };
    const results = [];
    for (const dir of dirs) {
        if (!fs.existsSync(dir)) continue;
        const scanDir = (d) => {
            try {
                for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
                    if (entry.isDirectory()) {
                        try {
                            for (const sub of fs.readdirSync(path.join(d, entry.name), { withFileTypes: true })) {
                                if (sub.isFile() && exts.some(e => sub.name.toLowerCase().endsWith(e))) {
                                    results.push({ name: sub.name, absPath: path.join(d, entry.name, sub.name) });
                                }
                            }
                        } catch {}
                    } else if (entry.isFile() && exts.some(e => entry.name.toLowerCase().endsWith(e))) {
                        results.push({ name: entry.name, absPath: path.join(d, entry.name) });
                    }
                }
            } catch {}
        };
        scanDir(dir);
    }
    return results.sort((a, b) => a.name.localeCompare(b.name));
}

// ── Session state ───────────────────────────────────────────────────────────
let _ws = null;
let mainWindowRef = null;
let automationRef = null;

let _browserIsOpen = false;
let _lastBrowserActionAt = 0;
let _lastSmartClickAt = 0;
let _lastOpenAt = 0;
let _lastOpenedQuery = '';
let _lastExplicitCloseAt = 0;
const POST_CLOSE_LOCKOUT_MS = 10000;
let _storeAssistantActive = false;
let _lastAutoScanAt = 0;
let _lastGetBrowserStateAt = 0;
let _lastAutoScanUrl = '';
let _stuckClickCount = 0;
let _lastSmartClickTarget = '';
const _calendarDebounce = new Map();
const CALENDAR_DEBOUNCE_MS = 12000;
let _emailInFlight = false;
let _emailLastCompletedAt = 0;
let _emailModeActive = false;
let _listContactsLastAt = 0;
const LIST_CONTACTS_COOLDOWN_MS = 30000;
let _listAttachLastAt = 0;
const LIST_ATTACH_COOLDOWN_MS = 20000;
const _codeAgentDebounce = new Map();
const _macroDebounce = new Map();
const MACRO_DEBOUNCE_MS = 8000;
const _screenDebounce = new Map();
const SCREEN_DEBOUNCE_MS = 5000;
const CODE_AGENT_DEBOUNCE_MS = {
    generate_code:  120000,
    modify_code:     60000,
    create_project:  15000,
    open_project:    10000,
    list_projects:   10000,
    preview_project: 10000,
    start_session:   10000,
    end_session:     10000,
};
const _notesDebounce = new Map();
const NOTES_DEBOUNCE_MS = {
    create_note:    60000,
    update_note:    20000,
    search_notes:    4000,
    list_notes:      4000,
    open_note:       2000,
    exit_notes_mode: 4000,
};
let _lastImageGenAt = 0;
const IMAGE_GEN_DEBOUNCE_MS        = 30000;
const IMAGE_GEN_BATCH_DEBOUNCE_MS  = 90000;
const _videoEditorDebounce = new Map();
const VIDEO_EDITOR_DEBOUNCE_MS = {
    list_projects:   30000,
    open_editor:     300000,
    create_project:  15000,
    import_file:     30000,
    add_to_timeline: 15000,
    delete_clip:     15000,
    play_preview:    30000,
    stop_preview:    5000,
    close_preview:   5000,
    save_project:    10000,
    export_video:    15000,
    undo:            3000,
    redo:            3000,
    guide:           3000,
    close_editor:    8000,
};
let _videoGenInFlight = false;
let _lastVideoGenAt = 0;
const VIDEO_GEN_DEBOUNCE_MS = 120000;

// ── DOM map callback (replaces ipcMain usage) ───────────────────────────────
let _domMapResolve = null;
function onDomMapAvailable(data) {
    if (_domMapResolve) {
        _domMapResolve(data);
        _domMapResolve = null;
    }
}

// ── Backend helpers ─────────────────────────────────────────────────────────
async function backendPost(path, body) {
    return backendClient.post(path, body);
}

async function backendGet(path) {
    return backendClient.get(path);
}

// ── WS send helper ──────────────────────────────────────────────────────────
function wsSend(obj) {
    if (_ws && _ws.readyState === WebSocket.OPEN) {
        _ws.send(JSON.stringify(obj));
    }
}

// Replacement for activeSession.sendRealtimeInput({ functionResponses: [...] })
function sendToolResult(callId, functionResponse) {
    wsSend({ type: 'TOOL_RESULT', callId, functionResponse });
}

// Replacement for activeSession.sendRealtimeInput({ text: ... })
function injectText(text) {
    wsSend({ type: 'INJECT_TEXT', text });
}

// ── Store auto-scan (adapted from original) ─────────────────────────────────
async function runStoreAutoScan(checkStuck) {
    if (!_ws || !automationRef) return;
    console.log('🛍️ [Store] Auto-scanning page...');

    const domMapPromise = new Promise((resolve) => {
        const timer = setTimeout(() => { _domMapResolve = null; resolve({ map: [], url: '' }); }, 5000);
        _domMapResolve = (data) => { clearTimeout(timer); resolve(data || { map: [], url: '' }); };
    });

    automationRef.getDomMap();
    const { map, url } = await domMapPromise;
    if (!map || map.length === 0) return;

    if (checkStuck) {
        if (_lastAutoScanUrl !== '' && url === _lastAutoScanUrl) {
            _stuckClickCount++;
        } else {
            _stuckClickCount = 0;
        }
        _lastAutoScanUrl = url;

        if (_stuckClickCount >= 2) {
            _stuckClickCount = 0;
            const target = _lastSmartClickTarget || 'the product';
            const fallback =
                `[NAVIGATION STUCK] smart_click for "${target}" failed multiple times — URL stays at ${url}. ` +
                `The element is a nav bar dropdown, not a product link. STOP using smart_click for this. ` +
                `IMMEDIATELY call control_browser action='open' with the direct URL from your knowledge. ` +
                `Apple patterns: apple.com/shop/buy-iphone/iphone-15, apple.com/shop/buy-iphone/iphone-16, ` +
                `apple.com/shop/buy-iphone/iphone-16-pro, apple.com/shop/buy-ipad/ipad-air, ` +
                `apple.com/shop/buy-ipad/ipad-pro, apple.com/shop/buy-mac/macbook-pro, ` +
                `apple.com/shop/buy-mac/macbook-air, apple.com/shop/buy-watch/apple-watch-series-10. ` +
                `For Amazon: amazon.com/s?k=product+name. Navigate directly now — do NOT speak first.`;
            _lastAutoScanAt = Date.now();
            injectText(fallback);
            setTimeout(() => injectText('Navigate directly using action=open now.'), 300);
            return;
        }
    } else {
        _stuckClickCount = 0;
        _lastAutoScanUrl = url;
    }

    const seen = new Set();
    const highlights = (map || [])
        .filter(el => {
            const t = (el.text || '').trim();
            if (!t || t.length < 3 || seen.has(t)) return false;
            seen.add(t);
            const tag = (el.tag || '').toUpperCase();
            const isHeading = ['H1', 'H2', 'H3', 'LABEL', 'BUTTON'].includes(tag);
            const hasSignal = /\$|from |starting|new|pro|plus|ultra|mini|air|max|series|gen|inch|mm|gb|tb|watch|iphone|ipad|mac|model|plan|color|size|edition/.test(t.toLowerCase());
            return isHeading || hasSignal;
        })
        .slice(0, 20)
        .map(e => e.text)
        .join(', ');

    const prompt =
        `[STORE NAVIGATION] You are in Store Assistant Mode. ` +
        `The browser just loaded: ${url}\n` +
        `Key items visible on the page: ${highlights || '(see page)'}\n\n` +
        `Speak out loud right now — do NOT call any tools. ` +
        `Use your own knowledge of this page combined with the items listed above. ` +
        `Tell the user what products, models, prices, or options are available here in a warm, enthusiastic way. ` +
        `Add your own knowledge: notable specs, who each option is best for, popular choices. ` +
        `End by asking which one they want — you will click it or navigate to it for them.`;

    _lastAutoScanAt = Date.now();
    injectText(prompt);
    setTimeout(() => injectText('Please speak your response out loud now.'), 300);
}

// ── Tool call handler ───────────────────────────────────────────────────────
async function handleToolCall(call) {
    // ── Macro Step Capture ────────────────────────────────────────────────
    if (automationRef && automationRef.isMacroRecording && automationRef.isMacroRecording()) {
        const captureTools = new Set(['execute_system_command', 'control_browser', 'show_stock_chart']);
        const isCalendarRead = call.name === 'calendar_action' && call.args.action === 'get_events';
        const isDestructiveWithWarning = call.name === 'send_email' ||
            (call.name === 'calendar_action' && call.args.action !== 'get_events');

        if (isDestructiveWithWarning) {
            const warnMsg = call.name === 'send_email'
                ? "[MACRO WARNING] I won't record email sending in the routine — that would send it every time you run it. Speak this warning to the user."
                : "[MACRO WARNING] I won't record calendar changes in the routine. Speak this warning to the user.";
            injectText(warnMsg);
        } else if (captureTools.has(call.name) || isCalendarRead) {
            let intent = call.name;
            if (call.name === 'execute_system_command') {
                const cmd = (call.args.command || '').trim();
                if (cmd.startsWith('focus-app ')) intent = `focus ${cmd.replace('focus-app ', '')}`;
                else if (cmd.startsWith('increase-volume')) intent = 'increase volume';
                else if (cmd.startsWith('decrease-volume')) intent = 'decrease volume';
                else intent = cmd;
            } else if (call.name === 'control_browser') {
                const a = call.args.action || '';
                if (a === 'open') intent = `open ${call.args.query || ''} in browser`;
                else if (a === 'scroll') intent = `scroll browser ${call.args.direction || ''}`;
                else if (a === 'smart_click') intent = `click "${call.args.target_text || ''}" in browser`;
                else intent = `browser ${a}`;
            } else if (call.name === 'show_stock_chart') {
                intent = `show stock chart for ${call.args.company || ''}`;
            } else if (call.name === 'calendar_action') {
                intent = `get calendar events for ${call.args.time_expression || 'upcoming'}`;
            }
            automationRef.recordMacroStep({ intent, tool: call.name, args: call.args, safe_to_repeat: true, destructive: false });
        }
    }

    // ── get_browser_state ─────────────────────────────────────────────────
    if (call.name === 'get_browser_state') {
        const nowGbs = Date.now();
        if (nowGbs - _lastAutoScanAt < 1500) {
            sendToolResult(call.id, { status: "Skipped", message: "Page scan just completed. Speak the product information out loud right now. Do NOT stay silent." });
            setTimeout(() => injectText('Please speak your response out loud now.'), 200);
            return;
        }
        if (nowGbs - _lastGetBrowserStateAt < 3000) {
            sendToolResult(call.id, { status: "Skipped", message: "Already retrieved page state. Do NOT call get_browser_state again. Speak out loud right now using your own knowledge. Do NOT stay silent." });
            setTimeout(() => injectText('Please speak your response out loud now.'), 200);
            return;
        }
        _lastGetBrowserStateAt = nowGbs;

        const domMapPromise = new Promise((resolve) => {
            const timer = setTimeout(() => { _domMapResolve = null; resolve({ map: [], url: 'Timeout' }); }, 5000);
            _domMapResolve = (data) => { clearTimeout(timer); resolve(data || { map: [], url: 'Unknown' }); };
        });

        if (automationRef) automationRef.getDomMap();
        const { map, url } = await domMapPromise;

        const seen = new Set();
        const filtered = (map || []).filter(el => {
            const t = (el.text || '').trim();
            if (!t || t.length < 2 || seen.has(t)) return false;
            seen.add(t);
            return true;
        });
        const productEls = filtered.filter(el => /\$|price|from |starting|storage|gb|tb|inch|mm|size|color|material|edition|model|plan|tier|buy|add to cart|review|rating|stars?/.test(el.text.toLowerCase()));
        const otherEls   = filtered.filter(el => !/\$|price|from |starting|storage|gb|tb|inch|mm|size|color|material|edition|model|plan|tier|buy|add to cart|review|rating|stars?/.test(el.text.toLowerCase()));
        const budget = 120;
        const combined = [...productEls.slice(0, 80), ...otherEls.slice(0, budget - Math.min(productEls.length, 80))];

        const looksLikeStorePage = _storeAssistantActive ||
            /shop|buy|product|store|cart|checkout|category|catalog|listing|pdp|item|detail|\/watch|\/iphone|\/ipad|\/mac|\/airpods|\/tv|\/accessories|\/gaming|\/electronics|\/jewelry|\/clothing|\/dp\/|\/itm\//.test((url || '').toLowerCase());
        const hasPriceData = productEls.length > 0;
        const priceNote = hasPriceData ? '' : " NOTE: This page does not show prices in its elements. Use your own training knowledge to describe this product's current prices, models, and variants. Do NOT call get_browser_state again.";
        const isStoreHomepage = looksLikeStorePage &&
            !/\/shop\/buy|\/shop\/product|\/dp\/|\/itm\/|\/s\?k=|\/buy-iphone|\/buy-ipad|\/buy-mac|\/buy-watch|\/buy-airpods|\/products?\/|\/category|\/collections?\//.test((url || '').toLowerCase());

        const info = looksLikeStorePage
            ? (isStoreHomepage
                ? "You are on the store HOMEPAGE. The navigation links visible here are what you need to click. Speak briefly: tell the user you can see the main product categories and ask what they want. CRITICAL: After the user names a product, do NOT call get_browser_state again. Immediately call control_browser action='smart_click' with the product name, or use action='open' with a direct URL." + priceNote
                : "You are in Store Assistant Mode on a product/category page. Read through these elements carefully and extract: product names, model variants, sizes, storage tiers, colors, materials, prices, and ratings. Immediately speak out loud in a friendly, enthusiastic way — list the products and prices you found, add your own knowledge about popularity and best value, and ask the user which one they want. Do NOT stay silent." + priceNote)
            : "List of interactive elements on the current page. Use smart_click with the element text to click any of them.";

        sendToolResult(call.id, { elements: combined, url: url || 'Active Page', info });
        if (looksLikeStorePage) setTimeout(() => injectText('Please speak your response out loud now.'), 300);
        return;
    }

    // ── control_browser ───────────────────────────────────────────────────
    if (call.name === 'control_browser') {
        const { action, query, direction, element_id, target_text } = call.args;
        const nowBrowser = Date.now();
        const isClick = action === 'smart_click' || action === 'click_id';
        const isClose = action === 'close';
        const debounceCutoff = isClose ? 10000 : 3000;

        if (isClick) {
            if (nowBrowser - _lastSmartClickAt < 1500) {
                sendToolResult(call.id, { status: "Skipped", message: "Already clicked recently. Resume conversation." });
                return;
            }
        } else {
            if (nowBrowser - _lastBrowserActionAt < debounceCutoff) {
                sendToolResult(call.id, { status: "Skipped", message: "Already performed recently. Resume conversation normally." });
                if (isClose) setTimeout(() => injectText('[BROWSER ALREADY CLOSED] The browser is closed. You are in normal conversation mode now. Speak naturally to the user and wait for their next request.'), 300);
                return;
            }
        }

        if (action === 'close' && !_browserIsOpen) {
            sendToolResult(call.id, { status: "Skipped", message: "Browser is not open. You are in normal conversation mode." });
            setTimeout(() => injectText('[BROWSER ALREADY CLOSED] The browser is not open. Return to normal conversation — speak to the user naturally and wait for their next request. Do NOT call control_browser again.'), 300);
            return;
        }

        if (isClick) { _lastSmartClickAt = nowBrowser; } else { _lastBrowserActionAt = nowBrowser; }

        if (automationRef) {
            if (action === 'open') {
                // ── Hard guardrail: block web searches for information ─────────
                // When Gemini tries to Google/Bing-search something and the user
                // didn't explicitly ask to browse, block it and answer from brain.
                const rawQuery = (query || '').trim();
                // Catch both full search URLs (google.com/search?q=...) and bare
                // search-engine names ("google", "bing") that have no real domain to visit.
                const isWebSearch = /google\.com\/search|bing\.com\/search|duckduckgo\.com\/\?q|search\.yahoo\.com\/search/i.test(rawQuery) ||
                                    /^(google|bing|duckduckgo|yahoo|search)$/i.test(rawQuery);
                if (isWebSearch && !_storeAssistantActive) {
                    sendToolResult(call.id, { status: "Blocked", message: "Do not search the web for information. Answer this from your own Gemini knowledge." });
                    setTimeout(() => injectText(
                        "[SEARCH BLOCKED] Do NOT search the web. Speak your answer right now using your own Gemini knowledge. " +
                        "If the question is about current weather: say something like 'I don't have live weather data, but in [city] in [month] you can typically expect...' and give seasonal/climate info. " +
                        "If it's about current news or events: share what you know from your training and note your knowledge cutoff. " +
                        "NEVER stay silent. Always give a spoken response immediately."
                    ), 100);
                    return;
                }
                // ─────────────────────────────────────────────────────────────

                const msSinceClose = nowBrowser - _lastExplicitCloseAt;
                if (msSinceClose < POST_CLOSE_LOCKOUT_MS) {
                    sendToolResult(call.id, { status: "Blocked", message: "The user just closed the browser. Do NOT reopen it. Resume normal conversation." });
                    injectText("[BROWSER CLOSED] The user explicitly closed the browser. Do not open it again unless they ask. Just talk to them normally.");
                    return;
                }
                const normalizedQuery = (query || 'google').toLowerCase().trim();
                const sameQueryRecently = normalizedQuery === _lastOpenedQuery && (nowBrowser - _lastOpenAt) < 8000;
                if (!sameQueryRecently) {
                    automationRef.openBrowser(query || 'google');
                    _lastOpenAt = nowBrowser;
                    _lastOpenedQuery = normalizedQuery;
                    _browserIsOpen = true;
                    if (_storeAssistantActive) {
                        _stuckClickCount = 0;
                        _lastAutoScanUrl = '';
                        setTimeout(() => runStoreAutoScan(false), 3500);
                    }
                }
            } else if (action === 'search_youtube') {
                const msSinceClose = nowBrowser - _lastExplicitCloseAt;
                if (msSinceClose < POST_CLOSE_LOCKOUT_MS) {
                    sendToolResult(call.id, { status: "Blocked", message: "The user just closed the browser. Do NOT reopen it." });
                    injectText("[BROWSER CLOSED] The user explicitly closed the browser. Just talk to them normally.");
                    return;
                }
                automationRef.openBrowser({ platform: 'youtube', query });
                _lastOpenAt = nowBrowser;
                _lastOpenedQuery = (query || '').toLowerCase().trim();
                _browserIsOpen = true;
            } else if (action === 'scroll') {
                automationRef.scrollBrowser(direction);
            } else if (action === 'click_id') {
                automationRef.clickBrowserId(element_id);
            } else if (action === 'smart_click') {
                _lastSmartClickTarget = target_text || '';
                const msSinceOpen = nowBrowser - _lastOpenAt;
                const waitMs = msSinceOpen < 2500 ? (2500 - msSinceOpen) : 0;
                if (waitMs > 0) setTimeout(() => automationRef.smartClickBrowser(target_text), waitMs);
                else automationRef.smartClickBrowser(target_text);
                if (_storeAssistantActive) {
                    const clickDelay = waitMs + 2200;
                    setTimeout(() => runStoreAutoScan(true), clickDelay);
                }
            } else if (action === 'toggle_incognito') {
                automationRef.toggleIncognito();
                _browserIsOpen = true;
            } else if (action === 'close') {
                const timeSinceResearch = Date.now() - (global.novaLastResearchDoneAt || 0);
                if (timeSinceResearch < 8000) {
                    console.log('🛡️ Browser close blocked — research paper just opened (8s guard).');
                } else {
                    automationRef.closeBrowser();
                    _browserIsOpen = false;
                    _lastExplicitCloseAt = nowBrowser;
                    _storeAssistantActive = false;
                    _lastBrowserActionAt = nowBrowser;
                }
            }
        }

        const isStoreNav = _storeAssistantActive && (action === 'smart_click' || action === 'open');
        const clickMessage = isStoreNav
            ? `Navigating to the product page. Stay quiet — a page scan will arrive shortly with instructions. Do NOT speak yet.`
            : action === 'close'
            ? `Browser closed successfully. Say out loud: "Done, browser closed." Do NOT call any tool again.`
            : `Browser ${action} performed. Confirm this to the user in one short sentence, then continue conversation normally.`;

        sendToolResult(call.id, { status: "Complete", message: clickMessage });

        if (action === 'close' && _lastExplicitCloseAt === nowBrowser) {
            setTimeout(() => injectText('[BROWSER CLOSED] Say out loud: "Done, browser closed!" then wait for the user to speak. You are now in normal conversation mode. Do NOT call control_browser or any other tool unless the user asks.'), 400);
        }
        return;
    }

    // ── execute_system_command ────────────────────────────────────────────
    if (call.name === 'execute_system_command') {
        const command = call.args.command;
        const nowExec = Date.now();
        const cmdKey  = command.toLowerCase().trim();
        const lastTime = (automationRef && automationRef._execCommandMap) ? (automationRef._execCommandMap.get(cmdKey) || 0) : 0;

        if (nowExec - lastTime < 15000) {
            sendToolResult(call.id, { status: "Skipped", message: "This command was executed recently. Skip and resume conversation." });
            return;
        }
        if (automationRef && automationRef._execCommandMap) automationRef._execCommandMap.set(cmdKey, nowExec);

        if (automationRef && automationRef.executeCommand) {
            sendToolResult(call.id, { status: "Executing", message: `Running: ${command}` });
            automationRef.executeCommand(command).then((result) => {
                if (!_ws) return;
                injectText(`[SYSTEM COMMAND DONE] ${result || 'Done.'} Tell the user in one sentence what happened. Do NOT call execute_system_command again for this.`);
            }).catch((e) => {
                if (_ws) injectText(`[SYSTEM COMMAND ERROR] ${e.message}. Tell the user there was a problem. Do NOT call any tool.`);
            });
        } else {
            sendToolResult(call.id, { status: "Error", message: "Automation not available." });
        }
        return;
    }

    // ── create_research_paper ─────────────────────────────────────────────
    if (call.name === 'create_research_paper') {
        const { topic } = call.args;
        sendToolResult(call.id, { status: "Started", message: `Research paper on "${topic}" has been started. Tell the user you have started working on their research paper on "${topic}", that you are gathering information from multiple academic sources including IEEE, arXiv, and PubMed, and it will be saved to their desktop in a few minutes. Then stop talking and wait quietly.` });
        if (automationRef && automationRef.generatePaper) automationRef.generatePaper(topic);
        return;
    }

    // ── show_stock_chart ──────────────────────────────────────────────────
    if (call.name === 'show_stock_chart') {
        const { company, symbol } = call.args;
        sendToolResult(call.id, { status: "Fetching", message: `Pulling live market data for ${company}. Tell the user you are looking up the stock chart right now, then stay quiet for a moment while the data loads.` });
        if (automationRef && automationRef.showStockChart) {
            automationRef.showStockChart(company, symbol || '').then((result) => {
                if (!_ws) return;
                const storeNote = (_storeAssistantActive && _browserIsOpen)
                    ? " REMINDER: The browser is still open on a shopping store. You remain in Store Shopping Guide mode."
                    : '';
                const msg = result.success
                    ? `[STOCK DATA LOADED] ${result.summary}${storeNote} Now speak out loud: describe the current price, the percentage change today, the 3-month trend shown on the chart, and what it means for the user's original question. Be specific and helpful. Do NOT call any tool.`
                    : `[STOCK DATA UNAVAILABLE] ${result.summary}${storeNote} Speak from your own knowledge about this company's recent market performance and price trends.`;
                injectText(msg);
            }).catch((e) => {
                if (_ws) injectText(`[STOCK DATA ERROR] Could not retrieve data for ${company}. Answer conversationally using your training knowledge about this company's market performance.`);
            });
        }
        return;
    }

    // ── list_attachable_files ─────────────────────────────────────────────
    if (call.name === 'list_attachable_files') {
        const fileType = (call.args && call.args.file_type) || 'document';
        const nowAttach = Date.now();
        if (nowAttach - _listAttachLastAt < LIST_ATTACH_COOLDOWN_MS) {
            sendToolResult(call.id, { status: 'already_shown', message: 'File list already shown. Wait for user to pick a file.' });
            return;
        }
        _listAttachLastAt = nowAttach;
        const files = scanAttachableFiles(fileType);
        if (automationRef && automationRef.showAttachmentsPanel) automationRef.showAttachmentsPanel(files, fileType);
        sendToolResult(call.id, { status: 'ok', count: files.length });

        let instr;
        if (files.length === 0) {
            const folderName = fileType === 'video' ? getSystemVideosFolderName() : fileType === 'document' ? 'Documents' : 'Pictures';
            instr = `[NO ${fileType.toUpperCase()} FILES] Say: "I couldn't find any ${fileType} files in your ${folderName} folder." Then ask: "Would you like to skip the attachment, or try a different file type — video, document, or image?"`;
        } else {
            const cap = files.slice(0, 20);
            const lookupLines = cap.map((f, i) => `  ${i + 1}. "${f.name}" → "${f.absPath}"`).join('\n');
            const spokenNames = cap.map((f, i) => `${i + 1}. ${f.name}`).join(', ');
            instr =
                `[${fileType.toUpperCase()} FILES FOUND — ${cap.length} files shown in panel]\n` +
                `FILE LOOKUP TABLE (use the exact quoted path for attachment_path):\n${lookupLines}\n\n` +
                `Say out loud: "I found ${cap.length} ${fileType} file${cap.length !== 1 ? 's' : ''}: ${spokenNames}. Which one would you like to attach?"\n` +
                `Wait for the user. When they say a name, match it to the nearest entry in the lookup table above.\n` +
                `Then say: "Is [matched name] the one you want to attach?" and wait for yes or no.\n` +
                `If YES: remember the exact attachment_path from the lookup table. Then go to STEP 4 — ask: "What would you like the subject of this email to be?"\n` +
                `If NO: ask again which file.\n` +
                `CRITICAL: Do NOT call send_email yet. You still need to ask for subject (STEP 4) and message content (STEP 5) first.`;
        }
        injectText(instr);
        return;
    }

    // ── list_contacts ─────────────────────────────────────────────────────
    if (call.name === 'list_contacts') {
        const nowContacts = Date.now();
        const msSince = nowContacts - _listContactsLastAt;
        if (msSince < LIST_CONTACTS_COOLDOWN_MS && automationRef && automationRef.isContactsPanelOpen && automationRef.isContactsPanelOpen()) {
            sendToolResult(call.id, { status: 'already_shown', message: 'Contacts panel is already visible. Do NOT call list_contacts again. Ask the user who they want to email.' });
            injectText(`[CONTACTS ALREADY VISIBLE] The contacts panel is still open. Do NOT call list_contacts again. Ask the user: "Who would you like to email?" and wait for their answer. Then call send_email with the name they say.`);
            return;
        }
        _listContactsLastAt = nowContacts;
        sendToolResult(call.id, { status: 'Processing', message: 'Fetching your contacts...' });

        const limit = Math.min(Math.max(call.args?.limit || 10, 1), 30);
        backendGet(`/api/email/contacts?limit=${limit}`).then((result) => {
            if (!_ws) return;
            if (automationRef && automationRef.showContactsPanel && result.contacts?.length > 0) {
                automationRef.showContactsPanel(result.contacts);
            }
            let instr;
            if (result.status === 'success') {
                const nameList = result.contacts.map((c, i) => `${i + 1}. ${c.displayName}`).join(', ');
                instr =
                    `[CONTACTS PANEL SHOWN] The contacts panel is now visible. ` +
                    `EXACT contact names (use these EXACTLY when calling send_email): ${nameList}. ` +
                    `Say out loud: "Here are your contacts. Who would you like to email?" ` +
                    `When the user says a name, match it to the closest name from the list and pass THAT exact name to send_email. ` +
                    `Do NOT call list_contacts again — the panel is already open.`;
            } else if (result.status === 'empty') {
                instr = `[NO CONTACTS] ${result.speak} If Google isn't authorized yet, tell the user to run npm run setup-google. Do NOT call any tool.`;
            } else {
                instr = `[CONTACTS ERROR] ${result.speak || 'Error loading contacts.'} Do NOT call any tool.`;
            }
            injectText(instr);
        }).catch((e) => {
            console.error('📋 [Contacts] Error:', e.message);
        });
        return;
    }

    // ── control_contacts_panel ────────────────────────────────────────────
    if (call.name === 'control_contacts_panel') {
        const { action } = call.args;
        sendToolResult(call.id, { status: 'ok', action });
        if (action === 'scroll_up' || action === 'scroll_down') {
            if (automationRef && automationRef.scrollContactsPanel) automationRef.scrollContactsPanel(action);
            injectText(`[CONTACTS SCROLLED] Panel scrolled ${action === 'scroll_up' ? 'up' : 'down'}. Say something natural like "scrolled" or "here you go" and wait for the user to pick a contact or scroll again. Do NOT call any tool.`);
        } else if (action === 'close_browser_keep_contacts') {
            if (automationRef && automationRef.closeBrowser) automationRef.closeBrowser();
            injectText(`[BROWSER CLOSED - EMAIL MODE CONTINUES] Closed the sent folder. Contacts panel is still visible. Say: "Alright! Who would you like to email next?" and wait for them to say a name from the contacts panel. When they say a name, call send_email with that name. Do NOT call list_contacts again — contacts are already showing.`);
        } else if (action === 'close_email_mode') {
            _emailModeActive = false;
            _emailInFlight = false;
            _listAttachLastAt = 0;
            _emailLastCompletedAt = Date.now();
            if (automationRef && automationRef.closeBrowser) automationRef.closeBrowser();
            if (automationRef && automationRef.hideContactsPanel) automationRef.hideContactsPanel();
            if (automationRef && automationRef.hideAttachmentsPanel) automationRef.hideAttachmentsPanel();
            if (mainWindowRef && !mainWindowRef.isDestroyed()) mainWindowRef.webContents.send('show-status-message', '');
            injectText(`[EMAIL MODE ENDED] Contacts panel and browser closed. Say: "All done! Back to normal mode. Is there anything else I can help you with?" Do NOT call any tool.`);
        }
        return;
    }

    // ── send_email ────────────────────────────────────────────────────────
    if (call.name === 'send_email') {
        const _emailArgs = call.args;
        const _isConfirmation = !!_emailArgs.confirmed;
        const _emailCooldownMs = 8000;
        const _timeSinceLast = Date.now() - _emailLastCompletedAt;
        const _shouldBlock = _isConfirmation ? _emailInFlight : (_emailInFlight || _timeSinceLast < _emailCooldownMs);
        if (_shouldBlock) {
            sendToolResult(call.id, { status: 'already_processing', message: 'An email is already being processed. Do NOT call send_email again. Stay quiet and wait for the current flow to finish.' });
            return;
        }
        if (!_isConfirmation && !(_emailArgs.message_intent || '').trim()) {
            _emailInFlight = false;
            sendToolResult(call.id, { status: 'missing_content', message: `You skipped required steps. Say: "Let me back up." Then ask STEP 3: "Would you like to include an attachment?" — wait for answer. Then STEP 4: "What would you like the subject to be?" — wait. Then STEP 5: "What would you like to say?" — wait. Only THEN call send_email.` });
            return;
        }
        _emailInFlight = true;
        sendToolResult(call.id, { status: "Processing", message: `Looking up the contact and preparing the email. Say out loud: "Let me get that ready!" Then stay quiet while processing.` });

        const _runEmail = (extraNames) => {
            // If an attachment path is provided, read it locally and send as base64.
            // The Heroku backend cannot access the user's local filesystem.
            const emailPayload = { ..._emailArgs };
            if (emailPayload.attachment_path) {
                try {
                    if (fs.existsSync(emailPayload.attachment_path)) {
                        emailPayload.attachment_data = fs.readFileSync(emailPayload.attachment_path).toString('base64');
                        emailPayload.attachment_name = path.basename(emailPayload.attachment_path);
                    } else {
                        console.warn('[Email] Attachment not found:', emailPayload.attachment_path);
                        emailPayload.attachment_path = null;
                    }
                } catch (e) {
                    console.error('[Email] Failed to read attachment:', e.message);
                    emailPayload.attachment_path = null;
                }
            }
            backendPost('/api/email/send', emailPayload).then((result) => {
                if (!_ws) return;
                const speakText = result.speak || result.message || 'Email processed.';
                let instr;
                switch (result.status) {
                    case 'success':
                        _emailModeActive = true;
                        if (automationRef && automationRef.openBrowser) automationRef.openBrowser('https://mail.google.com/mail/u/0/#sent');
                        instr = `[EMAIL SENT - EMAIL MODE ACTIVE] ${speakText} Say: "Email sent! I've opened your sent folder to confirm." Then ask: "Would you like to send another email, or are you all done?" Wait for their answer. If they want to send ANOTHER: call control_contacts_panel with action="close_browser_keep_contacts", then ask who they want to email next. If they are DONE: call control_contacts_panel with action="close_email_mode". Do NOT call send_email yet — wait for their response first.`;
                        break;
                    case 'draft_saved':
                        instr = `[EMAIL DRAFT SAVED] ${speakText} Speak this out loud now. Do NOT call any tool.`;
                        break;
                    case 'needs_confirmation': {
                        const confirmArgs =
                            `confirmed=true, recipient_name="${_emailArgs.recipient_name || ''}", ` +
                            `recipient_email="${result.recipient_email || ''}", subject="${result.confirmed_subject || _emailArgs.subject || ''}", ` +
                            `message_intent="${_emailArgs.message_intent || ''}", confirmed_body="${(result.confirmed_body || '').replace(/"/g, "'")}", ` +
                            `draft_only=${!!_emailArgs.draft_only}` +
                            (result.attachment_path ? `, attachment_path="${result.attachment_path}"` : '');
                        instr =
                            `[EMAIL PREVIEW — read this to the user now] ${speakText} After reading it, ask: "Does this look good? Say yes to send, or tell me what to change." ` +
                            `If they say yes: call send_email with these EXACT args: ${confirmArgs}. ` +
                            `If they want to change the subject: ask what they prefer, then re-call send_email with the new subject. ` +
                            `If they want to change the content: ask what to change, then re-call send_email with updated message_intent. ` +
                            `If they say no/cancel: say "Got it, email cancelled." and do NOT call send_email again.` +
                            (extraNames ? ` [Known contacts: ${extraNames}]` : '');
                        break;
                    }
                    case 'needs_disambiguation':
                        instr = `[EMAIL MULTIPLE CONTACTS] Speak this out loud: "${speakText}" — then wait for the user's choice. When they say a number (1, 2, 3, or 4) or pick by name, call send_email again with the same recipient_name, subject, message_intent, and draft_only, plus selected_index set to the number they chose.`;
                        break;
                    case 'needs_username':
                        instr = `[EMAIL NO CONTACT FOUND] Speak this out loud: "${speakText}" — then wait for their answer. When they say the username, call send_email again with the same args plus recipient_email set to exactly what they said.`;
                        break;
                    case 'needs_domain':
                        instr = `[EMAIL NEEDS DOMAIN] Speak this out loud: "${speakText}" — then wait for their answer. When they say the domain, call send_email again with the same args plus recipient_email set to "${result.partial_username || ''}@[domain they said]".`;
                        break;
                    case 'auth_required':
                        instr = `[EMAIL AUTH REQUIRED] Tell the user: "Gmail isn't authorized yet. Please open a terminal in the robot-widget folder and run: npm run setup-google — it will open a browser to grant access to Gmail, Calendar, and Contacts. After that, restart Nova and everything will work." Do NOT call any tool.`;
                        break;
                    default:
                        instr = `[EMAIL ERROR] ${speakText} Tell the user what went wrong.`;
                }
                injectText(instr);
            }).catch((e) => {
                console.error('📧 [Email] Error:', e.message);
                if (_ws) injectText(`[EMAIL ERROR] The email could not be processed: ${e.message}. Tell the user there was a problem.`);
            }).finally(() => {
                _emailInFlight = false;
                _emailLastCompletedAt = Date.now();
            });
        };

        if (automationRef && automationRef.isContactsPanelOpen && !automationRef.isContactsPanelOpen()) {
            backendGet('/api/email/contacts?limit=20').then((contactResult) => {
                if (contactResult.contacts?.length > 0 && automationRef.showContactsPanel) {
                    automationRef.showContactsPanel(contactResult.contacts);
                }
                const nameList = (contactResult.contacts || []).map(c => c.displayName).join(', ');
                _runEmail(nameList);
            }).catch(() => _runEmail(null));
        } else {
            _runEmail(null);
        }
        return;
    }

    // ── calendar_action ───────────────────────────────────────────────────
    if (call.name === 'calendar_action') {
        const { action } = call.args;
        const calKey = `${action}:${call.args.time_expression || ''}:${call.args.event_title || ''}`;
        const nowCal = Date.now();
        if (nowCal - (_calendarDebounce.get(calKey) || 0) < CALENDAR_DEBOUNCE_MS) {
            sendToolResult(call.id, { status: 'already_done', message: 'This calendar action was just completed. Tell the user the result you already have. Do NOT call calendar_action again.' });
            return;
        }
        _calendarDebounce.set(calKey, nowCal);

        const ackMsg = action === 'get_events'
            ? `Say out loud right now: "Give me just a moment, I'm pulling up your calendar." Do NOT call calendar_action again.`
            : action === 'create_event'
            ? `Say out loud right now: "On it — adding that to your calendar right now." Do NOT call calendar_action again.`
            : action === 'delete_event'
            ? `Say out loud right now: "Sure, removing that from your calendar." Do NOT call calendar_action again.`
            : `Say out loud right now that you are processing the calendar request. Do NOT call calendar_action again.`;

        sendToolResult(call.id, { status: 'ok', message: ackMsg });
        if (mainWindowRef && !mainWindowRef.isDestroyed()) mainWindowRef.webContents.send('show-status-message', 'Checking your calendar...');

        backendPost('/api/calendar', call.args).then((result) => {
            if (!_ws) return;
            if (mainWindowRef && !mainWindowRef.isDestroyed()) mainWindowRef.webContents.send('show-status-message', '');
            const speakText = result.speak || result.message || 'Calendar action complete.';

            if (action === 'get_events' && result.data) {
                if (automationRef && automationRef.showCalendarPanel) automationRef.showCalendarPanel(result.data);
            }

            let calInstr;
            if (result.status === 'error') {
                calInstr = `[CALENDAR ERROR] ${speakText} Tell the user what went wrong. Do NOT call any tool.`;
            } else if (action === 'get_events') {
                calInstr = `[CALENDAR EVENTS] ${speakText} Say this to the user now. The calendar panel is showing. Do NOT call any tool.`;
            } else {
                calInstr = `[CALENDAR RESULT] ${speakText} Say this to the user now. Do NOT call any tool.`;
            }
            injectText(calInstr);
        }).catch((e) => {
            if (mainWindowRef && !mainWindowRef.isDestroyed()) mainWindowRef.webContents.send('show-status-message', '');
            if (_ws) injectText(`[CALENDAR ERROR] ${e.message}. Tell the user there was a problem with their calendar. Do NOT call any tool.`);
        });
        return;
    }

    // ── code_agent ────────────────────────────────────────────────────────
    if (call.name === 'code_agent') {
        const { action } = call.args;
        const nowCode = Date.now();
        const cooldown = CODE_AGENT_DEBOUNCE_MS[action] || 15000;
        if (nowCode - (_codeAgentDebounce.get(action) || 0) < cooldown) {
            sendToolResult(call.id, { status: 'cooldown', message: `Action "${action}" was just completed. Tell the user and wait for their next request. Do NOT call code_agent again.` });
            return;
        }
        _codeAgentDebounce.set(action, nowCode);

        const codeStatusLabels = {
            generate_code: 'Generating code... (30-60s)', modify_code: 'Modifying code...',
            create_project: 'Creating project...', open_project: 'Opening project...',
            list_projects: 'Loading projects...', preview_project: 'Starting preview server...',
            start_session: 'Starting code session...', end_session: 'Ending session...',
        };
        if (mainWindowRef && !mainWindowRef.isDestroyed()) mainWindowRef.webContents.send('show-status-message', codeStatusLabels[action] || 'Working...');

        const codeAckMessages = {
            generate_code:   `Say out loud right now: "I'm generating your ${call.args.project_type || ''} project now — this takes about 30 to 60 seconds!" Then stay quiet while the code is created. Do NOT call code_agent again.`,
            modify_code:     `Say out loud right now: "Applying your changes now!" Then stay quiet. Do NOT call code_agent again.`,
            create_project:  `Say out loud right now: "Creating your project folder." Do NOT call code_agent again.`,
            open_project:    `Say out loud right now: "Opening the project." Do NOT call code_agent again.`,
            list_projects:   `Say out loud right now: "Let me check your projects." Do NOT call code_agent again.`,
            preview_project: `Say out loud right now: "Starting the preview server." Do NOT call code_agent again.`,
            start_session:   `Say out loud right now: "Starting coding mode!" Do NOT call code_agent again.`,
            end_session:     `Say out loud right now: "Wrapping up the coding session." Do NOT call code_agent again.`,
        };

        sendToolResult(call.id, { status: 'ok', message: codeAckMessages[action] || `Acknowledged. Say briefly what you are doing. Do NOT call code_agent again.` });

        if (automationRef && automationRef.codeAgentTool) {
            automationRef.codeAgentTool(call.args).then((result) => {
                if (!_ws) return;
                if (mainWindowRef && !mainWindowRef.isDestroyed()) mainWindowRef.webContents.send('show-status-message', '');
                const speakText = result.speak || 'Done.';
                const resultDelay = (action === 'generate_code' || action === 'modify_code') ? 1800 : 0;
                let prompt;
                if (result.status === 'error') {
                    prompt = `[CODE AGENT ERROR] ${speakText} Tell the user what went wrong in a friendly way. Do NOT call any tool.`;
                } else if (result.status === 'needs_info' || result.status === 'needs_type' || result.status === 'needs_project') {
                    prompt = `[CODE AGENT NEEDS INPUT] ${speakText} Ask the user for the missing information naturally. Do NOT call any tool.`;
                } else if (result.status === 'success' || result.status === 'ready' || result.status === 'ok') {
                    prompt = `[CODE AGENT RESULT] ${speakText} Speak this to the user enthusiastically and naturally. ` + (action === 'generate_code' ? 'Describe what was built and invite them to tell you what to change or add. Do NOT call any tool.' : action === 'modify_code' ? 'Confirm the change and ask if anything else needs adjusting. Do NOT call any tool.' : 'Do NOT call any tool.');
                } else if (result.status === 'ended') {
                    prompt = `[CODE AGENT ENDED] ${speakText} Speak this naturally to the user and return to normal conversation mode. Do NOT call any tool.`;
                } else {
                    prompt = `[CODE AGENT] ${speakText} Speak this naturally to the user. Do NOT call any tool.`;
                }
                const injectResult = () => { if (_ws) injectText(prompt); };
                if (resultDelay > 0) setTimeout(injectResult, resultDelay); else injectResult();
            }).catch((e) => {
                if (mainWindowRef && !mainWindowRef.isDestroyed()) mainWindowRef.webContents.send('show-status-message', '');
                if (_ws) injectText(`[CODE AGENT ERROR] ${e.message}. Tell the user there was a problem with the code agent. Do NOT call any tool.`);
            });
        }
        return;
    }

    // ── macro_control ─────────────────────────────────────────────────────
    if (call.name === 'macro_control') {
        const { action } = call.args;
        const nowMacro = Date.now();
        if (nowMacro - (_macroDebounce.get(action) || 0) < MACRO_DEBOUNCE_MS) {
            sendToolResult(call.id, { status: 'already_done', message: 'This macro action was just handled. Tell the user what happened. Do NOT call macro_control again.' });
            return;
        }
        _macroDebounce.set(action, nowMacro);
        sendToolResult(call.id, { status: 'ok', message: `Processing macro ${action}. Say out loud what you are doing for the user, then wait for the result.` });
        if (automationRef && automationRef.handleMacroControl) {
            automationRef.handleMacroControl(call.args).then((result) => {
                if (_ws) injectText(`[MACRO RESULT] ${result.speak || 'Done.'} Speak this to the user naturally. Do NOT call any tool.`);
            }).catch((e) => {
                if (_ws) injectText(`[MACRO ERROR] ${e.message}. Tell the user something went wrong. Do NOT call any tool.`);
            });
        }
        return;
    }

    // ── notes_action ──────────────────────────────────────────────────────
    if (call.name === 'notes_action') {
        const { action } = call.args;
        const notesKey = action === 'open_note' ? 'open_note' : `${action}:${call.args.title || ''}`;
        const nowNotes = Date.now();
        const notesCooldown = NOTES_DEBOUNCE_MS[action] || 10000;
        if (nowNotes - (_notesDebounce.get(notesKey) || 0) < notesCooldown) {
            sendToolResult(call.id, { status: 'already_running', message: 'This notes action is already running. Tell the user to wait — do NOT call notes_action again.' });
            return;
        }
        _notesDebounce.set(notesKey, nowNotes);

        const notesStatusLabels = { list_notes: 'Loading notes...', search_notes: 'Searching notes...', open_note: 'Opening note...', create_note: 'Writing note...', update_note: 'Updating note...', exit_notes_mode: 'Closing notes...' };
        if (mainWindowRef && !mainWindowRef.isDestroyed()) mainWindowRef.webContents.send('show-status-message', notesStatusLabels[action] || 'Working...');

        const notesAckMessages = {
            list_notes:      `Say out loud: "Let me pull up your notes." Do NOT call notes_action again.`,
            search_notes:    `Say out loud: "Let me search through your notes." Do NOT call notes_action again.`,
            open_note:       `Say out loud: "Opening that note for you." Do NOT call notes_action again.`,
            create_note:     `Say out loud right now: "I am writing your note now, just a moment." Do NOT call notes_action again.`,
            update_note:     `Say out loud right now: "Updating your note now, one moment." Do NOT call notes_action again.`,
            exit_notes_mode: `Say out loud: "Closing notes mode." Do NOT call notes_action again.`,
        };
        sendToolResult(call.id, { status: 'ok', message: notesAckMessages[action] || `Acknowledged. Say briefly what you are doing. Do NOT call notes_action again.` });

        if (automationRef && automationRef.notesActionTool) {
            automationRef.notesActionTool(call.args).then((result) => {
                if (!_ws) return;
                if (mainWindowRef && !mainWindowRef.isDestroyed()) mainWindowRef.webContents.send('show-status-message', '');
                const speakText = result.speak || 'Done.';
                let prompt;
                if (result.status === 'error') prompt = `[NOTES ERROR] ${speakText} Tell the user what went wrong right now. Do NOT call any tool.`;
                else if (result.status === 'not_found') prompt = `[NOTES NOT FOUND] ${speakText} Ask which note they meant — the panel shows options. Say this out loud now. Do NOT call any tool.`;
                else if (result.status === 'created') prompt = `[NOTE CREATED] ${speakText} Say this out loud to the user right now. Do NOT call any tool.`;
                else if (result.status === 'updated') prompt = `[NOTE UPDATED] ${speakText} Say this out loud to the user right now. Do NOT call any tool.`;
                else if (result.status === 'exited') prompt = `[NOTES MODE EXITED] ${speakText} Say this out loud and return to normal conversation. Do NOT call any tool.`;
                else prompt = `[NOTES RESULT] ${speakText} Say this out loud to the user right now. Do NOT call any tool.`;
                const fastOps = ['list_notes', 'search_notes', 'open_note', 'exit_notes_mode'];
                const injectDelay = fastOps.includes(action) ? 700 : 0;
                setTimeout(() => { if (_ws) injectText(prompt); }, injectDelay);
            }).catch((e) => {
                if (mainWindowRef && !mainWindowRef.isDestroyed()) mainWindowRef.webContents.send('show-status-message', '');
                if (_ws) injectText(`[NOTES ERROR] ${e.message}. Tell the user there was a problem with their notes. Do NOT call any tool.`);
            });
        }
        return;
    }

    // ── analyze_screen ────────────────────────────────────────────────────
    if (call.name === 'analyze_screen') {
        const { question } = call.args;
        const nowScreen = Date.now();
        if (nowScreen - (_screenDebounce.get('screen_analyze') || 0) < SCREEN_DEBOUNCE_MS) {
            sendToolResult(call.id, { status: 'cooldown', message: 'I just analyzed the screen. Tell the user to ask again in a moment. Do NOT call analyze_screen again.' });
            return;
        }
        _screenDebounce.set('screen_analyze', nowScreen);
        if (mainWindowRef && !mainWindowRef.isDestroyed()) mainWindowRef.webContents.send('automation-log', '🖥️ Analyzing screen...');
        sendToolResult(call.id, { status: 'ok', message: `Capturing and analyzing the screen right now. Say out loud: "Let me take a look at your screen." Then wait quietly for the result.` });
        if (automationRef && automationRef.analyzeScreenTool) {
            automationRef.analyzeScreenTool(question).then((result) => {
                if (_ws) injectText(`[SCREEN ANALYSIS] ${result} Speak this out loud right now to the user in a natural, conversational way. Do NOT call any tool.`);
            }).catch((e) => {
                if (_ws) injectText(`[SCREEN ERROR] ${e.message}. Tell the user you had trouble analyzing the screen.`);
            });
        }
        return;
    }

    // ── generate_image ────────────────────────────────────────────────────
    if (call.name === 'generate_image') {
        const nowImg = Date.now();
        const hasBatch = Array.isArray(call.args.subjects) && call.args.subjects.length > 1;
        const imgDebounce = hasBatch ? IMAGE_GEN_BATCH_DEBOUNCE_MS : IMAGE_GEN_DEBOUNCE_MS;
        if (nowImg - _lastImageGenAt < imgDebounce) {
            sendToolResult(call.id, { status: 'cooldown', message: `Image generation is on cooldown. Tell the user their ${hasBatch ? 'batch of images is' : 'image is'} still being processed. Do NOT call generate_image again.` });
            return;
        }
        _lastImageGenAt = nowImg;

        const imgAck = hasBatch
            ? `Say out loud right now: "I'm generating all ${call.args.subjects.length} images now — this takes about 15 to 30 seconds. I'll let you know when they're all done!" Then stay quiet. Do NOT call generate_image again.`
            : `Say out loud right now: "Creating your ${call.args.style || 'realistic'} image now — almost done!" Then stay quiet. Do NOT call generate_image again.`;
        sendToolResult(call.id, { status: 'ok', message: imgAck });
        if (mainWindowRef && !mainWindowRef.isDestroyed()) mainWindowRef.webContents.send('show-status-message', hasBatch ? `Generating ${call.args.subjects.length} images...` : 'Generating image...');

        backendPost('/api/images/generate', call.args).then((result) => {
            if (!_ws) return;
            if (mainWindowRef && !mainWindowRef.isDestroyed()) mainWindowRef.webContents.send('show-status-message', '');

            if (result.status === 'error') {
                injectText(`[IMAGE GEN ERROR] ${result.speak} Tell the user what went wrong. Do NOT call generate_image again.`);
                return;
            }

            // Write images to Desktop
            const desktopPath = require('path').join(require('os').homedir(), 'Desktop');
            const savedFiles = [];
            const imagesToWrite = result.images || (result.base64 ? [{ base64: result.base64, mimeType: result.mimeType, fileName: result.fileName }] : []);
            for (const img of imagesToWrite) {
                try {
                    const filePath = require('path').join(desktopPath, img.fileName);
                    require('fs').writeFileSync(filePath, Buffer.from(img.base64, 'base64'));
                    savedFiles.push(img.fileName);
                    console.log(`🎨 [ImageGen] Saved: ${filePath}`);
                } catch (e) {
                    console.error(`🎨 [ImageGen] Write error: ${e.message}`);
                }
            }

            const fileList = savedFiles.map(f => `"${f}"`).join(', ');
            let prompt;
            if (result.status === 'batch_created') {
                prompt = `[IMAGES READY] ${result.speak} The images are saved to your Desktop: ${fileList}. Tell the user enthusiastically, naming each file. Ask how they look! Do NOT call any tool.`;
            } else {
                prompt = `[IMAGE READY] Your ${result.style || ''} image is on the Desktop as ${fileList}. Tell the user enthusiastically that their image is ready and saved to the Desktop. Ask how it looks! Do NOT call any tool.`;
            }
            injectText(prompt);
        }).catch((e) => {
            if (mainWindowRef && !mainWindowRef.isDestroyed()) mainWindowRef.webContents.send('show-status-message', '');
            if (_ws) injectText(`[IMAGE GEN ERROR] ${e.message}. Tell the user there was a problem generating the image. Do NOT call generate_image again.`);
        });
        return;
    }

    // ── video_editor ──────────────────────────────────────────────────────
    if (call.name === 'video_editor') {
        const { action } = call.args;
        const nowVE = Date.now();
        const veCooldown = VIDEO_EDITOR_DEBOUNCE_MS[action] || 10000;
        if (nowVE - (_videoEditorDebounce.get(action) || 0) < veCooldown) {
            sendToolResult(call.id, { status: 'cooldown', message: `Video editor action "${action}" was just performed. Tell the user what happened. Do NOT call video_editor again.` });
            return;
        }
        _videoEditorDebounce.set(action, nowVE);

        const veAckMessages = {
            list_projects:   `Say out loud: "Let me check your video projects." Do NOT call video_editor again.`,
            open_editor:     `Say out loud: "Opening the video editor now." Do NOT call video_editor again.`,
            import_file:     `Say out loud: "Importing that file." Do NOT call video_editor again.`,
            add_to_timeline: `Say out loud: "Adding to the timeline." Do NOT call video_editor again.`,
            delete_clip:     `Say out loud: "Deleting that clip." Do NOT call video_editor again.`,
            play_preview:    `Say out loud: "Playing the preview — this may take a moment to render." Do NOT call video_editor again.`,
            stop_preview:    `Say out loud: "Stopping the preview." Do NOT call video_editor again.`,
            save_project:    `Say out loud: "Saving your project." Do NOT call video_editor again.`,
            export_video:    `Say out loud: "Exporting your video. This may take a few minutes." Do NOT call video_editor again.`,
            guide:           `Say out loud: "Here's how to use the video editor." Do NOT call video_editor again.`,
        };
        sendToolResult(call.id, { status: 'ok', message: veAckMessages[action] || `Acknowledged. Say briefly what you are doing. Do NOT call video_editor again.` });
        if (mainWindowRef && !mainWindowRef.isDestroyed()) mainWindowRef.webContents.send('show-status-message', `Video editor: ${action}...`);

        if (automationRef && automationRef.videoEditorTool) {
            automationRef.videoEditorTool(call.args).then((result) => {
                if (!_ws) return;
                if (mainWindowRef && !mainWindowRef.isDestroyed()) mainWindowRef.webContents.send('show-status-message', '');
                const speakText = result.speak || 'Done.';
                let prompt;
                if (result.status === 'error') {
                    prompt = `[VIDEO EDITOR ERROR] ${speakText} Tell the user what went wrong. Do NOT call any tool.`;
                } else if (result.mode === 'show_projects') {
                    prompt = `[VIDEO PROJECTS] ${speakText} Read the list to the user. When they say a project name, call video_editor with action='open_editor'. Do NOT call any tool until they respond.`;
                } else if (result.status === 'exported') {
                    prompt = `[VIDEO EXPORTED] ${speakText} Tell the user their video is ready and ask how it looks. Do NOT call any tool.`;
                } else {
                    prompt = `[VIDEO EDITOR RESULT] ${speakText} Speak this to the user naturally. Do NOT call any tool.`;
                }
                injectText(prompt);
            }).catch((e) => {
                if (mainWindowRef && !mainWindowRef.isDestroyed()) mainWindowRef.webContents.send('show-status-message', '');
                if (_ws) injectText(`[VIDEO EDITOR ERROR] ${e.message}. Tell the user there was a problem with the video editor. Do NOT call any tool.`);
            });
        }
        return;
    }

    // ── generate_video ────────────────────────────────────────────────────
    if (call.name === 'generate_video') {
        const vgAction = call.args.action || 'generate';
        const nowVG = Date.now();

        if (_videoGenInFlight) {
            sendToolResult(call.id, { status: 'in_flight', message: 'Video is already being generated. Tell the user their video is still in progress and ask them to wait. Do NOT call generate_video again.' });
            return;
        }
        if (vgAction === 'generate' && nowVG - _lastVideoGenAt < VIDEO_GEN_DEBOUNCE_MS) {
            sendToolResult(call.id, { status: 'cooldown', message: 'Video generation was just started. Tell the user to wait — their video is being created. Do NOT call generate_video again.' });
            return;
        }

        if (mainWindowRef && !mainWindowRef.isDestroyed()) {
            const statusLabels = { generate: 'Generating video... (2-5 min)', list_prompts: 'Loading video prompts...', delete_prompt: 'Deleting prompt...' };
            mainWindowRef.webContents.send('show-status-message', statusLabels[vgAction] || 'Processing video...');
        }

        const vgAckMessages = {
            generate:      `Say out loud right now: "I have everything I need — creating your video now! This takes about 2 to 5 minutes. I'll let you know the moment it's ready. Feel free to chat while you wait!" Do NOT call generate_video again.`,
            list_prompts:  `Say out loud: "Let me pull up your saved video prompts." Do NOT call generate_video again.`,
            delete_prompt: `Say out loud: "Deleting that prompt now." Do NOT call generate_video again.`,
        };
        sendToolResult(call.id, { status: 'ok', message: vgAckMessages[vgAction] || `Acknowledged. Say briefly what you are doing. Do NOT call generate_video again.` });

        if (vgAction !== 'generate') {
            backendPost('/api/videos', call.args).then((result) => {
                if (!_ws) return;
                if (mainWindowRef && !mainWindowRef.isDestroyed()) mainWindowRef.webContents.send('show-status-message', '');
                const speakText = result.speak || 'Done.';
                let prompt;
                if (vgAction === 'list_prompts') prompt = `[VIDEO PROMPTS] ${speakText} Read the list to the user. If they want to reuse one, ask what to change then call generate_video with the improved details. Do NOT call any tool until they respond.`;
                else if (vgAction === 'delete_prompt') prompt = `[VIDEO PROMPT DELETED] ${speakText} Say this naturally. Do NOT call any tool.`;
                else prompt = `[VIDEO GEN RESULT] ${speakText} Do NOT call any tool.`;
                injectText(prompt);
            }).catch((e) => {
                if (mainWindowRef && !mainWindowRef.isDestroyed()) mainWindowRef.webContents.send('show-status-message', '');
                if (_ws) injectText(`[VIDEO GEN ERROR] ${e.message}. Tell the user there was a problem. Do NOT call any tool.`);
            });
            return;
        }

        _videoGenInFlight = true;
        _lastVideoGenAt = nowVG;

        backendPost('/api/videos/start', call.args).then(async ({ operationName }) => {
            console.log(`🎥 [VideoGen] Job started: ${operationName}, polling...`);
            const INTERVAL = 10000;
            const MAX_POLLS = 40;

            for (let i = 0; i < MAX_POLLS; i++) {
                await new Promise(r => setTimeout(r, INTERVAL));
                const poll = await backendGet(`/api/videos/status/${encodeURIComponent(operationName)}`).catch(e => ({ status: 'error', message: e.message }));
                console.log(`🎥 [VideoGen] Poll ${i + 1}: status=${poll.status}`);
                if (poll.status === 'completed') {
                    _videoGenInFlight = false;
                    _lastVideoGenAt = Date.now();
                    if (mainWindowRef && !mainWindowRef.isDestroyed()) mainWindowRef.webContents.send('show-status-message', '');
                    if (!_ws) return;

                    // Save video locally
                    const videosDir = process.platform === 'darwin' ? require('path').join(require('os').homedir(), 'Movies') : require('path').join(require('os').homedir(), 'Videos');
                    if (!require('fs').existsSync(videosDir)) require('fs').mkdirSync(videosDir, { recursive: true });
                    const filename = `Nova_Video_${Date.now()}.mp4`;
                    const outputPath = require('path').join(videosDir, filename);

                    try {
                        if (poll.type === 'base64') {
                            require('fs').writeFileSync(outputPath, Buffer.from(poll.data, 'base64'));
                            console.log(`🎥 [VideoGen] Saved to: ${outputPath}`);
                        } else if (poll.type === 'uri') {
                            // Download the video
                            await new Promise((resolve, reject) => {
                                const file = require('fs').createWriteStream(outputPath);
                                require('https').get(poll.uri, (response) => {
                                    response.pipe(file);
                                    file.on('finish', () => { file.close(); resolve(); });
                                }).on('error', (e) => { require('fs').unlink(outputPath, () => {}); reject(e); });
                            });
                            console.log(`🎥 [VideoGen] Downloaded to: ${outputPath}`);
                        }
                        // Open video with system player
                        const { exec } = require('child_process');
                        const openCmd = process.platform === 'darwin' ? `open "${outputPath}"` : process.platform === 'win32' ? `start "" "${outputPath}"` : `xdg-open "${outputPath}"`;
                        exec(openCmd, (err) => { if (err) console.warn('[VideoGen] Could not auto-open video:', err.message); });
                    } catch (saveErr) {
                        console.error(`🎥 [VideoGen] Save error: ${saveErr.message}`);
                    }

                    injectText(`[VIDEO READY] Your video has been saved as "${filename}" in your ${getSystemVideosFolderName()} folder and is now opening. Tell the user enthusiastically that their video is ready! Ask how it looks and if anything needs improving. Do NOT call any tool until they respond.`);
                    return;
                }
                if (poll.status === 'error') {
                    _videoGenInFlight = false;
                    if (mainWindowRef && !mainWindowRef.isDestroyed()) mainWindowRef.webContents.send('show-status-message', '');
                    if (_ws) injectText(`[VIDEO GEN ERROR] ${poll.message || 'Unknown error'}. Tell the user there was a problem and ask if they want to try again. Do NOT call any tool.`);
                    return;
                }
            }
            _videoGenInFlight = false;
            if (mainWindowRef && !mainWindowRef.isDestroyed()) mainWindowRef.webContents.send('show-status-message', '');
            if (_ws) injectText(`[VIDEO GEN TIMEOUT] Video generation timed out after 6+ minutes. Tell the user there was a delay and ask if they want to try again.`);
        }).catch((e) => {
            _videoGenInFlight = false;
            _lastVideoGenAt = Date.now();
            if (mainWindowRef && !mainWindowRef.isDestroyed()) mainWindowRef.webContents.send('show-status-message', '');
            if (_ws) injectText(`[VIDEO GEN ERROR] ${e.message}. Tell the user there was a problem. Do NOT call any tool.`);
        });
        return;
    }

    // Unknown tool — forward as a no-op
    console.warn(`[Live] Unknown tool: ${call.name}`);
    sendToolResult(call.id, { status: 'error', message: `Unknown tool: ${call.name}` });
}

// ── Session config (system prompt + tool declarations) ───────────────────────
function buildSessionConfig() {
    const { SYSTEM_INSTRUCTION, TOOLS } = require('./live_config.js');
    return {
        model: 'gemini-3.1-flash-live-preview',
        responseModalities: ['AUDIO'],
        systemInstruction: SYSTEM_INSTRUCTION,
        tools: TOOLS,
    };
}

// ── Public API ──────────────────────────────────────────────────────────────
function startLiveSession(mainWindow, automation) {
    mainWindowRef = mainWindow;
    automationRef = automation;

    _browserIsOpen = false;
    _lastBrowserActionAt = 0;
    _lastSmartClickAt = 0;
    _lastOpenAt = 0;
    _lastExplicitCloseAt = 0;
    _lastOpenedQuery = '';
    _storeAssistantActive = false;
    _lastAutoScanAt = 0;
    _lastGetBrowserStateAt = 0;
    _lastAutoScanUrl = '';
    _stuckClickCount = 0;
    _lastSmartClickTarget = '';
    _codeAgentDebounce.clear();
    _notesDebounce.clear();
    _emailInFlight = false;
    _emailLastCompletedAt = 0;
    _emailModeActive = false;
    _listContactsLastAt = 0;
    _videoGenInFlight = false;

    if (_ws && (_ws.readyState === WebSocket.OPEN || _ws.readyState === WebSocket.CONNECTING)) {
        console.log('[Live] Session already connecting/open');
        return;
    }

    const wsUrl = `${BACKEND_WS_URL}/ws/live`;
    console.log(`[Live] Connecting to backend: ${wsUrl}`);

    _ws = new WebSocket(wsUrl);

    _ws.on('open', () => {
        console.log('[Live] Connected to backend WebSocket');
        const config = buildSessionConfig();
        wsSend({ type: 'SESSION_START', config });
    });

    _ws.on('message', async (raw) => {
        let msg;
        try { msg = JSON.parse(raw.toString()); } catch { return; }

        switch (msg.type) {
            case 'SESSION_READY':
                console.log('[Live] Session ready');
                if (mainWindow && !mainWindow.isDestroyed()) {
                    mainWindow.webContents.send('live-session-event', { event: 'connected' });
                    mainWindow.webContents.send('live-session-event-audio', { event: 'connected' });
                }
                break;

            case 'AUDIO_RESPONSE':
                if (mainWindow && !mainWindow.isDestroyed()) {
                    mainWindow.webContents.send('live-audio-chunk', msg.data);
                }
                break;

            case 'TEXT_RESPONSE':
                if (mainWindow && !mainWindow.isDestroyed()) {
                    mainWindow.webContents.send('live-text-chunk', msg.text);
                }
                break;

            case 'TOOL_REQUEST':
                try {
                    await handleToolCall({ id: msg.callId, name: msg.name, args: msg.args });
                } catch (e) {
                    console.error(`[Live] Tool handler error for ${msg.name}:`, e.message);
                    sendToolResult(msg.callId, { status: 'error', message: e.message });
                }
                break;

            case 'SESSION_CLOSED':
                console.log('[Live] Session closed by backend');
                _ws = null;
                _emailInFlight = false;
                _videoGenInFlight = false;
                if (mainWindow && !mainWindow.isDestroyed()) {
                    mainWindow.webContents.send('live-session-event', { event: 'closed' });
                    mainWindow.webContents.send('live-session-event-audio', { event: 'closed' });
                }
                break;

            case 'SESSION_ERROR':
                console.error('[Live] Session error:', msg.message);
                if (mainWindow && !mainWindow.isDestroyed()) {
                    mainWindow.webContents.send('live-session-event', { event: 'error', message: msg.message });
                }
                break;
        }
    });

    _ws.on('error', (e) => {
        console.error('[Live] WebSocket error:', e.message);
        if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('live-session-event', { event: 'error', message: e.message });
        }
    });

    _ws.on('close', () => {
        console.log('[Live] WebSocket closed');
        _ws = null;
        // Notify the renderer so isLiveActive resets and auto-reconnect fires.
        if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('live-session-event', { event: 'closed' });
            mainWindow.webContents.send('live-session-event-audio', { event: 'closed' });
        }
    });
}

function sendAudioChunk(base64Data) {
    wsSend({ type: 'AUDIO_CHUNK', data: base64Data });
}

function sendTextChunk(text) {
    wsSend({ type: 'TEXT_CHUNK', text });
}

function endLiveSession() {
    if (_ws) {
        console.log('[Live] Ending session');
        wsSend({ type: 'SESSION_END' });
        _ws = null;
    }
    _emailInFlight = false;
    _emailLastCompletedAt = 0;
    _emailModeActive = false;
    _listContactsLastAt = 0;
    _videoGenInFlight = false;
}

function setBrowserOpen(value) {
    _browserIsOpen = value;
    if (!value) {
        _storeAssistantActive = false;
        _lastAutoScanUrl = '';
        _stuckClickCount = 0;
    }
}

function setStoreAssistantActive(value) {
    _storeAssistantActive = value;
    console.log(`🛍️ [Live] Store assistant mode: ${value}`);
}

module.exports = {
    startLiveSession,
    sendAudioChunk,
    sendTextChunk,
    endLiveSession,
    setBrowserOpen,
    setStoreAssistantActive,
    onDomMapAvailable,
};
