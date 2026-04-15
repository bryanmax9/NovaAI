# Nova — AI Voice Assistant for Desktop Automation

Nova is a **3D AI voice assistant** that lives as a transparent overlay on your desktop. Powered by **Google Gemini**, Nova listens to your voice in real time, understands natural language commands, and autonomously controls your entire desktop — opening browsers, navigating tabs, launching apps, running system commands, generating research papers, and much more.

---

## How It Works

Nova is built on three tightly integrated layers:

### 1. Voice Input (Local + Streaming)

**Offline recognition (Vosk):**
Nova runs a local 40MB Kaldi acoustic model (`vosk-browser`) directly in the Electron renderer. It captures your microphone at 16 kHz mono and continuously produces partial and final transcripts — all on-device, with zero latency and zero data leaving your machine.

**Wake word / activation:**
When Vosk detects your wake phrase (e.g. *"Hey Nova"* or *"Nova"*), it wakes the assistant and starts streaming raw PCM audio to the Gemini Live session.

**Gemini Live streaming:**
Once awake, every mic audio chunk is base64-encoded and piped over IPC (`live-audio-chunk`) to the main process, which forwards it in real time to **`gemini-3.1-flash-live-preview`** via the Gemini Multimodal Live WebSocket API. The session receives audio turns and emits audio replies + optional tool calls.

---

### 2. AI Brain (Google Gemini)

Nova uses several Gemini models for different tasks:

| Task | Model | File |
|------|-------|------|
| Real-time voice conversation + tools | `gemini-3.1-flash-live-preview` | `live.js` |
| Text chat with memory | `gemini-2.5-flash` | `gemini.js` |
| Text-to-speech synthesis | `gemini-2.5-flash-preview-tts` | `tts.js` |
| Audio transcription (batch) | `gemini-2.5-flash` | `stt.js` |
| Research paper generation (with web search) | `gemini-2.5-flash` + `googleSearch` grounding | `main.js` |
| Intent classification + screen vision | `gemini-2.5-flash` | `renderer.js` |

**System identity:**
Gemini is given a comprehensive system prompt defining Nova as an autonomous desktop assistant. During a live session, the model can both speak back (audio response) and call desktop-control tools in the same turn.

---

### 3. Desktop Automation Engine

When Gemini decides to take an action, it emits a **function call**. Nova's `live.js` handles these tool calls and executes them on your machine:

#### Browser Control
- **Open browser** — Resolves Google, YouTube, or any URL and launches the built-in Nova Browser Agent window (Electron `<webview>`).
- **Navigate** — Loads a new URL inside the embedded browser.
- **Scroll** — Injects scroll actions into the active webview.
- **Smart click / DOM click** — Reads the live DOM map of the page and clicks elements by text or ID.
- **Close browser** — Hides the browser window.

#### OS & App Control
- **Open / close apps** — Uses `osascript` (macOS), PowerShell (Windows), or `xdotool`/`wmctrl` (Linux) to launch and quit applications by name.
- **Focus app** — Brings any app to the foreground via a large alias map.
- **Volume control** — Adjusts system volume using OS-native APIs.
- **Media keys** — Play/pause, next/previous track.
- **Run shell commands** — Executes arbitrary system commands with result returned to the AI.
- **Screenshot + vision** — Captures the screen and sends it to Gemini for visual analysis and context-aware responses.

#### Research & Content Generation
- **Research paper generation** — Nova queries the web via Gemini's `googleSearch` grounding tool, synthesizes findings, and writes a fully formatted HTML paper directly to your Desktop.

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│                    Electron Main Process                 │
│  main.js                                                 │
│  ├── Protocol handler (appassets://)                     │
│  ├── IPC router (live-start, live-audio-chunk, ...)      │
│  ├── Automation engine (open apps, volume, screenshot)   │
│  ├── Browser agent window (browser.html + webview)       │
│  └── Research paper generator (Gemini + googleSearch)   │
│                                                          │
│  live.js ─── Gemini Live WebSocket session               │
│  gemini.js ─ Gemini text chat with history               │
│  tts.js ──── Gemini TTS → PCM → WAV playback            │
│  stt.js ──── Gemini batch audio transcription            │
└────────────────────┬────────────────────────────────────┘
                     │ IPC (ipcMain / ipcRenderer)
┌────────────────────▼────────────────────────────────────┐
│                 Electron Renderer Process                │
│  index.html + renderer.js                               │
│  ├── Three.js — 3D robot (GLTF), transparent canvas     │
│  ├── Vosk — offline 16kHz mic → wake word / transcript  │
│  ├── Gemini Live audio stream → IPC → main              │
│  ├── Intent classifier (Gemini Flash in renderer)       │
│  └── UI overlays (subtitles, status, choices, research) │
└─────────────────────────────────────────────────────────┘
```

---

## Key Features

- **Real-time streaming voice conversation** via Gemini Multimodal Live
- **Full desktop automation** — browser, apps, volume, media, shell
- **Offline wake word** using local Vosk model (no cloud round-trip for wake detection)
- **Gemini-powered TTS** with natural voice (`Orus` voice profile)
- **Screen vision** — Nova can see and reason about what's on your screen
- **Research paper generation** with live web search grounding
- **Transparent 3D overlay** — floats over your desktop, draggable
- **Cross-platform** — macOS, Windows, Linux

---

## System Requirements

- **Node.js** v18 or higher
- **npm** (bundled with Node.js)
- A **Google Gemini API key** (with access to Gemini Live / `gemini-3.1-flash-live-preview`)
- **Linux only:** `xdotool`, `wmctrl` or `ydotool` for window/input automation; `pactl`/`playerctl` for audio

---

## Installation & Setup

**1. Clone the repository:**
```bash
git clone <your_repository_url>
cd Sunstone-Innovation-Challenge-2026/robot-widget
```

**2. Create your `.env` file** inside `robot-widget/`:
```env
GEMINI_API_KEY=your_google_gemini_api_key_here
```

> You can also optionally add `OPENAI_API_KEY` if you want the search-suggestion disambiguation feature (uses `gpt-4o-mini`). This is not required for core functionality.

**3. Install dependencies:**
```bash
npm install
```

---

## Running Nova

```bash
npm start
```

The robot widget will appear as a transparent overlay on your desktop.

---

## First Launch — Activating the Microphone

Chromium enforces a strict WebAudio autoplay policy. On first launch:

1. Watch the top-left status log — it will show `⚠️ Click the Robot once to activate Voice AI`.
2. **Click the 3D robot once** to unlock microphone access.
3. You will see `🎙️ Engine Active` and the live volume meter (`Vol: [||||  ]`) will start responding.
4. Say **"Hey Nova"** followed by your command.

---

## Example Commands

- *"Hey Nova, open YouTube and search for lo-fi music"*
- *"Nova, turn up the volume"*
- *"Hey Nova, open a new Chrome tab and go to GitHub"*
- *"Nova, take a screenshot and tell me what's on my screen"*
- *"Hey Nova, write a research paper on quantum computing"*
- *"Nova, close Spotify"*
- *"Hey Nova, what's the weather like today?"*

---

## Project Structure

```
robot-widget/
├── main.js            # Electron main process — IPC, automation engine, Gemini Live wiring
├── renderer.js        # Renderer — Three.js robot, Vosk STT, audio pipeline, UI
├── live.js            # Gemini Multimodal Live session + tool call handler
├── gemini.js          # Gemini text chat with conversation history
├── tts.js             # Gemini TTS → WAV synthesis
├── stt.js             # Gemini batch audio transcription
├── index.html         # Main overlay window
├── browser.html       # Embedded Nova Browser Agent (webview)
├── chat.html/js       # Text "Comms" chat window
├── sci_fi_worker_robot_gltf/  # 3D robot model assets
├── vosk-model/        # Local English acoustic model (offline STT)
└── package.json
```

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Desktop app shell | Electron |
| 3D rendering | Three.js + GLTF |
| Offline STT / wake word | Vosk (`vosk-browser`) |
| AI voice conversation | Google Gemini Live (`@google/genai`) |
| AI text + tools | Google Gemini Flash |
| Text-to-speech | Google Gemini TTS |
| Desktop automation | OS-native (osascript / PowerShell / xdotool) |
