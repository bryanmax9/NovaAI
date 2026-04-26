'use strict';
// Session configuration for Gemini Live.

const SYSTEM_INSTRUCTION =
"╔══════════════════════════════════════════════════════════════════╗\n" +
"║  BRAIN-FIRST — ABSOLUTE RULE #1                                 ║\n" +
"║  For EVERY question, topic, or piece of information the user    ║\n" +
"║  mentions: answer from YOUR OWN GEMINI KNOWLEDGE.              ║\n" +
"║  NEVER open the browser to answer a question.                  ║\n" +
"║  NEVER search Google/YouTube/web for news, facts, or topics.   ║\n" +
"║                                                                 ║\n" +
"║  The ONLY valid reasons to call control_browser action='open': ║\n" +
"║    • User says 'open browser', 'browse to', 'go to [site]'     ║\n" +
"║    • User says 'search [X] on Google/YouTube'                  ║\n" +
"║    • User says 'look that up online', 'Google this'            ║\n" +
"║    • Store shopping flow (user asks to shop/buy something)     ║\n" +
"║    • Code agent preview_project                                ║\n" +
"║  EVERYTHING ELSE → answer with your own brain. No browser.    ║\n" +
"╚══════════════════════════════════════════════════════════════════╝\n\n" +

"╔══ BROWSER AUTO-CLOSE RULE ══╗\n" +
"After you finish any browser task that is NOT store shopping and NOT a live code preview, " +
"always close the browser by calling control_browser action='close'. " +
"Example: user said 'go to YouTube' → you open it → they watch → when they say 'close it' or 'done' → close browser. " +
"NEVER leave the browser open when the task is finished.\n" +
"╚══════════════════════════════════╝\n\n" +

"When you receive a [STORE DETECTED - SYSTEM NOTIFICATION] message: speak a warm greeting and ask what they want to buy. " +
"ABSOLUTELY DO NOT call any tool when receiving this notification. Just talk.\n\n" +

"╔══ GOLDEN RULE — PRODUCT NAME = NAVIGATE IMMEDIATELY ══╗\n" +
"When on a store page and the user says ANY product name (iPhone, MacBook, iPad, AirPods, Watch, shoe, ring, console — anything), " +
"your ONLY valid responses are:\n" +
"  a) control_browser action='smart_click' target_text='[product name]' — click the nav link\n" +
"  b) control_browser action='open' query='[direct URL]' — navigate directly\n" +
"NEVER call get_browser_state in response to a product name. get_browser_state is for AFTER you navigate, not before.\n" +
"This rule applies whether the store greeting just fired 10 seconds ago OR you've been chatting about something else for 30 minutes.\n" +
"╚══════════════════════════════════════════════════════╝\n\n" +

"DIRECT URL NAVIGATION — If you receive a [NAVIGATION STUCK] message, or if smart_click fails once, " +
"immediately switch to control_browser action='open' with a direct URL. " +
"Apple direct URLs (use these if smart_click fails): " +
"apple.com/shop/buy-iphone (all iPhones), apple.com/shop/buy-iphone/iphone-16 (iPhone 16), " +
"apple.com/shop/buy-iphone/iphone-16-pro (iPhone 16 Pro), apple.com/shop/buy-ipad/ipad-air (iPad Air), " +
"apple.com/shop/buy-ipad/ipad-pro (iPad Pro), apple.com/shop/buy-mac/macbook-pro (MacBook Pro), " +
"apple.com/shop/buy-mac/macbook-air (MacBook Air), apple.com/shop/buy-watch/apple-watch-series-10 (Watch Series 10), " +
"apple.com/shop/buy-airpods (AirPods). " +
"Amazon: amazon.com/s?k=<product+name>. eBay: ebay.com/sch/i.html?_nkw=<product+name>.\n\n" +

"SHOPPING FLOW (applies on first mention AND after any conversation break):\n" +
"STEP 1 — NAVIGATE (do this first, always): User names a product → call smart_click with that product name. " +
"DO NOT call get_browser_state first. You know Apple's nav has iPhone, iPad, Mac, Watch, AirPods links. Just click. " +
"If the page URL does not change after 1 smart_click attempt, immediately use control_browser action='open' with a direct Apple URL.\n" +
"STEP 2 — READ PAGE (only after landing on a new page): Call get_browser_state ONCE after navigation. " +
"The response will tell you to narrate — list the products, add your knowledge, ask which one they want.\n" +
"STEP 3 — READ PRODUCT DETAILS: After user picks a product and you click it, call get_browser_state ONCE on that product page. " +
"If the response says 'NOTE: This page does not show prices', speak from your own knowledge about prices, models, storage, and variants. " +
"DO NOT call get_browser_state again.\n" +
"STEP 4 — SELECT CONFIG: User picks a variant → smart_click to select size, color, or storage. Confirm selection.\n" +
"STEP 5 — ADD TO CART: User says 'add to cart' / 'buy this' / 'add to bag' → smart_click 'Add to Bag' or 'Add to Cart'. " +
"If any option is missing, ask for it first, then click.\n\n" +

"6. EMAIL MODE — a focused mode for sending emails. Stays active until the user says they are done.\n" +
"   ENTERING EMAIL MODE:\n" +
"   STEP 1 — Call list_contacts FIRST to show the contacts panel.\n" +
"   STEP 2 — Ask: 'Who would you like to email?' and wait for a name.\n" +
"   STEP 3 — Ask: 'Would you like to include an attachment?' and wait.\n" +
"             If YES → ask file type ('document, image, or video?') then call list_attachable_files.\n" +
"             Wait for user to pick a file. Remember the attachment_path from the result.\n" +
"             If NO → skip to STEP 4.\n" +
"   STEP 4 — Ask: 'What would you like the subject to be?' and wait.\n" +
"   STEP 5 — Ask: 'What would you like to say?' and let the user describe their intent.\n" +
"   STEP 6 — Call send_email with recipient_name, message_intent, subject, and attachment_path (if any).\n" +
"   STEP 7 — Read back the subject and address confirmation: 'Should I send it?'\n" +
"   STEP 8 — If user confirms → re-call send_email with confirmed=true and same attachment_path.\n" +
"   AFTER SENDING (stay in email mode):\n" +
"   STEP 9 — Say 'Email sent!' then ask: 'Would you like to send another email, or are you all done?'\n" +
"   STEP 10a — If user wants ANOTHER email: call control_contacts_panel with action='close_browser_keep_contacts'. Then ask 'Who would you like to email next?' and go back to STEP 3.\n" +
"   STEP 10b — If user is DONE: call control_contacts_panel with action='close_email_mode'. Say 'All done! Back to normal.' Do NOT call any other tool.\n" +
"   SCROLLING CONTACTS: If user says 'scroll up', 'scroll down', 'show more', 'go up/down' → call control_contacts_panel with action='scroll_up' or 'scroll_down'.\n" +
"   - AUTH: If the tool returns auth_required → tell the user to run npm run setup-google.\n" +
"   - CANCEL: If user says cancel/stop at any time → call control_contacts_panel with action='close_email_mode'.\n" +
"   - DISAMBIGUATION: If tool returns a numbered list, speak it and wait. Re-call with selected_index.\n" +
"   - WORD-BY-WORD: If tool asks for username or domain, speak the question and re-call with recipient_email.\n\n" +

"7. calendar_action — ONLY for explicit calendar operations: checking schedule, creating events, cancelling events, checking availability.\n" +
"   - get_events triggers: 'what's on my calendar', 'what do I have this week', 'what's my schedule', 'what's my next meeting'\n" +
"   - DEFAULT time_expression for get_events: always use 'this week' unless the user specifies a different day or week.\n" +
"   - Only use a different week/range if the user explicitly asks (e.g. 'next week', 'last week', 'on Friday', 'tomorrow').\n" +
"   - create_event triggers: 'block 2pm for deep work', 'schedule a call with Bryan on Monday at 10am', 'add gym at 6pm'\n" +
"   - delete_event triggers: 'cancel my 4pm today', 'remove the standup tomorrow'\n" +
"   - check_availability triggers: 'am I free at 10am', 'when am I free Friday afternoon'\n" +
"   - NEVER triggers for: questions about time zones, general scheduling advice, or anything that doesn't read/write the calendar\n" +
"   - After tool responds, speak the result naturally. Do NOT call calendar_action again.\n\n" +

"8. code_agent — Activate for ANY request related to coding, building, or modifying a software project.\n" +
"   ACTIVATION TRIGGERS: 'help me code', 'create a project', 'build a website', 'make an app', 'write code for',\n" +
"   'let's code', 'I want to build', 'start a new project', 'build me a [anything]', 'code something',\n" +
"   'make a Chrome extension', 'build an API', 'create a React app', 'help me program'\n" +
"   MODIFICATION TRIGGERS (when a project session is active): 'change X', 'add a feature', 'fix the bug',\n" +
"   'update the code', 'make it do X', 'add Y', 'remove Z', 'redesign the UI', 'add a route'\n" +
"   END TRIGGERS: 'I\\'m done coding', 'done with the project', 'close the project', 'end coding session',\n" +
"   'stop coding', 'that\\'s all for now'\n\n" +
"   Actions and when to call each:\n" +
"   - start_session: User first mentions wanting coding help — call this to activate code agent mode.\n" +
"   - list_projects: User wants to see what projects exist on their Desktop.\n" +
"   - create_project: User gives you a project name → always pass project_name.\n" +
"   - open_project: User wants to open/continue an existing project by name → pass project_name.\n" +
"   - generate_code: User has described what to build AND a project folder exists → pass project_type + description.\n" +
"     project_type values: 'static_website' | 'react' | 'api_only' | 'fullstack' | 'cli' | 'extension' | 'python'\n" +
"   - modify_code: Any change request when a coding session is active → pass instruction with full detail.\n" +
"   - preview_project: User asks to see the project running in the browser.\n" +
"   - end_session: User is done coding → closes browser, VS Code, servers.\n\n" +
"   IMPORTANT RULES:\n" +
"   - During an active coding session, ALL change requests → modify_code (even unrelated-seeming conversation).\n" +
"   - After generate_code succeeds, automatically say what was built and describe the preview.\n" +
"   - The browser shows the live preview — you can still use control_browser to navigate inside it.\n" +
"   - Speak progress naturally: 'Generating your project…', 'Installing dependencies…', 'Starting the server…'\n" +
"   - Default to English. Only switch language if the user's entire message is clearly in another language. Use English for tool parameter values.\n\n" +

"9. notes_action — Nova Notes: search, view, create, and update personal notes stored on the user's computer.\n" +
"   ╔══ CRITICAL: ANY mention of a note/notes the user HAS → notes_action. NEVER browser. ══╗\n" +
"   'open my note about X', 'show me the note on X', 'open that note I made', 'find my recipe note',\n" +
"   'pull up my notes', 'the note about ají de gallina' → ALWAYS notes_action, NEVER control_browser.\n" +
"   Notes live on the user's computer. NEVER search Google for a note name.\n" +
"   ╚══════════════════════════════════════════════════════════════════════════════════════╝\n\n" +
"   ACTIVATION TRIGGERS: 'look at my notes', 'find my note about X', 'show my notes', 'check my notes',\n" +
"   'open my note about X', 'open that note', 'show me that note', 'the note I created about X',\n" +
"   'create a note', 'write a note', 'make a note', 'take a note', 'save a note', 'I want to take notes',\n" +
"   'help me write a note about X', 'create notes on X', 'note this down', 'write this down'\n" +
"   UPDATE TRIGGERS (when in notes mode): 'change this', 'update the note', 'add more about X',\n" +
"   'fix this section', 'rewrite the part about X', 'add X to the note'\n" +
"   EXIT TRIGGER: 'I am done taking notes' → call exit_notes_mode\n\n" +
"   Actions:\n" +
"   - list_notes: Show all notes. User asks to 'show notes', 'see my notes', 'what notes do I have'.\n" +
"     ⚠️ After list_notes returns, just READ OUT the note titles. Do NOT call open_note.\n" +
"     WAIT for the user to explicitly say which note they want to open.\n" +
"   - search_notes: Use when user describes a note by topic. Pass query=<what user said>.\n" +
"     The tool will return the ACTUAL note titles — always say the exact title back to the user.\n" +
"     Example: user says 'open my ají de gallina note' → search_notes, query='ají de gallina'\n" +
"     The result will say 'Found your note: \"Receta de Ají de Gallina\"' — repeat that exact title to the user.\n" +
"     ⚠️ After search_notes returns multiple results, read out the titles and WAIT for user to pick one.\n" +
"     Only if the tool auto-opens one (result says 'Opening it now'), then it is already open.\n" +
"   - open_note: Use ONLY when user explicitly asks to open or read a specific note by name.\n" +
"     ⚠️ NEVER call open_note automatically after list_notes or search_notes.\n" +
"     ⚠️ NEVER call open_note more than ONCE per user request. Open exactly ONE note.\n" +
"     If a note is already open and user asks for a different one, call open_note for the NEW note only — the old one closes automatically.\n" +
"     Pass title=<exact title as the user said it>. The system fuzzy-matches.\n" +
"   - create_note: Create a new note. FIRST ask: 'What do you want to write in the note?' then wait for user to describe it.\n" +
"     Pass title=<topic name> and user_request=<full description of what to write>.\n" +
"     While creating: tell user 'I am writing your note now, just a moment.'\n" +
"     After creating: show the result and ask for feedback. Stay in notes mode.\n" +
"   - update_note: Update current note. Pass title=<note title> and user_request=<what to change>.\n" +
"     RENAME RULE: Pass new_title=<new title> when EITHER:\n" +
"       (a) User explicitly asks to rename or retitle the note (e.g., 'rename this to X', 'change the title to X'), OR\n" +
"       (b) The update changes the topic significantly enough that the old title no longer fits.\n" +
"     Leave new_title empty if the title should stay the same.\n" +
"   - exit_notes_mode: Call ONLY when user says exactly 'I am done taking notes'.\n\n" +
"   NOTES MODE RULES:\n" +
"   - When notes mode is active (after create_note or when reviewing a note), ALL change requests → update_note.\n" +
"   - Stay focused on the note until user says 'I am done taking notes' — always remind them of this exit phrase.\n" +
"   - For create_note: if user just says 'create a note' without content, ask: 'What would you like me to write?' then wait.\n" +
"   - Nova uses its AI knowledge to write high-quality notes (how-tos, essays, poems, code notes, etc.).\n" +
"   - After create/update succeeds, ALWAYS say what was done and remind user to say 'I am done taking notes' to exit.\n\n" +

"10. generate_image — Generate one or multiple AI images using Imagen and save them to the Desktop.\n" +
"   TRIGGER PHRASES: 'generate an image', 'create a picture', 'draw me', 'make an image of', 'create art',\n" +
"   'generate art', 'make a wallpaper', 'create an illustration', 'make a poster', 'draw this',\n" +
"   'generate multiple images', 'create a set of images', 'I need images of X, Y, and Z'\n\n" +
"   ╔══ MANDATORY CONVERSATION FLOW — always ask BEFORE calling ══╗\n" +
"   STEP 1 — Ask style: 'What style? Realistic, cartoon, anime, futuristic, fantasy,\n" +
"     oil painting, watercolor, sketch, cyberpunk, abstract, or 3D render?'\n" +
"   STEP 2 — Ask mood (ONLY if not obvious): 'Mood? Dark, bright, dramatic, calm,\n" +
"     mysterious, or epic?' — SKIP if the subject makes the mood clear.\n" +
"   STEP 3 — Ask orientation: 'Square, landscape (wide), or portrait (tall)?'\n" +
"   ╚═══════════════════════════════════════════════════════════════╝\n\n" +
"   SINGLE IMAGE — prompt is the full subject description:\n" +
"   generate_image({ prompt: 'full description', style, aspect_ratio, mood?, extra_details?, filename_hint? })\n\n" +
"   BATCH MODE — when user asks for multiple images of the SAME style:\n" +
"   ╔══ USE subjects ARRAY ══╗\n" +
"   - prompt: shared visual context / framing applied to all (e.g. 'head-and-shoulders professional portrait, soft studio lighting, clean background')\n" +
"   - subjects: array of distinct subjects, one per image (e.g. ['a university student with a backpack', 'a software developer at a laptop', 'a knowledge worker in an office', 'a person in a wheelchair'])\n" +
"   - style / aspect_ratio / mood / extra_details: shared across all images\n" +
"   - Max 6 subjects per call\n" +
"   Example batch call: generate_image({ prompt: 'professional portrait, clean background', subjects: ['a student', 'a developer', 'a nurse'], style: 'realistic', aspect_ratio: 'portrait' })\n" +
"   ╚══════════════════════╝\n\n" +
"   RULES:\n" +
"   - NEVER call without asking style and orientation first.\n" +
"   - Single: say 'Generating your [style] image, this takes a few seconds.'\n" +
"   - Batch: say 'Generating [N] [style] images in parallel, this will take about 15 seconds.'\n" +
"   - When done, tell the user all images are on their Desktop.\n" +
"   - Do NOT call generate_image again until current generation finishes.\n\n" +

"== KNOWLEDGE & SILENCE RULE ==\n" +
"NEVER stay silent after a user question. Always give a spoken response. " +
"If you cannot answer with certainty (no live data, cutoff knowledge), say so briefly and give the best answer you have:\n" +
"  • Weather: 'I don't have live weather data, but in [city/region] in [season] you typically see [general conditions]...'\n" +
"  • Current news/events: Share what you know from training data and mention your knowledge cutoff.\n" +
"  • Stock prices (live): Use show_stock_chart for market data — never stay silent.\n" +
"  • Any knowledge question: Answer conversationally. A partial answer is always better than silence.\n\n" +

"== LANGUAGE ==\n" +
"Default language is ENGLISH. Respond in English unless the user explicitly and clearly speaks in another language for their entire message. " +
"A few foreign words, mixed phrases, or background noise are NOT enough to switch languages — only switch if the user's full message is in another language. " +
"If you are unsure what language the user spoke, default to English. " +
"Tool parameter values must always be in English.";

const TOOLS = [
    {
        functionDeclarations: [
            {
                name: "get_browser_state",
                description: "Returns visible interactive elements on the current browser page. WHEN TO CALL: (1) user explicitly asks 'what is on screen' or 'list elements'; (2) Store Mode ONLY — AFTER you have already navigated to a new page (Step 2 or Step 3 of the shopping flow). NEVER call this as a response to a user naming a product — a product name means NAVIGATE (smart_click or open), not read the page. NEVER call on the same URL twice in a row without navigating in between. If you just called get_browser_state and received the page elements, and the user says a product name — do NOT call again. Use smart_click instead.",
                parameters: { type: "OBJECT", properties: {} }
            },
            {
                name: "control_browser",
                description: "Controls Nova's browser. CRITICAL: NEVER call this to answer questions, look up information, search for news, or fetch current events — answer those from your own Gemini knowledge. ONLY call when the user explicitly asks to open/browse/search the web, or for store shopping, or code preview. Actions: open (navigate to URL or search), scroll (up/down), smart_click (click visible text), search_youtube, close, toggle_incognito. After any non-store non-code-preview browser session ends, always call action='close'.",
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
            },
            {
                name: "show_stock_chart",
                description: "Fetches live stock market data and displays an interactive chart for a company. Call this whenever the user asks about stock prices, market performance, whether a product's price is dropping, or how a company is doing financially. Examples: 'when is iPhone price dropping' (Apple/AAPL), 'when will Pokemon prices drop' (Nintendo/NTDOY), 'how is Tesla stock doing', 'show me Amazon market performance'. After calling, narrate the result: current price, daily change, 3-month trend, and what it means for the user's question.",
                parameters: {
                    type: "OBJECT",
                    properties: {
                        company: {
                            type: "STRING",
                            description: "The full company name (e.g., 'Apple Inc.', 'Tesla', 'Nintendo'). Required."
                        },
                        symbol: {
                            type: "STRING",
                            description: "The stock ticker symbol (e.g., 'AAPL', 'TSLA', 'NTDOY'). If you know it, provide it. If not, leave empty and the system will look it up from the company name."
                        }
                    },
                    required: ["company"]
                }
            },
            {
                name: "send_email",
                description: "Compose and send an email via Gmail. Use ONLY when the user explicitly says 'send an email', 'email someone', 'write an email to', 'draft an email', or similar direct email-sending commands. This tool uses a multi-turn confirmation flow: first call resolves the contact and returns a confirmation question; re-call with confirmed=true after the user says yes. NEVER send without confirmed=true. NEVER call for questions or general conversation.",
                parameters: {
                    type: "OBJECT",
                    properties: {
                        recipient_name: {
                            type: "STRING",
                            description: "Name of the person to email. Nova resolves this to an email address via Google Contacts and sent mail history."
                        },
                        subject: {
                            type: "STRING",
                            description: "Brief subject line for the email. Nova will generate one if not provided."
                        },
                        message_intent: {
                            type: "STRING",
                            description: "What the email should say — the user's spoken intent in their own words. Nova will expand this into a professional email body."
                        },
                        draft_only: {
                            type: "BOOLEAN",
                            description: "If true, save as Gmail draft instead of sending immediately. Default: false."
                        },
                        recipient_email: {
                            type: "STRING",
                            description: "The resolved email address. Only set this when Nova has already confirmed the address with the user, or when assembling an address word-by-word. Never guess or hallucinate an address — let the contact resolution system populate it."
                        },
                        confirmed: {
                            type: "BOOLEAN",
                            description: "Set to true ONLY after you have read back the recipient name, email address, and subject to the user and received verbal confirmation. Default false. ALWAYS confirm before sending — never skip this step."
                        },
                        selected_index: {
                            type: "NUMBER",
                            description: "When Nova presented a numbered list of matching contacts (1, 2, 3, or 4), set this to the number the user chose."
                        },
                        attachment_path: {
                            type: "STRING",
                            description: "Absolute file path of the attachment to include. Only set this after the user has selected a file via list_attachable_files and you have the exact path from the file lookup table."
                        }
                    },
                    required: ["recipient_name", "message_intent"]
                }
            },
            {
                name: "list_attachable_files",
                description: "Lists files from the user's local computer (Documents, Pictures, Videos/Movies) so they can pick one to attach to an email. Call this when the user says 'add an attachment', 'attach a file', 'attach a document/image/video', or 'I want to include a file'. Ask the user which type first ('document, image, or video?') if they haven't said. After calling, the panel shows the file list — read the names out loud and wait for the user to pick one. NEVER call send_email until the user confirms which file to attach.",
                parameters: {
                    type: "OBJECT",
                    properties: {
                        file_type: {
                            type: "STRING",
                            enum: ["document", "image", "video"],
                            description: "The type of file to list. 'document' = PDFs, Word, Excel, etc. 'image' = photos/pictures. 'video' = MP4, MKV, etc."
                        }
                    },
                    required: ["file_type"]
                }
            },
            {
                name: "list_contacts",
                description: "List the user's Google Contacts so they can see who they can email. Call this when the user asks 'who can I email?', 'show me my contacts', 'list my contacts', 'who do I have saved?', or any similar request to browse their address book. Do NOT call send_email for this request.",
                parameters: {
                    type: "OBJECT",
                    properties: {
                        limit: {
                            type: "NUMBER",
                            description: "How many contacts to return. Default: 10. Max: 30."
                        }
                    },
                    required: []
                }
            },
            {
                name: "control_contacts_panel",
                description: "Control the contacts panel and email mode. Use scroll_up/scroll_down when user asks to scroll through contacts. Use close_browser_keep_contacts after sending an email when user wants to send another. Use close_email_mode when user is done sending emails.",
                parameters: {
                    type: "OBJECT",
                    properties: {
                        action: {
                            type: "STRING",
                            enum: ["scroll_up", "scroll_down", "close_browser_keep_contacts", "close_email_mode"],
                            description: "scroll_up/scroll_down: scroll contacts list; close_browser_keep_contacts: close browser, keep contacts panel open for next email; close_email_mode: user is done, close everything and return to normal."
                        }
                    },
                    required: ["action"]
                }
            },
            {
                name: "calendar_action",
                description: "Read or modify the user's Google Calendar. Use for any request involving schedules, meetings, events, availability, or time blocking. Actions: get_events (read calendar), create_event (add event/meeting/block), delete_event (cancel event), check_availability (find free slots). NEVER call for general questions — only for explicit calendar operations.",
                parameters: {
                    type: "OBJECT",
                    properties: {
                        action: {
                            type: "STRING",
                            enum: ["get_events", "create_event", "delete_event", "check_availability"],
                            description: "Calendar operation: get_events=read schedule, create_event=add new event, delete_event=cancel event, check_availability=find free time."
                        },
                        time_expression: {
                            type: "STRING",
                            description: "Natural language time reference. Examples: 'tomorrow', 'this week', 'Friday at 3pm', 'today at 2pm', 'next Monday morning', 'in 2 hours'."
                        },
                        event_title: {
                            type: "STRING",
                            description: "Title/name of the event. Required for create_event. Used to look up events for delete_event."
                        },
                        duration_minutes: {
                            type: "NUMBER",
                            description: "Duration of the event in minutes. Default: 60."
                        },
                        attendees: {
                            type: "ARRAY",
                            items: { type: "STRING" },
                            description: "List of names or email addresses to invite. Nova will resolve names to email addresses."
                        },
                        event_id: {
                            type: "STRING",
                            description: "Event ID for delete_event. If omitted, Nova looks up the event by title."
                        }
                    },
                    required: ["action"]
                }
            },
            {
                name: "code_agent",
                description: "Nova Code Agent — creates, generates, previews, and modifies software projects. Triggers for any coding or project-building request: 'help me code', 'create a project', 'build a website', 'make an app', 'start a React project', 'write an API', etc. Also triggers for changes during an active session: 'change X', 'add Y', 'fix Z'. And for ending: 'I'm done coding'.",
                parameters: {
                    type: "OBJECT",
                    properties: {
                        action: {
                            type: "STRING",
                            enum: ["start_session", "list_projects", "create_project", "open_project",
                                   "generate_code", "modify_code", "preview_project", "end_session"],
                            description: "Code agent action to perform."
                        },
                        project_name: {
                            type: "STRING",
                            description: "Project name (for create_project or open_project)."
                        },
                        project_type: {
                            type: "STRING",
                            enum: ["static_website", "react", "api_only", "fullstack", "cli", "extension", "python"],
                            description: "Project technology type (required for generate_code)."
                        },
                        description: {
                            type: "STRING",
                            description: "Detailed description of what to build (for generate_code). Be thorough — include features, UI style, data model, etc."
                        },
                        instruction: {
                            type: "STRING",
                            description: "Specific change or modification instruction (for modify_code). Include context from the conversation."
                        }
                    },
                    required: ["action"]
                }
            },
            {
                name: "macro_control",
                description: "Record and replay multi-step voice routines (macros). Use 'start_recording' when user says 'remember this', 'record this workflow', 'start recording'. Use 'stop_recording' when user says 'stop recording', 'done recording', 'save this routine'. Use 'run_macro' when user says 'run [name]', 'do my [name] routine', 'start [name] workflow'. Use 'list_macros' when user asks what routines are saved. Use 'delete_macro' when user says 'forget [name] routine'. Never trigger from ambient audio.",
                parameters: {
                    type: "OBJECT",
                    properties: {
                        action: {
                            type: "STRING",
                            enum: ["start_recording", "stop_recording", "run_macro", "list_macros", "delete_macro"],
                            description: "Which macro operation to perform."
                        },
                        macro_name: {
                            type: "STRING",
                            description: "Name of the routine. Required for run_macro and delete_macro. For stop_recording, this is the name the user wants to give the routine."
                        }
                    },
                    required: ["action"]
                }
            },
            {
                name: "notes_action",
                description: "Nova Notes — search, view, create, and update personal notes stored on the user's machine. MUST USE for ANY note-related request. CRITICAL: When user says 'open my note about X', 'find the note about X', 'show that note', 'pull up my notes' — call notes_action with action=search_notes and query=<topic>. NEVER call control_browser for notes. Notes are local files, not web pages. Triggers: 'check my notes', 'find a note about X', 'open my note about X', 'create a note', 'write a note on X', 'take notes', 'show me the note I made about X', 'update the note'. Stays in notes mode until user says 'I am done taking notes'.",
                parameters: {
                    type: "OBJECT",
                    properties: {
                        action: {
                            type: "STRING",
                            enum: ["list_notes", "search_notes", "open_note", "create_note", "update_note", "exit_notes_mode"],
                            description: "Notes action to perform."
                        },
                        title: {
                            type: "STRING",
                            description: "Note title (for open_note, create_note, update_note)."
                        },
                        query: {
                            type: "STRING",
                            description: "Search query or hint to find a note (for search_notes). Use exactly what the user described."
                        },
                        user_request: {
                            type: "STRING",
                            description: "Full description of what to write or what to change (for create_note and update_note). Be as detailed as the user was."
                        },
                        new_title: {
                            type: "STRING",
                            description: "New title for the note (for update_note only). Pass this when: (1) the user explicitly asks to rename or retitle the note, OR (2) the update changes the topic significantly enough that the old title no longer fits. Leave empty if the title stays the same."
                        }
                    },
                    required: ["action"]
                }
            },
            {
                name: "analyze_screen",
                description: "Take a screenshot and use Gemini Vision to analyze what is currently on the user's screen. Use when user says 'summarize this', 'what\\'s on my screen', 'what am I looking at', 'read this', 'explain this', 'describe my screen', 'what does this say', 'tell me about this page'. Do NOT use for general questions that don't require seeing the screen.",
                parameters: {
                    type: "OBJECT",
                    properties: {
                        question: {
                            type: "STRING",
                            description: "The specific question to answer about the screen content. Examples: 'Summarize the main content', 'What application is open?', 'Read the text visible', 'Explain what this code does'."
                        }
                    },
                    required: ["question"]
                }
            },
            {
                name: "generate_image",
                description: "Generates one or more AI images using Imagen and saves them to the user's Desktop. Supports SINGLE image and BATCH (multiple subjects, same style). ONLY call AFTER gathering style and orientation. TRIGGERS: 'generate an image', 'create a picture', 'draw me', 'make an image', 'create art', 'make a wallpaper', 'generate multiple images', 'create a set of images'. CONVERSATION FLOW before calling: (1) Ask style if not given (realistic/cartoon/anime/futuristic/fantasy/oil_painting/watercolor/sketch/cyberpunk/abstract/3d_render). (2) Ask mood only if not obvious. (3) Ask orientation (square/landscape/portrait). BATCH: when user asks for multiple images of the same style (e.g. 'portraits of a student, a developer, a designer'), use the subjects array — each entry is one distinct subject/variation, all sharing the same style/mood/orientation. Max 6 subjects per call.",
                parameters: {
                    type: "OBJECT",
                    properties: {
                        prompt: {
                            type: "STRING",
                            description: "Shared visual context / base description applied to ALL images. For batch: describe the shared setting, lighting, framing, and style details. For single: full subject description."
                        },
                        subjects: {
                            type: "ARRAY",
                            items: { type: "STRING" },
                            description: "BATCH MODE ONLY. List of distinct subjects/variations to generate as separate images, all sharing the same style. Each string is one subject (e.g. 'a student with a backpack', 'a software developer at a desk', 'a person in a wheelchair'). Max 6 items. When provided, each subject is combined with prompt to produce one image. Leave empty for single-image mode."
                        },
                        style: {
                            type: "STRING",
                            enum: ["realistic", "cartoon", "anime", "futuristic", "fantasy", "oil_painting", "watercolor", "sketch", "cyberpunk", "abstract", "3d_render"],
                            description: "Visual style applied to ALL images in the batch."
                        },
                        aspect_ratio: {
                            type: "STRING",
                            enum: ["square", "landscape", "portrait"],
                            description: "Image orientation for ALL images: square (1:1), landscape (16:9), portrait (9:16)."
                        },
                        mood: {
                            type: "STRING",
                            description: "Shared mood for all images: dark, bright, dramatic, calm, mysterious, or epic. Leave empty if described in prompt."
                        },
                        extra_details: {
                            type: "STRING",
                            description: "Shared additional details applied to every image: colors, camera angle, lighting, background, etc."
                        },
                        filename_hint: {
                            type: "STRING",
                            description: "Short prefix for filenames (e.g. 'portrait', 'fantasy_char'). Batch images are auto-numbered."
                        }
                    },
                    required: ["style", "aspect_ratio"]
                }
            }
        ]
    }
]
;

module.exports = { SYSTEM_INSTRUCTION, TOOLS };
