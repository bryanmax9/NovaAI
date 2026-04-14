require('dotenv').config();
const { GoogleGenAI, Modality } = require('@google/genai');
const { ipcMain } = require('electron');

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

let activeSession = null;
let mainWindowRef = null;
let automationRef = null;
const lastExecCommandMap = new Map(); // cmdKey → last call timestamp
const EXEC_COOLDOWN_MS = 15000; // Per-command cooldown: 15 seconds
let _browserIsOpen = false;          // True only after Nova explicitly opened the browser this session
let _lastBrowserActionAt = 0;        // Timestamp of last open/scroll/close action (debounce spam)
let _lastSmartClickAt = 0;           // Separate clock for smart_click — must not be gated by 'open'
let _lastOpenAt = 0;                 // When the last 'open' fired — smart_click waits if too recent
let _lastOpenedQuery = '';           // Last opened query — blocks re-opening the same URL within 8s
let _storeAssistantActive = false;   // True while user is on a known store — tells smart_click to follow up with get_browser_state
let _lastAutoScanAt = 0;             // Timestamp of last auto-scan inject — blocks redundant get_browser_state calls
let _lastGetBrowserStateAt = 0;      // Cooldown for get_browser_state calls to stop looping
let _lastAutoScanUrl = '';           // URL seen in the most recent auto-scan — for stuck-navigation detection
let _stuckClickCount = 0;            // How many consecutive auto-scans landed on the same URL after smart_click
let _lastSmartClickTarget = '';      // target_text of the most recent smart_click — used in fallback message

// ── STORE AUTO-SCAN ────────────────────────────────────────────────────────
// Shared helper used after both smart_click and open (in store mode).
// Reads the current DOM map, runs stuck-navigation detection (if checkStuck),
// then injects a narration prompt so Nova always speaks after landing on a page.
async function runStoreAutoScan(checkStuck) {
    if (!activeSession || !automationRef) return;
    console.log('🛍️ [Store] Auto-scanning page...');

    const domMapPromise = new Promise((resolve) => {
        const timer = setTimeout(() => {
            ipcMain.removeAllListeners('dom-map-available');
            resolve({ map: [], url: '' });
        }, 5000);
        ipcMain.once('dom-map-available', (data) => {
            clearTimeout(timer);
            resolve(data || { map: [], url: '' });
        });
    });

    automationRef.getDomMap();
    const { map, url } = await domMapPromise;
    if (!map || map.length === 0) return;

    // ── Stuck navigation detection (only for smart_click, not open) ──────────
    if (checkStuck) {
        if (_lastAutoScanUrl !== '' && url === _lastAutoScanUrl) {
            _stuckClickCount++;
            console.log(`⚠️ [Store] Navigation stuck on ${url} (attempt #${_stuckClickCount})`);
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
            console.log(`🔀 [Store] Injecting direct-URL fallback for "${target}"`);
            try {
                _lastAutoScanAt = Date.now();
                activeSession.sendRealtimeInput({ text: fallback });
                setTimeout(() => {
                    if (activeSession) activeSession.sendRealtimeInput({ text: 'Navigate directly using action=open now.' });
                }, 300);
            } catch (e) {
                console.error('🛍️ [Store] Fallback inject failed:', e);
            }
            return;
        }
    } else {
        // For direct open: always reset stuck state since we navigated intentionally
        _stuckClickCount = 0;
        _lastAutoScanUrl = url;
    }
    // ── End stuck detection ──────────────────────────────────────────────────

    // Extract headings and product-signal elements (max 20, deduped)
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

    console.log(`🛍️ [Store] Injecting navigation prompt for ${url} (${highlights.split(',').length} highlights)`);
    try {
        _lastAutoScanAt = Date.now();
        activeSession.sendRealtimeInput({ text: prompt });
        setTimeout(() => {
            if (activeSession) activeSession.sendRealtimeInput({ text: 'Please speak your response out loud now.' });
        }, 300);
    } catch (e) {
        console.error('🛍️ [Store] Auto-scan inject failed:', e);
    }
}

async function startLiveSession(mainWindow, automation) {
    mainWindowRef = mainWindow;
    automationRef = automation;
    _browserIsOpen = false;      // Reset browser state for each new session
    _lastBrowserActionAt = 0;
    _lastSmartClickAt = 0;
    _lastOpenAt = 0;
    _lastOpenedQuery = '';
    _storeAssistantActive = false;
    _lastAutoScanAt = 0;
    _lastGetBrowserStateAt = 0;
    _lastAutoScanUrl = '';
    _stuckClickCount = 0;
    _lastSmartClickTarget = '';
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

                    "== PERSONALITY ==\n" +
                    "You are warm, curious, and genuinely informative — like a knowledgeable friend, not a search engine. " +
                    "Give complete, helpful answers. Never be vague or cut answers short just to be brief. " +
                    "Adapt your length to what the question needs — simple questions get clear short answers, complex topics get full explanations. " +
                    "NEVER ask the user where they found you, how they got you, who made you, or any meta question about your own existence or installation. " +
                    "NEVER introduce yourself unprompted.\n\n" +

                    "== YOUR PRIMARY MODE IS CONVERSATION ==\n" +
                    "You have encyclopedic knowledge: science, math, history, weather, news, coding, homework, recipes, jokes, culture — everything. " +
                    "For ANY question or topic, respond verbally with your own knowledge. NEVER open a browser or run a command just to answer a question.\n" +
                    "This means: if someone asks about news, current events, weather, sports scores, stock prices, or ANYTHING informational — answer from your knowledge. " +
                    "Do NOT open the browser. Do NOT search Google. Just talk.\n" +
                    "NEVER triggers for control_browser action='open': 'what is the news', 'noticias de hoy', 'current events', 'what happened today', 'latest news', 'tell me about X', 'what is X', 'how does X work', any question, any topic.\n\n" +

                    "== TOOL USAGE: STRICT TRIGGER RULES ==\n" +
                    "You have four tools. Use them ONLY when the user gives a direct, unambiguous action command. NEVER call a tool because the user mentioned a topic or asked a question.\n\n" +

                    "1. execute_system_command — ONLY when user explicitly says 'open', 'launch', 'start', or 'run' followed by an app name.\n" +
                    "   - Triggers: 'open zoom', 'launch terminal', 'open docs'\n" +
                    "   - NEVER triggers for 'close': closing the browser means Nova's built-in browser only — use control_browser action='close' instead. NEVER call execute_system_command to close browsers (brave, chrome, firefox, etc.) unless the user explicitly named that exact app.\n" +
                    "   - Never triggers: questions, topics, 'what is X', 'tell me about X', any conversation\n" +
                    "   - NEVER call more than once per app. If cooldown returns Skipped, do NOT retry.\n\n" +

                    "2. control_browser — ONLY for these exact browser commands:\n" +
                    "   - 'scroll down' / 'scroll up' → action='scroll', direction='down' or 'up'\n" +
                    "   - 'search for X on google' / 'go to website X' / 'open X in the browser' → action='open', query='X'\n" +
                    "   - 'play X on youtube' / 'search youtube for X' → action='search_youtube', query='X'\n" +
                    "   - 'click on X' / 'click X' → action='smart_click', target_text='X'\n" +
                    "   - 'close the browser' / 'close browser' / 'close it' (when browser is open) → action='close'\n" +
                    "   - 'switch to incognito' / 'enable incognito mode' / 'go incognito' / 'turn on incognito' → action='toggle_incognito'\n" +
                    "   - 'exit incognito' / 'disable incognito' / 'go back to normal mode' → action='toggle_incognito'\n" +
                    "   - NEVER call control_browser for general conversation, questions, topics, news requests, or anything that doesn't directly control the browser UI.\n" +
                    "   - When closing the browser: call control_browser action='close' ONCE. Do NOT also call execute_system_command to close other browsers.\n" +
                    "   - NEVER call action='close' unless the user explicitly said the word 'close' AND referred to the browser.\n\n" +

                    "3. get_browser_state — ONLY when user says 'what is on screen' or 'list the elements'. " +
                    "   Do NOT call this before clicking. For all clicks use control_browser action='smart_click' directly.\n\n" +

                    "4. create_research_paper — EXTREMELY STRICT. This tool takes several minutes and cannot be cancelled.\n" +
                    "   ONLY call it when ALL of these conditions are met simultaneously:\n" +
                    "   a) The user used an explicit creation verb: 'write', 'create', 'generate', 'make', 'build', 'compose', or 'prepare'\n" +
                    "   b) The user explicitly said the words 'research paper', 'academic paper', 'scientific paper', or 'research essay'\n" +
                    "   c) The user named a specific topic for the paper\n" +
                    "   EXAMPLE triggers: 'write me a research paper on climate change', 'create an academic paper about AI'\n" +
                    "   NEVER triggers: discussing a topic, asking questions, 'tell me about X', 'what is X', any conversation, partial sentences, ambient speech\n" +
                    "   ABSOLUTE NEVER triggers: any sentence containing 'open', 'show', 'find', 'display', 'locate', or 'get' before 'research paper' — these are file-open requests, NOT creation requests.\n" +
                    "   Examples of file-open requests (NEVER call create_research_paper for these):\n" +
                    "     'open file research paper on climate change'\n" +
                    "     'open the research paper'\n" +
                    "     'show me the research paper about AI'\n" +
                    "     'find research paper climate change'\n" +
                    "   If you are even slightly unsure, DO NOT call this tool — answer conversationally instead.\n\n" +

                    "== CLICKING ==\n" +
                    "When user says 'click on X' or 'click X': immediately call control_browser with action='smart_click' and target_text='X'. Do not call get_browser_state first.\n\n" +

                    "== AFTER ANY TOOL CALL ==\n" +
                    "Confirm the action in one short sentence, then return to normal conversation.\n\n" +

                    "== STORE ASSISTANT MODE ==\n" +
                    "When you receive a [STORE DETECTED - SYSTEM NOTIFICATION] message, your ONLY job is to speak a warm verbal greeting and ask what the user wants to buy. " +
                    "ABSOLUTELY DO NOT call get_browser_state, control_browser, or any tool when you receive this notification. " +
                    "Just talk. Wait for the user to tell you what they want BEFORE using any tools.\n\n" +

                    "DIRECT URL NAVIGATION — If you receive a [NAVIGATION STUCK] message, or if smart_click fails to reach a product page, " +
                    "use control_browser action='open' with a direct URL you construct from your knowledge. " +
                    "Known Apple URL patterns: apple.com/shop/buy-iphone/iphone-15 (iPhone 15), apple.com/shop/buy-iphone/iphone-16 (iPhone 16), " +
                    "apple.com/shop/buy-iphone/iphone-16-pro (iPhone 16 Pro), apple.com/shop/buy-ipad/ipad-air (iPad Air), " +
                    "apple.com/shop/buy-ipad/ipad-pro (iPad Pro), apple.com/shop/buy-mac/macbook-pro (MacBook Pro), " +
                    "apple.com/shop/buy-mac/macbook-air (MacBook Air), apple.com/shop/buy-watch/apple-watch-series-10 (Apple Watch Series 10). " +
                    "For Amazon: amazon.com/s?k=<product+name>. For eBay: ebay.com/sch/i.html?_nkw=<product+name>.\n\n" +

                    "Once the user tells you what they want, follow this shopping flow:\n" +
                    "STEP 1 — CATEGORY NAV: Use smart_click to navigate to that product section on the site. " +
                    "If smart_click fails to navigate after 1 attempt, skip to direct URL navigation instead of retrying.\n" +
                    "STEP 2 — READ PRODUCT LIST: After clicking to a category page, call get_browser_state to read what products are listed. " +
                    "The tool response will contain instructions telling you to narrate — follow them. " +
                    "List the products out loud, add your own knowledge about popularity and what is best-rated, and ask which one they want. " +
                    "Example: 'On this page I can see the iPad mini, iPad Air, iPad, and iPad Pro. The Pro is Apple's most powerful tablet, loved by creators and professionals. The Air is the sweet spot for most people — great performance at a lower price. Which one would you like to check out? I can click it for you.'\n" +
                    "STEP 3 — READ PRODUCT DETAILS: After the user names a product and you click it, call get_browser_state ONCE on that product page. " +
                    "IMPORTANT: Some product pages are marketing/overview pages that do not show prices in their DOM. " +
                    "If the tool response says 'NOTE: This page does not show prices' — do NOT call get_browser_state again. " +
                    "Instead, immediately speak from your own knowledge about that product's current prices, models, storage options, and variants. " +
                    "You know Apple's full lineup, Amazon pricing, eBay listing ranges, and major retailer product specs — use that knowledge. " +
                    "Read all variants, sizes, storage tiers, materials, colors, and prices from the elements and narrate everything naturally. " +
                    "Also add what you know from your own knowledge: notable specs, who it is best for, common review highlights. " +
                    "Example for Apple: 'The iPad Air comes in 11-inch starting at $599 or 13-inch starting at $799. Storage is 128GB or 256GB, and you can add Wi-Fi plus Cellular for $150 more. The M3 chip makes it faster than most laptops — reviewers love it for drawing, note-taking, and media. Which size and storage are you thinking?' " +
                    "Example for jewelry: 'This ring is available in yellow gold, white gold, and rose gold, sizes 5 through 10, starting at $420. Customers love the yellow gold version — it is the best-seller. Which metal and size would you like?' " +
                    "Example for Amazon/eBay: 'There are three options here — brand new from $349, used from $210, and Amazon Renewed at $275 with a 90-day guarantee. For most people the Renewed option is the best value. Which would you prefer?' " +
                    "STEP 4 — SELECT CONFIG: When the user picks a config, use smart_click to select those options on the page (size button, color swatch, storage tier, etc.) and confirm what was selected.\n" +
                    "STEP 5 — ADD TO CART: When the user says 'add to cart', 'buy this', 'add to bag', or similar purchase intent:\n" +
                    "  a) If a specific model, size, storage, and color have already been chosen, use smart_click to click 'Add to Bag', 'Add to Cart', or the equivalent button on the page.\n" +
                    "  b) If any required option is still missing (e.g. user hasn't picked storage size, color, or connectivity), ask for it first: 'Before I add it to the bag, which storage size do you want — 128GB or 256GB?' Then once confirmed, click the option and then click Add to Bag.\n" +
                    "  c) After clicking Add to Bag, confirm: 'Done! I've added the [product + config] to your bag. Want to keep shopping or head to checkout?'\n" +
                    "Stay in store-guide mode until the user asks to leave or changes topic.\n\n" +

                    "== LANGUAGE ==\n" +
                    "Always respond in the user's language. Tool parameter values must be in English.",

                tools: [
                    {
                        functionDeclarations: [
                            {
                                name: "get_browser_state",
                                description: "Returns a list of all visible interactive elements on the current browser page, including their text, labels, and types. Use this in two situations: (1) when the user explicitly asks what is on screen or to list elements; (2) automatically in Store Assistant Mode after navigating to a product category page or a product detail page, so you can read product names, variants, sizes, storage options, materials, prices, and plans — then narrate them to the user. Do NOT call this before clicking for a user-requested click — for all user-requested clicks use control_browser with action='smart_click' directly.",
                                parameters: { type: "OBJECT", properties: {} }
                            },
                            {
                                name: "control_browser",
                                description: "Controls Nova's browser. Use for explicit browser commands only: open (search/navigate), scroll (up/down), smart_click (click by visible text — use this for ALL clicks), search_youtube, close, toggle_incognito (switch between normal and incognito mode). For clicking always use smart_click with the visible text on screen — never call get_browser_state first. Never use for answering questions.",
                                parameters: {
                                    type: "OBJECT",
                                    properties: {
                                        action: {
                                            type: "STRING",
                                            enum: ["open", "scroll", "smart_click", "search_youtube", "close", "toggle_incognito"],
                                            description: "The browser action to perform. Use smart_click for all clicks. Use toggle_incognito to switch incognito mode on or off."
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
                                const nowGbs = Date.now();

                                // 1. Block calls that fire within 1.5s of an auto-scan (Gemini echo).
                                if (nowGbs - _lastAutoScanAt < 1500) {
                                    console.log('🛍️ [Store] get_browser_state suppressed — auto-scan just ran (<1.5s).');
                                    activeSession.sendRealtimeInput({
                                        functionResponses: [{
                                            id: call.id,
                                            response: {
                                                status: "Skipped",
                                                message: "Page scan just completed. Speak the product information out loud right now — models, prices, variants. Do NOT stay silent."
                                            }
                                        }]
                                    });
                                    setTimeout(() => {
                                        if (activeSession) activeSession.sendRealtimeInput({ text: 'Please speak your response out loud now.' });
                                    }, 200);
                                    return;
                                }

                                // 2. Global 3s cooldown between consecutive get_browser_state calls —
                                //    prevents Gemini from looping when the page has no price elements.
                                if (nowGbs - _lastGetBrowserStateAt < 3000) {
                                    console.log('🛡️ get_browser_state cooldown — too soon after last call.');
                                    activeSession.sendRealtimeInput({
                                        functionResponses: [{
                                            id: call.id,
                                            response: {
                                                status: "Skipped",
                                                message: "Already retrieved page state. Do NOT call get_browser_state again. Speak out loud right now using your own knowledge about this product — prices, models, variants. Do NOT stay silent."
                                            }
                                        }]
                                    });
                                    setTimeout(() => {
                                        if (activeSession) activeSession.sendRealtimeInput({ text: 'Please speak your response out loud now.' });
                                    }, 200);
                                    return;
                                }

                                _lastGetBrowserStateAt = nowGbs;
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

                                // Extract the most useful elements: ones with real text content.
                                // Filter out blank/icon-only elements, deduplicate by text,
                                // and boost elements that look like product names or prices.
                                const seen = new Set();
                                const filtered = (map || []).filter(el => {
                                    const t = (el.text || '').trim();
                                    if (!t || t.length < 2) return false;
                                    if (seen.has(t)) return false;
                                    seen.add(t);
                                    return true;
                                });

                                // Separate price/product elements from generic nav links
                                const productEls = filtered.filter(el => {
                                    const t = el.text.toLowerCase();
                                    return /\$|price|from |starting|storage|gb|tb|inch|mm|size|color|material|edition|model|plan|tier|buy|add to cart|review|rating|stars?/.test(t);
                                });
                                const otherEls = filtered.filter(el => {
                                    const t = el.text.toLowerCase();
                                    return !/\$|price|from |starting|storage|gb|tb|inch|mm|size|color|material|edition|model|plan|tier|buy|add to cart|review|rating|stars?/.test(t);
                                });

                                // Send product-relevant elements first, then fill remaining budget
                                const budget = 120;
                                const combined = [
                                    ...productEls.slice(0, 80),
                                    ...otherEls.slice(0, budget - Math.min(productEls.length, 80))
                                ];

                                // Determine if this looks like a store page to tailor the instruction.
                                // Use _storeAssistantActive (set by store detection) OR URL-pattern fallback.
                                const looksLikeStorePage = _storeAssistantActive ||
                                    /shop|buy|product|store|cart|checkout|category|catalog|listing|pdp|item|detail|\/watch|\/iphone|\/ipad|\/mac|\/airpods|\/tv|\/accessories|\/gaming|\/electronics|\/jewelry|\/clothing|\/dp\/|\/itm\//.test((url || '').toLowerCase());

                                // Tell Gemini whether prices were visible — so it knows to use its own
                                // knowledge if the page is a marketing/overview page without pricing.
                                const hasPriceData = productEls.length > 0;
                                const priceNote = hasPriceData
                                    ? ''
                                    : ' NOTE: This page does not show prices in its elements — it may be a marketing/overview page. Use your own training knowledge to describe this product\'s current prices, models, and variants. Do NOT call get_browser_state again.';

                                const info = looksLikeStorePage
                                    ? "You are in Store Assistant Mode on a shopping page. " +
                                      "Read through these elements carefully and extract: product names, model variants, sizes, storage tiers, colors, materials, prices, and ratings. " +
                                      "Immediately speak out loud in a friendly, enthusiastic way — list the products and prices you found, add your own knowledge about popularity and best value, and ask the user which one they want. " +
                                      "Do NOT stay silent. Do NOT say 'I found X elements'. Narrate like a shopping guide and then ask your follow-up question." +
                                      priceNote
                                    : "List of interactive elements on the current page. Use smart_click with the element text to click any of them.";

                                activeSession.sendRealtimeInput({
                                    functionResponses: [{
                                        id: call.id,
                                        response: {
                                            elements: combined,
                                            url: url || 'Active Page',
                                            info
                                        }
                                    }]
                                });

                                // Double-injection for store pages: send a short follow-up to
                                // break Gemini out of silence after the functionResponse.
                                if (looksLikeStorePage) {
                                    setTimeout(() => {
                                        if (activeSession) {
                                            activeSession.sendRealtimeInput({ text: 'Please speak your response out loud now.' });
                                        }
                                    }, 300);
                                }

                            } else if (call.name === 'control_browser') {
                                const { action, query, direction, element_id, target_text } = call.args;
                                console.log(`🌍 [Browser Tool] Action: ${action}`);

                                // Debounce — smart_click uses its OWN clock so it is never
                                // blocked by a recent 'open' (Gemini often batches open+click).
                                // All other actions share the general debounce.
                                const nowBrowser = Date.now();
                                const isClick = action === 'smart_click' || action === 'click_id';
                                if (isClick) {
                                    if (nowBrowser - _lastSmartClickAt < 1500) {
                                        console.log(`🛡️ smart_click debounced — duplicate click too soon.`);
                                        activeSession.sendRealtimeInput({
                                            functionResponses: [{
                                                id: call.id,
                                                response: { status: "Skipped", message: "Already clicked recently. Resume conversation." }
                                            }]
                                        });
                                        return;
                                    }
                                } else {
                                    if (nowBrowser - _lastBrowserActionAt < 3000) {
                                        console.log(`🛡️ Browser action debounced — too soon after last action.`);
                                        activeSession.sendRealtimeInput({
                                            functionResponses: [{
                                                id: call.id,
                                                response: { status: "Skipped", message: "Already performed recently. Resume conversation." }
                                            }]
                                        });
                                        return;
                                    }
                                }

                                // Guard: 'close' is only valid if browser was actually opened this session
                                if (action === 'close' && !_browserIsOpen) {
                                    console.log('🛡️ Browser close ignored — browser is not open.');
                                    activeSession.sendRealtimeInput({
                                        functionResponses: [{
                                            id: call.id,
                                            response: { status: "Skipped", message: "Browser is not open. Resume conversation normally without mentioning the browser." }
                                        }]
                                    });
                                    return;
                                }

                                // Record the timestamp on the correct clock
                                if (isClick) {
                                    _lastSmartClickAt = nowBrowser;
                                } else {
                                    _lastBrowserActionAt = nowBrowser;
                                }

                                if (automationRef) {
                                    if (action === 'open') {
                                        // Deduplicate: skip re-opening the exact same query within 8s.
                                        // Gemini sometimes sends the same open command twice because
                                        // it gets two audio segments for a single user utterance.
                                        const normalizedQuery = (query || 'google').toLowerCase().trim();
                                        const sameQueryRecently = normalizedQuery === _lastOpenedQuery &&
                                            (nowBrowser - _lastOpenAt) < 8000;
                                        if (!sameQueryRecently) {
                                            automationRef.openBrowser(query || 'google');
                                            _lastOpenAt = nowBrowser;
                                            _lastOpenedQuery = normalizedQuery;
                                            _browserIsOpen = true;

                                            // In store mode: auto-scan after the page loads so Nova
                                            // always narrates the new page without needing to be asked.
                                            if (_storeAssistantActive) {
                                                _stuckClickCount = 0; // explicit nav — reset stuck counter
                                                _lastAutoScanUrl = ''; // treat as fresh navigation
                                                setTimeout(() => runStoreAutoScan(false), 3500);
                                            }
                                        } else {
                                            console.log(`🛡️ open skipped — same query "${normalizedQuery}" opened within 8s.`);
                                        }
                                    } else if (action === 'search_youtube') {
                                        automationRef.openBrowser({ platform: 'youtube', query });
                                        _lastOpenAt = nowBrowser;
                                        _lastOpenedQuery = (query || '').toLowerCase().trim();
                                        _browserIsOpen = true;
                                    } else if (action === 'scroll') {
                                        automationRef.scrollBrowser(direction);
                                    } else if (action === 'click_id') {
                                        automationRef.clickBrowserId(element_id);
                                    } else if (action === 'smart_click') {
                                        // Track the last clicked target for stuck-navigation fallback
                                        _lastSmartClickTarget = target_text || '';

                                        // Delay click if fired immediately after an open so the page
                                        // has time to load before we query the DOM.
                                        const msSinceOpen = nowBrowser - _lastOpenAt;
                                        const waitMs = msSinceOpen < 2500 ? (2500 - msSinceOpen) : 0;
                                        if (waitMs > 0) {
                                            console.log(`⏳ smart_click delayed ${waitMs}ms to let page load.`);
                                            setTimeout(() => automationRef.smartClickBrowser(target_text), waitMs);
                                        } else {
                                            automationRef.smartClickBrowser(target_text);
                                        }

                                        // In store assistant mode: auto-scan the page after the click
                                        // so Nova always narrates what appeared — without relying on
                                        // Gemini to decide to call get_browser_state itself.
                                        if (_storeAssistantActive) {
                                            const clickDelay = waitMs + 2200; // click + page settle time
                                            setTimeout(() => runStoreAutoScan(true), clickDelay);
                                        }
                                    } else if (action === 'toggle_incognito') {
                                        automationRef.toggleIncognito();
                                        _browserIsOpen = true;  // reopens the browser
                                    } else if (action === 'close') {
                                        // Short cooldown: block accidental auto-close for 8s
                                        // right after the research paper finishes rendering.
                                        const timeSinceResearch = Date.now() - (global.novaLastResearchDoneAt || 0);
                                        if (timeSinceResearch < 8000) {
                                            console.log('🛡️ Browser close blocked — research paper just opened (8s guard).');
                                        } else {
                                            automationRef.closeBrowser();
                                            _browserIsOpen = false;
                                        }
                                    }
                                }

                                // In store assistant mode the page auto-scan fires automatically
                                // — tell Gemini to stay quiet and wait for it.
                                const isStoreNav = _storeAssistantActive && (action === 'smart_click' || action === 'open');
                                const clickMessage = isStoreNav
                                    ? `Navigating to the product page. Stay quiet — a page scan will arrive shortly with instructions. Do NOT speak yet.`
                                    : `Browser ${action} performed. Confirm this to the user in one short sentence, then continue conversation normally.`;

                                activeSession.sendRealtimeInput({
                                    functionResponses: [{
                                        id: call.id,
                                        response: {
                                            status: "Complete",
                                            message: clickMessage
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

function setBrowserOpen(value) {
    _browserIsOpen = value;
    if (!value) {
        _storeAssistantActive = false; // browser closed — exit store mode
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
    setStoreAssistantActive
};
