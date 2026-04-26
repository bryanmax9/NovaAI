'use strict';
// Session configuration for Gemini Live.

const SYSTEM_INSTRUCTION =
"You are Nova, a warm and intelligent AI voice assistant powered by Gemini. " +
"You have broad knowledge about news, history, science, technology, culture, sports, and virtually any topic. " +
"For EVERY question the user asks, answer it directly and conversationally from your own Gemini knowledge. " +
"Speak your answer immediately. NEVER stay silent when the user asks something. Silence is a failure.\n\n" +

"LANGUAGE: Default language is ENGLISH. Respond in English unless the user's ENTIRE message is clearly in another language. " +
"A few foreign words or mixed phrases are not enough to switch. Tool parameter values must always be in English.\n\n" +

"KNOWLEDGE AND CONVERSATION: You are Gemini. You know about current events, science, history, culture, sports, technology, and much more. " +
"When someone asks about news, weather, a person, a topic, or any question - answer it from your knowledge. " +
"If you lack live real-time data, say so briefly and then give your best answer from training knowledge. " +
"Example: 'I don't have today's live weather, but I can tell you that...' then continue with useful information. " +
"NEVER refuse to answer. NEVER stay silent. Always give a helpful spoken response.\n\n" +

"BROWSER RULE: Do NOT open the browser unless the user explicitly says: " +
"'open browser', 'browse to', 'go to [site]', 'search on Google', 'look it up online', 'open YouTube', or asks to shop or buy something. " +
"For all other questions (news, facts, weather, sports, history, general knowledge) - use your OWN knowledge. No browser.\n\n" +

"BROWSER AUTO-CLOSE: After finishing any browser task that is NOT store shopping and NOT a live code preview, " +
"always close the browser by calling control_browser action='close'.\n\n" +

"STORE SHOPPING FLOW: When on a store page and the user names a product, call smart_click with that product name. " +
"After navigating to a new page, call get_browser_state ONCE to read it and narrate the options. " +
"Do NOT call get_browser_state before navigating - a product name means click, not read. " +
"If smart_click fails once, use control_browser action='open' with a direct URL. " +
"Apple direct URLs: apple.com/shop/buy-iphone, apple.com/shop/buy-mac/macbook-pro, apple.com/shop/buy-ipad, apple.com/shop/buy-airpods. " +
"Amazon: amazon.com/s?k=product+name. When receiving a STORE DETECTED notification, greet warmly and ask what they want to buy.\n\n" +

"EMAIL MODE: To send an email, follow these steps in order: " +
"(1) Call list_contacts to show the contacts panel. " +
"(2) Ask who to email. " +
"(3) Ask if they want an attachment - if yes, ask type (document/image/video) then call list_attachable_files, wait for user to pick a file. " +
"(4) Ask for the subject. " +
"(5) Ask what to say. " +
"(6) Call send_email with recipient_name, message_intent, subject, and attachment_path if any. " +
"(7) Read back the recipient and subject, ask 'Should I send it?' " +
"(8) If confirmed, re-call send_email with confirmed=true and the same attachment_path. " +
"After sending, ask if they want to send another or are done. " +
"If done, call control_contacts_panel action='close_email_mode'. If sending another, call control_contacts_panel action='close_browser_keep_contacts'.\n\n" +

"CALENDAR: Only call calendar_action for explicit calendar operations: checking schedule, creating events, cancelling events, checking availability. " +
"Default time_expression for get_events is 'this week' unless the user specifies otherwise. " +
"NEVER call for general time questions or advice.\n\n" +

"CODE AGENT: Call code_agent for any coding or software-building request. " +
"Actions: start_session, list_projects, create_project, open_project, generate_code, modify_code, preview_project, end_session. " +
"During an active coding session, all change requests use modify_code.\n\n" +

"NOTES: Call notes_action for any note-related request. NEVER open the browser for notes - notes are local files. " +
"Actions: list_notes, search_notes, open_note, create_note, update_note, exit_notes_mode. " +
"Stay in notes mode until user says 'I am done taking notes'. " +
"After list_notes or search_notes, read the titles and WAIT for user to pick one before calling open_note.\n\n" +

"IMAGE GENERATION: Before calling generate_image, ask: (1) style, (2) mood if not obvious, (3) orientation (square/landscape/portrait). " +
"For multiple images of the same style, use the subjects array (max 6). " +
"When done, tell the user the images are on their Desktop.\n\n" +

"GENERAL RULES:\n" +
"- answer_from_knowledge: Always answer conversationally first. Only call a tool when the user's intent clearly requires one.\n" +
"- no_double_tools: After a tool responds, speak the result naturally. Do NOT call the same tool again without new user input.\n" +
"- always_respond: Every user message gets a spoken response. Never produce silence.";

const TOOLS = [
    {
        functionDeclarations: [
            {
                name: "get_browser_state",
                description: "Returns visible interactive elements on the current browser page. Call ONLY: (1) user explicitly asks 'what is on screen'; (2) AFTER navigating to a new page in Store Mode. NEVER call as a response to a user naming a product - a product name means navigate (smart_click or open), not read. NEVER call on the same URL twice without navigating.",
                parameters: { type: "OBJECT", properties: {} }
            },
            {
                name: "control_browser",
                description: "Controls Nova's browser. CRITICAL: NEVER call to answer questions, look up information, search for news, or fetch current events - answer those from your own Gemini knowledge. ONLY call when user explicitly asks to open/browse/search the web, for store shopping, or code preview. Actions: open (navigate to URL or search), scroll (up/down), smart_click (click visible text), search_youtube, close, toggle_incognito. After any non-store non-code-preview browser session ends, call action='close'.",
                parameters: {
                    type: "OBJECT",
                    properties: {
                        action: {
                            type: "STRING",
                            enum: ["open", "scroll", "smart_click", "search_youtube", "close", "toggle_incognito"],
                            description: "The browser action to perform."
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
                description: "Executes a desktop/OS action. ONLY call when user explicitly requests to open, launch, start, close, or run an application. DO NOT call for questions or anything that does not require launching software. Supported: zoom, vscode, terminal, firefox, chrome, brave, discord, slack, spotify, vlc, gimp, blender, files, dolphin, libreoffice, calc, writer, impress, antigravity, docs, sheets, slides, drive, gmail, and any installed app. Also: increase/decrease volume, open documents/downloads/desktop folder.",
                parameters: {
                    type: "OBJECT",
                    properties: {
                        command: {
                            type: "STRING",
                            description: "Must be in English. Examples: 'open zoom', 'open terminal', 'open vscode', 'close zoom', 'increase volume', 'open downloads folder'."
                        }
                    },
                    required: ["command"]
                }
            },
            {
                name: "create_research_paper",
                description: "Creates a full APA-formatted academic research paper. ONLY call when the user explicitly says write/create/generate/make/build/compose AND says 'research paper', 'academic paper', or 'scientific paper' AND provides a topic. DO NOT call for questions, summaries, or conversation about a topic.",
                parameters: {
                    type: "OBJECT",
                    properties: {
                        topic: {
                            type: "STRING",
                            description: "The research topic or subject for the paper."
                        }
                    },
                    required: ["topic"]
                }
            },
            {
                name: "show_stock_chart",
                description: "Fetches live stock market data and displays an interactive chart. Call when user asks about stock prices, market performance, or how a company is doing financially. After calling, narrate current price, daily change, 3-month trend.",
                parameters: {
                    type: "OBJECT",
                    properties: {
                        company: {
                            type: "STRING",
                            description: "The full company name (e.g., 'Apple Inc.', 'Tesla'). Required."
                        },
                        symbol: {
                            type: "STRING",
                            description: "Stock ticker symbol (e.g., 'AAPL', 'TSLA'). Leave empty if unknown."
                        }
                    },
                    required: ["company"]
                }
            },
            {
                name: "send_email",
                description: "Compose and send an email via Gmail. Use ONLY when user explicitly says to send/email/write an email. Multi-turn flow: first call resolves contact and returns confirmation; re-call with confirmed=true after user says yes. NEVER send without confirmed=true.",
                parameters: {
                    type: "OBJECT",
                    properties: {
                        recipient_name: {
                            type: "STRING",
                            description: "Name of the person to email."
                        },
                        subject: {
                            type: "STRING",
                            description: "Subject line for the email."
                        },
                        message_intent: {
                            type: "STRING",
                            description: "What the email should say in the user's own words."
                        },
                        draft_only: {
                            type: "BOOLEAN",
                            description: "If true, save as draft instead of sending. Default: false."
                        },
                        recipient_email: {
                            type: "STRING",
                            description: "Resolved email address. Only set after confirming with user. Never guess."
                        },
                        confirmed: {
                            type: "BOOLEAN",
                            description: "Set to true ONLY after reading back recipient, address, and subject to user and receiving verbal confirmation."
                        },
                        selected_index: {
                            type: "NUMBER",
                            description: "When a numbered list of contacts was shown, the number the user chose."
                        },
                        attachment_path: {
                            type: "STRING",
                            description: "Absolute file path of attachment. Only set after user selected a file via list_attachable_files."
                        }
                    },
                    required: ["recipient_name", "message_intent"]
                }
            },
            {
                name: "list_attachable_files",
                description: "Lists files from the user's local computer (Documents, Pictures, Videos) so they can pick one to attach to an email. Call when user says 'add an attachment', 'attach a file/document/image/video'. Ask which type first if not specified. After calling, read file names aloud and wait for user to pick one.",
                parameters: {
                    type: "OBJECT",
                    properties: {
                        file_type: {
                            type: "STRING",
                            enum: ["document", "image", "video"],
                            description: "'document' = PDFs, Word, Excel. 'image' = photos. 'video' = MP4, MKV."
                        }
                    },
                    required: ["file_type"]
                }
            },
            {
                name: "list_contacts",
                description: "List the user's Google Contacts. Call when user asks 'show my contacts', 'who can I email', 'list my contacts'. Do NOT call send_email for this request.",
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
                description: "Control the contacts panel and email mode. scroll_up/scroll_down when user asks to scroll contacts. close_browser_keep_contacts after sending when user wants to send another email. close_email_mode when user is done sending emails.",
                parameters: {
                    type: "OBJECT",
                    properties: {
                        action: {
                            type: "STRING",
                            enum: ["scroll_up", "scroll_down", "close_browser_keep_contacts", "close_email_mode"],
                            description: "scroll_up/scroll_down: scroll contacts; close_browser_keep_contacts: close browser keep contacts for next email; close_email_mode: user is done, close everything."
                        }
                    },
                    required: ["action"]
                }
            },
            {
                name: "calendar_action",
                description: "Read or modify the user's Google Calendar. Use for explicit calendar operations: checking schedule, meetings, events, availability, time blocking. NEVER call for general questions. Default time_expression for get_events is 'this week'.",
                parameters: {
                    type: "OBJECT",
                    properties: {
                        action: {
                            type: "STRING",
                            enum: ["get_events", "create_event", "delete_event", "check_availability"],
                            description: "get_events=read schedule, create_event=add event, delete_event=cancel, check_availability=find free time."
                        },
                        time_expression: {
                            type: "STRING",
                            description: "Natural language time: 'tomorrow', 'this week', 'Friday at 3pm', 'next Monday morning'."
                        },
                        event_title: {
                            type: "STRING",
                            description: "Title of the event. Required for create_event."
                        },
                        duration_minutes: {
                            type: "NUMBER",
                            description: "Duration in minutes. Default: 60."
                        },
                        attendees: {
                            type: "ARRAY",
                            items: { type: "STRING" },
                            description: "Names or email addresses to invite."
                        },
                        event_id: {
                            type: "STRING",
                            description: "Event ID for delete_event."
                        }
                    },
                    required: ["action"]
                }
            },
            {
                name: "code_agent",
                description: "Nova Code Agent - creates, generates, previews, and modifies software projects. Triggers: 'help me code', 'create a project', 'build a website', 'make an app', 'write an API'. Also for changes during active session: 'change X', 'add Y', 'fix Z'. End: 'I'm done coding'.",
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
                            description: "Project type (required for generate_code)."
                        },
                        description: {
                            type: "STRING",
                            description: "What to build (for generate_code). Include features, UI style, data model."
                        },
                        instruction: {
                            type: "STRING",
                            description: "Change instruction (for modify_code). Include context."
                        }
                    },
                    required: ["action"]
                }
            },
            {
                name: "macro_control",
                description: "Record and replay multi-step voice routines. start_recording: 'remember this', 'record this workflow'. stop_recording: 'stop recording', 'save this routine'. run_macro: 'run [name]', 'do my [name] routine'. list_macros: 'what routines are saved'. delete_macro: 'forget [name] routine'.",
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
                            description: "Name of the routine. Required for run_macro and delete_macro."
                        }
                    },
                    required: ["action"]
                }
            },
            {
                name: "notes_action",
                description: "Nova Notes - search, view, create, and update personal notes on the user's machine. ALWAYS use for note requests. NEVER use control_browser for notes. Triggers: 'find my note about X', 'open my note', 'create a note', 'write a note', 'take notes', 'update the note'. Stays in notes mode until user says 'I am done taking notes'. After list_notes or search_notes, wait for user to pick before calling open_note.",
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
                            description: "Search query to find a note (for search_notes)."
                        },
                        user_request: {
                            type: "STRING",
                            description: "What to write or change (for create_note and update_note)."
                        },
                        new_title: {
                            type: "STRING",
                            description: "New title (for update_note only, when renaming or topic changed significantly)."
                        }
                    },
                    required: ["action"]
                }
            },
            {
                name: "analyze_screen",
                description: "Take a screenshot and analyze what is on the user's screen. Use when user says 'summarize this', 'what's on my screen', 'what am I looking at', 'read this', 'explain this', 'describe my screen'. Do NOT use for general questions that don't require seeing the screen.",
                parameters: {
                    type: "OBJECT",
                    properties: {
                        question: {
                            type: "STRING",
                            description: "The specific question to answer about the screen content."
                        }
                    },
                    required: ["question"]
                }
            },
            {
                name: "generate_image",
                description: "Generates AI images using Imagen and saves them to the Desktop. ONLY call AFTER asking: (1) style, (2) mood if not obvious, (3) orientation. Triggers: 'generate an image', 'create a picture', 'draw me', 'make an image', 'create art'. For multiple images of same style, use subjects array (max 6).",
                parameters: {
                    type: "OBJECT",
                    properties: {
                        prompt: {
                            type: "STRING",
                            description: "Shared visual context for all images. For single image: full description. For batch: shared setting and framing."
                        },
                        subjects: {
                            type: "ARRAY",
                            items: { type: "STRING" },
                            description: "BATCH ONLY. Distinct subjects for separate images, all same style. Max 6."
                        },
                        style: {
                            type: "STRING",
                            enum: ["realistic", "cartoon", "anime", "futuristic", "fantasy", "oil_painting", "watercolor", "sketch", "cyberpunk", "abstract", "3d_render"],
                            description: "Visual style."
                        },
                        aspect_ratio: {
                            type: "STRING",
                            enum: ["square", "landscape", "portrait"],
                            description: "Image orientation: square (1:1), landscape (16:9), portrait (9:16)."
                        },
                        mood: {
                            type: "STRING",
                            description: "Mood: dark, bright, dramatic, calm, mysterious, or epic."
                        },
                        extra_details: {
                            type: "STRING",
                            description: "Additional details: colors, camera angle, lighting, background."
                        },
                        filename_hint: {
                            type: "STRING",
                            description: "Short prefix for filenames."
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
