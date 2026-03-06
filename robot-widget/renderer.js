/**
 * renderer.js — Three.js scene for the sci-fi robot desktop widget
 * Uses ES module imports (Electron renderer supports native ESM).
 */

import * as THREE from 'three';
import { GLTFLoader }  from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

// Electron Native Modules
const { ipcRenderer } = window.require('electron');
const fs = window.require('fs');
const path = window.require('path');

let isDragging = false;

window.addEventListener('mousedown', (e) => {
  if (e.button === 0) {
    isDragging = true;
    ipcRenderer.send('drag-start', { x: e.screenX, y: e.screenY });
  }
});

window.addEventListener('mousemove', (e) => {
  if (isDragging) {
    ipcRenderer.send('drag-move', { x: e.screenX, y: e.screenY });
  }
});

window.addEventListener('mouseup', () => {
  isDragging = false;
});

// Raycaster for precise 3D model clicking
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();

window.addEventListener('dblclick', (event) => {
  mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
  mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;

  raycaster.setFromCamera(mouse, camera);

  if (typeof robotGroup !== 'undefined' && robotGroup) {
    const intersects = raycaster.intersectObject(robotGroup, true);
    // Ensure we only trigger if we hit a VISIBLE part of the robot (ignoring the hidden wall/ground)
    const validIntersects = intersects.filter(hit => hit.object && hit.object.visible);
    
    if (validIntersects.length > 0) {
      ipcRenderer.send('open-chat');
    }
  }
});

// ── Canvas & Renderer ──────────────────────────────────────────────────────
const canvas = document.getElementById('canvas');

const renderer = new THREE.WebGLRenderer({
  canvas,
  alpha:     true,
  antialias: true,
  powerPreference: 'high-performance',
});
renderer.setClearColor(0x000000, 0);
renderer.setPixelRatio(window.devicePixelRatio);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type    = THREE.PCFSoftShadowMap;
renderer.toneMapping       = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;

const pmremGenerator = new THREE.PMREMGenerator(renderer);
pmremGenerator.compileEquirectangularShader();

// ── Scene ──────────────────────────────────────────────────────────────────
const scene = new THREE.Scene();
scene.environment = pmremGenerator.fromScene(new RoomEnvironment(), 0.04).texture;

// ── Camera ─────────────────────────────────────────────────────────────────
const camera = new THREE.PerspectiveCamera(
  45,
  window.innerWidth / window.innerHeight,
  0.1,
  100
);
camera.position.set(0, 0.5, 3.5);
camera.lookAt(0, 0, 0);

// ── Lighting ───────────────────────────────────────────────────────────────
// Soft ambient fill
const ambient = new THREE.AmbientLight(0xffffff, 2.0);
scene.add(ambient);

// Main key light (warm white)
const keyLight = new THREE.DirectionalLight(0xfff0e0, 2.8);
keyLight.position.set(3, 6, 4);
keyLight.castShadow = true;
keyLight.shadow.mapSize.set(1024, 1024);
keyLight.shadow.camera.near = 0.5;
keyLight.shadow.camera.far  = 30;
scene.add(keyLight);

// Fill light (cool blue)
const fillLight = new THREE.DirectionalLight(0x8ab4f8, 1.2);
fillLight.position.set(-4, 3, -2);
scene.add(fillLight);

// Rim / back light (orange glow for sci-fi feel)
const rimLight = new THREE.DirectionalLight(0xff6030, 0.8);
rimLight.position.set(0, 2, -5);
scene.add(rimLight);

// ── Debug Cube ─────────────────────────────────────────────────────────────
const geometry = new THREE.BoxGeometry(0.5, 0.5, 0.5);
const material = new THREE.MeshStandardMaterial({ color: 0xff0000 });
const cube = new THREE.Mesh(geometry, material);
cube.position.set(1.5, 0.5, 0);
scene.add(cube);

window.onerror = function(msg, url, line, col, error) {
  console.error("Window Error: ", msg, url, line, col, error);
};

window.addEventListener('unhandledrejection', function(event) {
  console.error('Unhandled Rejection: ', event.reason);
});

// ── GLTF Loader ────────────────────────────────────────────────────────────
// In Electron file:// context, relative paths from index.html resolve correctly.
// We navigate up one level from robot-widget/ to reach sci_fi_worker_robot_gltf/
const MODEL_URL = 'appassets://sci_fi_worker_robot_gltf/scene.gltf';

// ── Loaders ────────────────────────────────────────────────────────────────
let robotGroup;

// Procedural Animation Targets
let headNode;
let bodyNode;
let armRNode;
let armLNode;

// Initial Transforms
let headInitRot;
let bodyInitPos;
let bodyInitRot;
let armRInitRot;
let armLInitRot;

const dracoLoader = new DRACOLoader();
dracoLoader.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.6/');

const loader = new GLTFLoader();
loader.setDRACOLoader(dracoLoader);

loader.load(
  MODEL_URL,
  (gltf) => {
    const model = gltf.scene;

    // Reset any wild transforms
    model.position.set(0, 0, 0);
    model.scale.set(1, 1, 1);

    // Hide unwanted diorama meshes and update materials
    model.traverse((child) => {
      if (child.isMesh) {
        const nodeName = child.name.toLowerCase();
        const matName = child.material ? child.material.name.toLowerCase() : '';

        // Remove wall / ground meshes by node name OR material name
        if (nodeName.includes("wall") || nodeName.includes("ground") || nodeName.includes("background") ||
            matName.includes("wall") || matName.includes("ground") || matName.includes("background")) {
          child.visible = false;
        } else {
          child.castShadow = false;
          child.receiveShadow = false;
        }

        // Make sure textures render correctly
        if (child.material) {
          child.material.needsUpdate = true;
          child.material.envMapIntensity = 1.0;
          if (child.material.metalness !== undefined) {
             child.material.metalness = 0.5;
          }
        }
      }
    });

    // Compute bounding box ONLY for visible meshes
    const box = new THREE.Box3();
    model.traverse((child) => {
      if (child.isMesh && child.visible) {
        box.expandByObject(child);
      }
    });

    let size = new THREE.Vector3();
    let center = new THREE.Vector3();
    
    // Fallback if no meshes are visible
    if (box.isEmpty()) {
       size.set(2, 2, 2);
       center.set(0, 0, 0);
    } else {
       box.getSize(size);
       box.getCenter(center);
    }

    // Auto-frame camera mathematically
    const maxDim = Math.max(size.x, size.y, size.z);
    const fov = camera.fov * (Math.PI / 180);
    // Increase padding from 1.5 to 2.2 to make the robot appear smaller within the window
    let cameraZ = Math.abs(maxDim / 2 / Math.tan(fov / 2)) * 2.2; 

    console.log("✅ Bounding Box Computed:", { size, center, maxDim, cameraZ });

    // Shift model so its true center is (0,0,0) BEFORE putting it in a group
    model.position.sub(center);

    // Place camera relative to the newly centered origin
    camera.position.set(0, (size.y * 0.2), cameraZ);
    camera.lookAt(0, 0, 0);
    
    // Adjust lights to encompass the visible model at origin
    keyLight.position.set(maxDim, maxDim, maxDim);
    keyLight.castShadow = false;
    rimLight.position.set(-maxDim, maxDim, -maxDim);

    robotGroup = new THREE.Group();
    robotGroup.add(model);
    
    // Rotate the robot a bit to the left (facing left side of screen)
    robotGroup.rotation.y = -0.5; // ~ -30 degrees
    
    scene.add(robotGroup);

    // Save references to specific robot parts for procedural idle animation
    headNode = model.getObjectByName('Head_13') || model.getObjectByName('Head Rotate_14');
    bodyNode = model.getObjectByName('Robot_Main_Controller_40') || model.getObjectByName('Body_25') || model;
    armRNode = model.getObjectByName('Arm_1_Right_26') || model.getObjectByName('Arm 1 Right_26');
    armLNode = model.getObjectByName('Arm_1_Left_35') || model.getObjectByName('Arm 1 Left_35');

    // Store their resting poses so we don't snap them into the sky or fold them backward!
    if (headNode) headInitRot = headNode.rotation.clone();
    if (bodyNode) {
      bodyInitPos = bodyNode.position.clone();
      bodyInitRot = bodyNode.rotation.clone();
    }
    if (armRNode) armRInitRot = armRNode.rotation.clone();
    if (armLNode) armLInitRot = armLNode.rotation.clone();

    console.log('✅ Robot model loaded natively with procedural targets');
  },
  (progress) => {
    if (progress.total > 0) {
      console.log(`Loading… ${Math.round((progress.loaded / progress.total) * 100)}%`);
    }
  },
  (err) => console.error('❌ Error loading model:', err)
);

// ── Render size ────────────────────────────────────────────────────────────
function updateSize() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  renderer.setSize(w, h);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
updateSize();
window.addEventListener('resize', updateSize);

// ── Animation loop ─────────────────────────────────────────────────────────
const clock = new THREE.Clock();

function animate() {
  requestAnimationFrame(animate);
  const time = clock.getElapsedTime();

  // Procedural idle animations using sine waves!
  if (headNode && headInitRot) {
    // Gentle head turning, ADDED to initial rotation
    headNode.rotation.y = headInitRot.y + Math.sin(time * 0.7) * 0.15;
    headNode.rotation.z = headInitRot.z + Math.sin(time * 0.4) * 0.05;
  }
  
  if (bodyNode && bodyInitPos) {
    // Gentle body sway/breathing
    bodyNode.rotation.y = bodyInitRot.y + Math.sin(time * 0.5) * 0.05;
    bodyNode.position.y = bodyInitPos.y + Math.sin(time * 1.5) * 0.02;
  }
  
  if (armRNode && armRInitRot) {
    // Subtle arm floating
    armRNode.rotation.z = armRInitRot.z + Math.sin(time * 0.8) * 0.1;
  }
  
  if (armLNode && armLInitRot) {
    // Subtle arm floating (offset from right arm)
    armLNode.rotation.z = armLInitRot.z + Math.sin(time * 0.8 + 1) * 0.1;
  }

  renderer.render(scene, camera);
}

animate();

// ── TTS & Offline Voice Recognition (VOSK) ─────────────────────────────────
let currentAudio = null;
let recognizer = null;
const API_KEY = window.require('dotenv').config().parsed.GROK_API_KEY;

// Base64 PCM16 continuous playback
let grokAudioContext = new window.AudioContext({ sampleRate: 24000 });
let nextPlayTime = 0;

function playAudioChunk(base64Audio) {
    if (grokAudioContext.state === 'suspended') grokAudioContext.resume();
    
    const binaryString = window.atob(base64Audio);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
        bytes[i] = binaryString.charCodeAt(i);
    }
    const int16 = new Int16Array(bytes.buffer);
    const float32 = new Float32Array(int16.length);
    for (let i = 0; i < int16.length; i++) {
        float32[i] = int16[i] / 32768.0;
    }

    const audioBuffer = grokAudioContext.createBuffer(1, float32.length, 24000);
    audioBuffer.getChannelData(0).set(float32);

    const source = grokAudioContext.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(grokAudioContext.destination);

    if (nextPlayTime < grokAudioContext.currentTime) {
        nextPlayTime = grokAudioContext.currentTime;
    }
    source.start(nextPlayTime);
    nextPlayTime += audioBuffer.duration;
}

// Websocket Realtime Connection
let grokSocket = null;

async function initGrokSocket() {
    try {
        const response = await fetch("https://api.x.ai/v1/realtime/client_secrets", {
            method: 'POST',
            headers: {
                "Authorization": `Bearer ${API_KEY}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({ "expires_after": { "seconds": 3600 } })
        });
        const data = await response.json();
        const token = data.value;
        
        grokSocket = new WebSocket("wss://api.x.ai/v1/realtime", [`xai-client-secret.${token}`]);
        
        grokSocket.onopen = () => {
            console.log("🟢 Grok Realtime Connected!");
            grokSocket.send(JSON.stringify({
                type: "session.update",
                session: {
                    voice: "Rex",
                    instructions: "You are Nova, an advanced, highly intelligent sci-fi desktop worker robot. Embody this persona fully. Keep your answers extremely concise and direct. NEVER introduce yourself. Talk naturally.",
                    turn_detection: null, // We handle turns via Vosk (client side VAD)
                    audio: {
                        output: { format: { type: "audio/pcm", rate: 24000 } }
                    }
                }
            }));
        };

        grokSocket.onmessage = (event) => {
            const msg = JSON.parse(event.data);
            if (msg.type === "response.output_audio.delta") {
                playAudioChunk(msg.delta);
            } else if (msg.type === "response.output_audio_transcript.done") {
                console.log("🤖 Grok:", msg.transcript);
            } else if (msg.type === "response.done") {
                console.log("✅ Grok Finished Response.");
            }
        };

        grokSocket.onclose = () => {
            console.log("🔴 Grok Realtime Disconnected. Reconnecting in 3s...");
            setTimeout(initGrokSocket, 3000);
        };
    } catch(e) {
        console.error("Grok Socket Init Error:", e);
    }
}

// Start Grok WS connection
initGrokSocket();

function askGrokRealtime(text) {
    if (!grokSocket || grokSocket.readyState !== WebSocket.OPEN) {
        console.error("Grok Socket not ready!");
        return;
    }
    // Stop any currently overlapping audio
    nextPlayTime = grokAudioContext.currentTime;
    
    // Create the message
    grokSocket.send(JSON.stringify({
        type: "conversation.item.create",
        item: {
            type: "message",
            role: "user",
            content: [{ type: "input_text", text: text }]
        }
    }));
    // Request Nova to respond with audio
    grokSocket.send(JSON.stringify({
        type: "response.create",
        response: { modalities: ["audio", "text"] }
    }));
}

let listeningSymbol = document.createElement('div');
listeningSymbol.innerHTML = '🎤 Listening...';
listeningSymbol.style.position = 'absolute';
listeningSymbol.style.top = '20px';
listeningSymbol.style.right = '20px';
listeningSymbol.style.color = '#0ff';
listeningSymbol.style.fontFamily = 'monospace';
listeningSymbol.style.fontSize = '16px';
listeningSymbol.style.display = 'none';
listeningSymbol.style.textShadow = '0 0 5px #0ff';
document.body.appendChild(listeningSymbol);

let subtitleElement = document.createElement('div');
subtitleElement.id = 'subtitle';
subtitleElement.style.position = 'absolute';
subtitleElement.style.bottom = '40px';
subtitleElement.style.left = '50%';
subtitleElement.style.transform = 'translateX(-50%)';
subtitleElement.style.color = '#fff';
subtitleElement.style.fontFamily = 'sans-serif';
subtitleElement.style.fontSize = '24px';
subtitleElement.style.textShadow = '0px 2px 4px rgba(0,0,0,0.8), 0px 0px 10px #0ff';
subtitleElement.style.textAlign = 'center';
subtitleElement.style.pointerEvents = 'none';
subtitleElement.style.width = '80%';
document.body.appendChild(subtitleElement);

let uiLogElement = null;
function uiLog(msg) {
    if (!uiLogElement) {
        uiLogElement = document.createElement('div');
        uiLogElement.id = 'ui-log';
        uiLogElement.style.position = 'absolute';
        uiLogElement.style.bottom = '10px';
        uiLogElement.style.left = '10px';
        uiLogElement.style.color = '#0f0';
        uiLogElement.style.fontFamily = 'monospace';
        uiLogElement.style.fontSize = '12px';
        uiLogElement.style.whiteSpace = 'pre';
        uiLogElement.style.pointerEvents = 'none';
        document.body.appendChild(uiLogElement);
    }
    uiLogElement.innerText = msg;
    console.log(msg);
}

async function initOfflineVoice() {
    try {
        uiLog("1/3 Requesting Microphone...");
        const mediaStream = await navigator.mediaDevices.getUserMedia({
            video: false, 
            audio: { 
                echoCancellation: true, 
                noiseSuppression: false, 
                autoGainControl: false,
                channelCount: 1, 
                sampleRate: 16000 
            }
        });
        
        uiLog("2/3 Loading AI Voice Model (40MB)...");
        const modelUrl = 'appassets://model.tar.gz';
        const model = await window.Vosk.createModel(modelUrl);
        uiLog("3/3 AI Engine Ready!");
        
        recognizer = new model.KaldiRecognizer(16000);
        recognizer.setWords(true);
        
        let isAwake = false;
        let sleepTimer = null;
        let speechTimer = null;
        let accumulatedSpeech = "";

        function wakeUp() {
            isAwake = true;
            clearTimeout(sleepTimer);
            sleepTimer = setTimeout(() => {
                isAwake = false;
                uiLog("💤 Entered Sleep Mode");
            }, 10000); 
        }

        // Listen dynamically as the user speaks words
        recognizer.on("partialresult", (message) => {
            const text = message.result.partial.toLowerCase();
            if(!text) return;
            // Show mic instantly at the first sign of a greeting
            if(isAwake || text.match(/\b(hey|hay|hi)\b/)) {
                listeningSymbol.innerHTML = '🎤 Listening...';
                listeningSymbol.style.color = '#0ff';
                listeningSymbol.style.display = 'block';
                
                let display = accumulatedSpeech + " " + text;
                subtitleElement.innerText = display.trim();

                uiLog(`Partial: "${text}"`);
                if (isAwake) {
                    clearTimeout(sleepTimer);
                }
                clearTimeout(speechTimer);
            }
        });
        
        // Triggered when user finishes sentence and falls silent
        recognizer.on("result", (message) => {
            const text = message.result.text.toLowerCase().trim();
            
            if(!text) return;
            uiLog(`Final: "${text}"`);
            
            if (isAwake || text.match(/\b(hey|hay|hi)\b/)) {
                wakeUp();
                
                accumulatedSpeech += " " + text;
                accumulatedSpeech = accumulatedSpeech.trim();
                subtitleElement.innerText = accumulatedSpeech;
                
                clearTimeout(speechTimer);
                speechTimer = setTimeout(() => {
                    listeningSymbol.innerHTML = '⚙️ Processing...';
                    listeningSymbol.style.color = '#fb0';
                    subtitleElement.style.color = '#fb0'; // Turn yellow to show it's locked in
                    
                    let cmd = accumulatedSpeech.replace(/\b(hey|hay|hi)\b/g, '').trim();
                    accumulatedSpeech = "";
                    
                    if (!cmd || cmd.length === 0) {
                        askGrokRealtime("Hello, Nova.");
                        subtitleElement.innerText = "";
                        listeningSymbol.style.display = 'none';
                        subtitleElement.style.color = '#fff';
                    } else {
                        console.log('🎯 Processing command:', cmd);
                        askGrokRealtime(cmd);
                        subtitleElement.innerText = "";
                        subtitleElement.style.color = '#fff';
                        listeningSymbol.style.display = 'none';
                        wakeUp();
                    }
                }, 2000); // Wait 2 seconds of final silence before executing
            } else {
                listeningSymbol.style.display = 'none';
            }
        });
        
        const audioContext = new window.AudioContext({ sampleRate: 16000 });
        
        // Chromium Autoplay Policies strictly suspend AudioContexts if they are created without a user gesture.
        // Because Electron auto-grants microphone permissions, this script runs 0ms after boot, 
        // completely starving the AI Vosk engine of an active ticking microphone array unless we resume!
        if (audioContext.state === 'suspended') {
            uiLog("⚠️ Click the Robot once to activate Voice AI");
            const resumeAudio = () => {
                if (audioContext.state === 'suspended') {
                    audioContext.resume().then(() => {
                        uiLog("🎙️ Engine Unlocked! Say 'Hey'");
                    }).catch(err => console.error("Resume failed:", err));
                }
                window.removeEventListener('pointerdown', resumeAudio);
            };
            window.addEventListener('pointerdown', resumeAudio);
        } else {
            uiLog("🎙️ Engine Active! Say 'Hey'");
        }
        const recognizerNode = audioContext.createScriptProcessor(4096, 1, 1);
        let meterThrottle = 0;
        recognizerNode.onaudioprocess = (event) => {
            try { 
                if (recognizer) recognizer.acceptWaveform(event.inputBuffer); 
                
                if (meterThrottle++ % 5 === 0) {
                    const data = event.inputBuffer.getChannelData(0);
                    let maxVol = 0;
                    for (let i = 0; i < data.length; i++) {
                        if (Math.abs(data[i]) > maxVol) maxVol = Math.abs(data[i]);
                    }
                    const bars = '|'.repeat(Math.min(20, Math.floor(maxVol * 100)));
                    uiLog(`🎙️ Engine Active!\nVol: [${bars.padEnd(20, ' ')}]`);
                }
            } catch (error) { console.error('acceptWaveform error:', error); }
        };
        const source = audioContext.createMediaStreamSource(mediaStream);
        source.connect(recognizerNode);
        
        // Prevent Chromium from garbage collecting the graph by connecting it to the destination speaker.
        // HOWEVER, to avoid "EchoCancellation" from mutually self-muting the OS microphone to prevent feedback,
        // we pipe it through a 0-volume GainNode first!
        const silentNode = audioContext.createGain();
        silentNode.gain.value = 0;
        recognizerNode.connect(silentNode);
        silentNode.connect(audioContext.destination);
        
    } catch(e) {
        uiLog("Voice Error: " + (e.message || e));
    }
}

// Start watching microphone after a short delay to ensure UI renders
setTimeout(() => {
    initOfflineVoice();
}, 2000);
