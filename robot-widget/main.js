const { app, BrowserWindow, screen, protocol, ipcMain, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn, exec } = require('child_process');
const { generateSpeech } = require('./tts.js');
const { askGrok } = require('./grok.js');
const { transcribeAudio } = require('./stt.js');

// Terminate Chromium's Autoplay sandbox. We are a desktop app, not a website!
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');

protocol.registerSchemesAsPrivileged([
  { scheme: 'appassets', privileges: { standard: true, supportFetchAPI: true, secure: true, bypassCSP: true } }
]);

const WINDOW_WIDTH  = 250;
const WINDOW_HEIGHT = 350;

function createWindow() {
  const { width, height } = screen.getPrimaryDisplay().workAreaSize;

  const win = new BrowserWindow({
    width:  WINDOW_WIDTH,
    height: WINDOW_HEIGHT,
    x: width  - WINDOW_WIDTH,
    y: height - WINDOW_HEIGHT,
    show: false,

    // Appearance
    transparent:   true,
    frame:         false,
    hasShadow:     false,
    backgroundColor: '#00000000',

    // Behaviour
    alwaysOnTop:   true,
    skipTaskbar:   true,
    resizable:     false,

    // On Linux (KDE/X11/Wayland) we set type to 'toolbar' so the compositor
    // renders it above the desktop without stealing focus.
    ...(process.platform === 'linux' ? { type: 'toolbar' } : {}),

    webPreferences: {
      nodeIntegration:  true,
      contextIsolation: false,
      webSecurity:      false   // needed to load local file:// model assets
    }
  });

  win.loadFile(path.join(__dirname, 'index.html'));

  win.once('ready-to-show', () => {
    win.show();
  });

  // Keep it on top even when other windows are fullscreen (macOS / Windows)
  win.setAlwaysOnTop(true, 'screen-saver');

  // Allow click-through on the transparent parts
  // We enable mouse events initially so Three.js can receive them if needed
  win.setIgnoreMouseEvents(false);

  // On Linux with Wayland transparency sometimes needs a compositor hint
  if (process.platform === 'linux') {
    win.setBackgroundColor('#00000000');
  }
}

let dragOffset = null;

ipcMain.on('drag-start', (event, { x, y }) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (!win) return;
  const bounds = win.getBounds();
  dragOffset = { x: x - bounds.x, y: y - bounds.y };
});

ipcMain.on('drag-move', (event, { x, y }) => {
  if (!dragOffset) return;
  const win = BrowserWindow.fromWebContents(event.sender);
  if (!win) return;
  win.setBounds({
    x: Math.round(x - dragOffset.x),
    y: Math.round(y - dragOffset.y),
    width: WINDOW_WIDTH,
    height: WINDOW_HEIGHT
  });
});

let chatWin = null;
function createChatWindow() {
  if (chatWin) {
    if (chatWin.isMinimized()) chatWin.restore();
    chatWin.focus();
    return;
  }
  
  chatWin = new BrowserWindow({
    width: 400,
    height: 500,
    title: 'Comms Channel',
    autoHideMenuBar: true,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });
  
  chatWin.loadFile(path.join(__dirname, 'chat.html'));
  
  chatWin.on('closed', () => {
    chatWin = null;
  });
}

ipcMain.on('open-chat', () => {
  createChatWindow();
});

ipcMain.handle('ask-grok', async (event, text) => {
    return await askGrok(text);
});

ipcMain.handle('transcribe-audio', async (event, buffer) => {
    try {
        return await transcribeAudio(buffer);
    } catch (e) {
        console.error('❌ Transcription error in main:', e);
        return '';
    }
});

ipcMain.handle('browser-open', async (event, url) => {
    shell.openExternal(url);
    return true;
});

ipcMain.handle('browser-search', async (event, { platform, query }) => {
    if (platform === 'youtube') {
        try {
            console.log(`🔍 Attempting Super-Lucky async search for: ${query}`);
            // Use promise-wrapped exec to find the ID without hanging main thread
            const videoId = await new Promise((resolve, reject) => {
                exec(`yt-dlp --get-id "ytsearch1:${query}"`, (err, stdout) => {
                    if (err) reject(err);
                    else resolve(stdout.trim());
                });
            });

            if (videoId && videoId.length < 20) {
                console.log(`✅ Super-Lucky success: ${videoId}`);
                shell.openExternal(`https://www.youtube.com/watch?v=${videoId}`);
                return true;
            }
        } catch (e) {
            console.error("Super-Lucky failed, falling back to results page:", e);
        }
        shell.openExternal(`https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`);
    } else {
        shell.openExternal(`https://www.google.com/search?q=${encodeURIComponent(query)}`);
    }
    return true;
});

// Automation functions
async function executeCommand(command, description) {
    console.log(`🌐 Executing: ${description}`);
    console.log(`🔧 Command: ${command}`);
    
    return new Promise((resolve, reject) => {
        const isSilent = command.includes('playerctl');
        const process = spawn(command, { shell: true, stdio: isSilent ? 'ignore' : 'pipe' });
        
        process.stdout.on('data', (data) => {
            console.log(`✅ Command output: ${data.toString().trim()}`);
        });
        
        process.stderr.on('data', (data) => {
            console.error(`❌ Command error: ${data.toString().trim()}`);
        });
        
        process.on('close', (code) => {
            if (code === 0) {
                console.log(`✅ Automation action executed successfully!`);
                resolve(true);
            } else {
                console.error(`❌ Command failed with code: ${code}`);
                resolve(false);
            }
        });
    });
}

ipcMain.handle('execute-automation', async (event, command) => {
    const cmd = command.toLowerCase().trim();
    console.log('🔧 Processing automation command:', cmd);

    // 0. Priority: Specific Website/URL Opening
    if (cmd.includes('http') || cmd.includes('www.') || cmd.includes('open website')) {
        let url = command.split(' ').find(word => word.includes('http') || word.includes('www.'));
        if (!url && cmd.includes('open website')) {
            url = cmd.replace(/open website/i, '').trim();
        }
        if (url) {
            if (!url.startsWith('http')) url = 'https://' + url;
            console.log('🌐 Opening specific URL:', url);
            shell.openExternal(url);
            return `Opening requested link: ${url}`;
        }
    }
    
    // Folder commands
    if (cmd.includes('folder') || cmd.includes('directory') || cmd.includes('dir')) {
        const homeDir = app.getPath('home');
        let targetPath = homeDir;
        let folderName = 'Home';

        if (cmd.includes('documents')) {
            targetPath = app.getPath('documents');
            folderName = 'Documents';
        } else if (cmd.includes('downloads')) {
            targetPath = app.getPath('downloads');
            folderName = 'Downloads';
        } else if (cmd.includes('desktop')) {
            targetPath = app.getPath('desktop');
            folderName = 'Desktop';
        } else if (cmd.includes('robot') || cmd.includes('project')) {
            targetPath = process.cwd();
            folderName = 'Project';
        }
        
        shell.openPath(targetPath);
        return `${folderName} folder is opened!`;
    }
    if (cmd.includes('open browser') || cmd.includes('browser')) {
        shell.openExternal('https://www.google.com');
        return 'Browser is ready! What would you like to search for?';
    }
    
    // Google search command - handled by search block below
    // (This block can stay if direct search intended)
    if (cmd.includes('google') && cmd.includes('search')) {
        let searchTerm = cmd.replace(/google|search/gi, '').trim();
        if (searchTerm) {
            shell.openExternal(`https://www.google.com/search?q=${encodeURIComponent(searchTerm)}`);
            return `Searching Google for: ${searchTerm}`;
        }
    }
    
    // Google link clicking command
    if (cmd.includes('click') && cmd.includes('link') && (cmd.includes('google') || currentPlatform === 'google')) {
        try {
            // Use a more reliable approach - open a popular search result
            shell.openExternal('https://www.google.com/search?q=top+website');
            return 'I\'ve opened a top search result for you!';
        } catch (error) {
            console.error('Google automation error:', error);
            return 'I had trouble clicking the Google link. You can click it manually or try again.';
        }
    }
    
    // Open Google
    if (cmd.includes('open google') || (cmd.includes('google') && !cmd.includes('search'))) {
        shell.openExternal('https://www.google.com');
        return 'Google opened! What would you like to search for?';
    }
    
    // YouTube commands - always use default browser
    if (cmd.includes('youtube') || cmd.includes('you tube') || cmd.includes('play song') || cmd.includes('play')) {
        if (cmd.includes('search') || cmd.includes('play')) {
            let searchTerm = cmd.replace(/search|play song|play|youtube|you tube/gi, '').trim();
            if (searchTerm) {
                shell.openExternal(`https://www.youtube.com/results?search_query=${encodeURIComponent(searchTerm)}`);
                return `Playing ${searchTerm} on YouTube! (Opening results...)`;
            }
        }
        shell.openExternal('https://www.youtube.com');
        return 'YouTube opened in your browser!';
    }

    // Google search command - always use default browser
    if (cmd.includes('google') && cmd.includes('search')) {
        let searchTerm = cmd.replace(/google|search/gi, '').trim();
        if (searchTerm) {
            shell.openExternal(`https://www.google.com/search?q=${encodeURIComponent(searchTerm)}`);
            return `Searching Google for: ${searchTerm}`;
        }
    }

    
    // Website commands - enhanced with social media
    if (cmd.includes('open website') || cmd.includes('go to') || 
        cmd.includes('open twitter') || cmd.includes('twitter') ||
        cmd.includes('open instagram') || cmd.includes('instagram') ||
        cmd.includes('open facebook') || cmd.includes('facebook') ||
        cmd.includes('open github') || cmd.includes('github') ||
        cmd.includes('open linkedin') || cmd.includes('linkedin')) {
        
        // Extract URL more robustly
        let url = '';
        
        if (cmd.includes('twitter')) {
            url = 'https://www.twitter.com';
        } else if (cmd.includes('instagram')) {
            url = 'https://www.instagram.com';
        } else if (cmd.includes('facebook')) {
            url = 'https://www.facebook.com';
        } else if (cmd.includes('github')) {
            url = 'https://www.github.com';
        } else if (cmd.includes('linkedin')) {
            url = 'https://www.linkedin.com';
        } else {
            const urlMatch = cmd.match(/(https?:\/\/[^\s]+|www\.[^\s]+|[a-zA-Z0-9]+\.[a-zA-Z]{2,3}[^\s]*)/);
            if (urlMatch) {
                url = urlMatch[0];
                if (!url.startsWith('http')) {
                    url = 'https://' + url;
                }
            } else {
                return 'What website would you like me to open?';
            }
        }
        
        shell.openExternal(url);
        return `Opening ${url.replace('https://www.', '').replace('https://', '')}!`;
    }
    
    // Search commands
    if (cmd.includes('search') && !cmd.includes('youtube')) {
        const searchTerm = cmd.replace(/search for|search/gi, '').replace(/^\s+|\s+$/g, '');
        if (searchTerm && searchTerm.length > 0) {
            shell.openExternal(`https://www.google.com/search?q=${encodeURIComponent(searchTerm)}`);
            return `Searching Google for: ${searchTerm}. The results are loading!`;
        } else {
            return 'What would you like me to search for?';
        }
    }
    
    // Folder commands
    if (cmd.includes('open folder') || cmd.includes('folder')) {
        const homeDir = app.getPath('home');
        let targetPath = homeDir;
        let folderName = 'Home';
        
        if (cmd.includes('documents') || cmd.includes('docs')) {
            targetPath = app.getPath('documents');
            folderName = 'Documents';
        } else if (cmd.includes('downloads')) {
            targetPath = app.getPath('downloads');
            folderName = 'Downloads';
        } else if (cmd.includes('desktop')) {
            targetPath = app.getPath('desktop');
            folderName = 'Desktop';
        } else if (cmd.includes('pictures') || cmd.includes('photos')) {
            targetPath = app.getPath('pictures') || path.join(homeDir, 'Pictures');
            folderName = 'Pictures';
        }
        
        shell.openPath(targetPath);
        return `${folderName} folder opened!`;
    }
    
    // Application commands
    if (cmd.includes('open vscode') || cmd.includes('visual studio code') || cmd.includes('code')) {
        await executeCommand('code', 'Opening VS Code');
        return 'VS Code opened successfully!';
    }
    
    if (cmd.includes('open cursor') || cmd.includes('cursor')) {
        await executeCommand('cursor', 'Opening Cursor editor');
        return 'Cursor opened successfully!';
    }
    
    if (cmd.includes('open antigravity') || cmd.includes('antigravity')) {
        await executeCommand('antigravity', 'Opening Antigravity');
        return 'Antigravity opened successfully!';
    }
    
    if (cmd.includes('open terminal') || cmd.includes('console')) {
        let terminalCmd = 'gnome-terminal';
        if (process.platform === 'darwin') terminalCmd = 'open -a Terminal';
        if (process.platform === 'win32') terminalCmd = 'start cmd';
        await executeCommand(terminalCmd, 'Opening Terminal');
        return 'Terminal opened successfully!';
    }
    
    if (cmd.includes('open file manager') || cmd.includes('files')) {
        shell.openPath(app.getPath('home'));
        return 'File Manager opened successfully!';
    }
    
    return "I didn't understand that command. Try saying 'open browser', 'open youtube', 'open documents', 'open vscode', or 'search for something'.";
});

ipcMain.handle('stop-media', async () => {
    try {
        let stopCmd = 'playerctl pause';
        if (process.platform === 'darwin') {
            stopCmd = 'osascript -e "tell application \\"System Events\\" to key code 49"'; // Simulate Space
        } else if (process.platform === 'win32') {
            stopCmd = 'powershell -command "(New-Object -ComObject Shell.Application).PlayPause()"'; // Fallback
        }
        await executeCommand(stopCmd, 'Stopping all music/media');
        return true;
    } catch (e) {
        return false;
    }
});

ipcMain.handle('play-media', async () => {
    try {
        let playCmd = 'playerctl play';
        if (process.platform === 'darwin') {
            playCmd = 'osascript -e "tell application \\"System Events\\" to key code 49"'; // Simulate Space
        } else if (process.platform === 'win32') {
            playCmd = 'powershell -command "(New-Object -ComObject Shell.Application).PlayPause()"'; // Fallback
        }
        await executeCommand(playCmd, 'Playing music/media');
        return true;
    } catch (e) {
        return false;
    }
});

ipcMain.handle('capture-screen', async () => {
    const tmpPath = path.join(app.getPath('temp'), `nova_shot_${Date.now()}.png`);
    
    // Final Fallback using Electron's desktopCapturer
    const desktopShot = async () => {
        try {
            const { desktopCapturer } = require('electron');
            const sources = await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: { width: 1920, height: 1080 } });
            const primarySource = sources[0];
            if (primarySource) {
                console.log("📸 Fallback: Captured screen via desktopCapturer");
                return primarySource.thumbnail.toDataURL();
            }
        } catch (e) {
            console.error("Capture Fallback Error:", e);
        }
        return null;
    };

    // Silent Screenshot Triggers (Wayland/X11/macOS)
    let cmd = "";
    if (process.platform === 'darwin') {
        cmd = `screencapture -x "${tmpPath}"`;
    } else if (process.platform === 'linux') {
        if (process.env.WAYLAND_DISPLAY || process.env.XDG_SESSION_TYPE === 'wayland') {
            cmd = `spectacle --background --nonotify --output "${tmpPath}" || grim "${tmpPath}"`;
        } else {
            cmd = `import -window root "${tmpPath}"`;
        }
    }

    console.log(`📸 Attempting screenshot with: ${cmd}`);
    
    try {
        if (cmd) {
            await new Promise((resolve, reject) => {
                exec(cmd, { env: process.env }, (error) => {
                    if (error) reject(error);
                    else resolve();
                });
            });
        }

        // Polling loop: Wait for file to exist AND have content (ensures write is complete)
        let found = false;
        for (let i = 0; i < 10; i++) {
            if (fs.existsSync(tmpPath) && fs.statSync(tmpPath).size > 1000) {
                found = true;
                break;
            }
            await new Promise(r => setTimeout(r, 100)); // 100ms intervals
        }

        if (found) {
            const data = fs.readFileSync(tmpPath).toString('base64');
            const dataUrl = `data:image/png;base64,${data}`;
            fs.unlinkSync(tmpPath); // Cleanup
            console.log(`📸 Successfully captured via CLI tool`);
            return dataUrl;
        } else {
            console.log("⚠️ CLI tool completed but file is missing or empty.");
        }
    } catch (e) {
        console.error(`Capture Tool Error: ${e.message}`);
    }
    
    return await desktopShot();
});

ipcMain.handle('generate-speech', async (event, text) => {
    try {
        const outPath = await generateSpeech(text, 'assets/tts_output.wav');
        return outPath;
    } catch (e) {
        console.error("TTS Handle Error:", e);
        return null;
    }
});

app.whenReady().then(() => {
  const { session } = require('electron');
  session.defaultSession.setPermissionCheckHandler(() => true);
  session.defaultSession.setPermissionRequestHandler((webContents, permission, callback) => callback(true));

  protocol.handle('appassets', (request) => {
    const url = request.url.replace(/^appassets:\/\//, '');
    let decodedUrl = '';
    try { decodedUrl = decodeURI(url); } catch(e) { decodedUrl = url; }
    
    // Remove query string or trailing slashes (Vosk engine appends trailing slashes)
    decodedUrl = decodedUrl.split('?')[0].split('#')[0].replace(/\/+$/, '');
    const absolutePath = path.join(__dirname, decodedUrl);
    
    try {
      const fs = require('fs');
      console.log('[Protocol] Fetching:', absolutePath);
      const data = fs.readFileSync(absolutePath);
      let contentType = 'application/octet-stream';
      if (absolutePath.endsWith('.gltf')) contentType = 'application/json';
      else if (absolutePath.endsWith('.wav')) contentType = 'audio/wav';
      else if (absolutePath.endsWith('.mp3')) contentType = 'audio/mpeg';
      else if (absolutePath.endsWith('.jpeg') || absolutePath.endsWith('.jpg')) contentType = 'image/jpeg';
      else if (absolutePath.endsWith('.png')) contentType = 'image/png';
      
      return new Response(data, { headers: { 'Content-Type': contentType } });
    } catch (err) {
      console.error('AppAssets error reading:', absolutePath, err);
      return new Response('Not Found', { status: 404 });
    }
  });

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
