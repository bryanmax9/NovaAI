const fs = require('fs');
const path = require('path');
const os = require('os');

/**
 * Transcribe audio buffer using OpenAI Whisper
 * @param {Buffer} audioBuffer - The raw audio data (WebM/Ogg from MediaRecorder)
 * @returns {Promise<string>} - The transcribed text
 */
async function transcribeAudio(audioBuffer) {
    const API_KEY = process.env.OPENAI_API_KEY;
    if (!API_KEY) {
        throw new Error("OPENAI_API_KEY not found in environment.");
    }

    const tempPath = path.join(os.tmpdir(), `nova_audio_${Date.now()}.webm`);
    
    try {
        // Write buffer to temp file
        fs.writeFileSync(tempPath, audioBuffer);

        // Prepare multi-part form data manually for Whisper API
        const formData = new FormData();
        const blob = new Blob([audioBuffer], { type: 'audio/webm' });
        
        formData.append('file', blob, 'audio.webm');
        formData.append('model', 'whisper-1');
        formData.append('language', 'en');

        console.log('🎙️ Sending audio to Whisper API...');
        const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${API_KEY}`
            },
            body: formData
        });

        if (!response.ok) {
            const errText = await response.text();
            throw new Error(`Whisper API Error (${response.status}): ${errText}`);
        }

        const data = await response.json();
        const transcription = data.text || '';
        console.log('✅ Whisper Transcription:', transcription);
        
        return transcription.trim();

    } catch (error) {
        console.error('❌ Transcription Failed:', error);
        throw error;
    } finally {
        // Clean up temp file
        if (fs.existsSync(tempPath)) {
            try { fs.unlinkSync(tempPath); } catch (e) {}
        }
    }
}

module.exports = { transcribeAudio };
