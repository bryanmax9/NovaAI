const input = document.getElementById('chat-input');
const btn = document.getElementById('send-btn');
const messages = document.getElementById('messages');

const responses = [
  "Affirmative. Processing your request now.",
  "My sensors indicate that information is correct.",
  "I am currently optimizing local algorithms.",
  "Negative. That action violates my core directives.",
  "Scanning environment... All systems nominal.",
  "I am a worker robot, not a philosopher.",
  "Command acknowledged. Executing background tasks.",
  "Danger! Just kidding, everything is fine.",
  "Please wait while I consult the mainframe.",
  "Energy reserves are optimal. Ready to proceed.",
  "I have calculated the odds, and they are in our favor.",
  "Task added to my queue. I will process it shortly."
];

let currentAudio = null;

function speak(text) {
  if (currentAudio) {
    currentAudio.pause();
    currentAudio.currentTime = 0;
  }
  
  try {
    const url = `https://translate.google.com/translate_tts?ie=UTF-8&tl=en&client=tw-ob&q=${encodeURIComponent(text)}`;
    currentAudio = new Audio(url);
    
    // Play the external fallback fast to sound more robotic
    currentAudio.playbackRate = 1.25; 
    currentAudio.play().catch(e => console.error("Audio playback blocked:", e));
  } catch(e) {
    console.error("Failed to fetch TTS audio fallback", e);
  }
}

function addMessage(text, sender) {
  const div = document.createElement('div');
  div.className = `msg ${sender}`;
  div.textContent = text;
  messages.appendChild(div);
  messages.scrollTop = messages.scrollHeight; // Auto-scroll to latest
}

function handleSend() {
  const text = input.value.trim();
  if (!text) return;
  
  // 1. Add User Message
  addMessage(text, 'user');
  input.value = '';
  
  // 2. Add Bot Response after a small delay to simulate processing
  setTimeout(() => {
    const response = responses[Math.floor(Math.random() * responses.length)];
    addMessage(response, 'bot');
    speak(response);
  }, 400);
}

btn.addEventListener('click', handleSend);
input.addEventListener('keypress', (e) => {
  if (e.key === 'Enter') handleSend();
});

// Force the browser to load voices early
window.speechSynthesis.getVoices();
input.focus();
