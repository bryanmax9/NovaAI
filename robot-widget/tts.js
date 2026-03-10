const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');

// Platform paths
const piperExe = os.platform() === 'win32' ? 'piper.exe' : 'piper';
const piperPath = path.join(__dirname, 'piper', piperExe);
const modelPath = path.join(__dirname, 'piper', 'model.onnx');

function generateSpeech(text, relativeOutputPath) {
    return new Promise((resolve, reject) => {
        if (!fs.existsSync(piperPath)) {
            return reject(new Error("Piper binary not found. Run: node scripts/download-piper.js"));
        }

        // Use MP3 format for better browser compatibility
        const mp3OutputPath = relativeOutputPath.replace('.wav', '.mp3');
        const absoluteOutputPath = path.join(__dirname, mp3OutputPath);
        
        // Ensure the directory exists
        const dir = path.dirname(absoluteOutputPath);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }

        // Generate WAV first, then convert to MP3
        const tempWavPath = absoluteOutputPath.replace('.mp3', '.wav');
        
        const piperProcess = spawn(piperPath, [
            '--model', modelPath,
            '--output_file', tempWavPath
        ]);

        let piperStderr = '';
        piperProcess.stderr.on('data', (data) => {
            piperStderr += data.toString();
        });

        piperProcess.on('close', async (code) => {
            if (code === 0) {
                // Wait briefly to ensure file is flushed (avoid race condition)
                let retries = 5;
                while (retries > 0 && !fs.existsSync(tempWavPath)) {
                    await new Promise(r => setTimeout(r, 100));
                    retries--;
                }

                if (!fs.existsSync(tempWavPath)) {
                    return reject(new Error(`Piper claimed success but ${tempWavPath} was not created after waiting.`));
                }

                // Convert WAV to MP3 using ffmpeg if available
                const ffmpegProcess = spawn('ffmpeg', ['-i', tempWavPath, '-y', absoluteOutputPath]);
                
                ffmpegProcess.on('close', (ffmpegCode) => {
                    if (ffmpegCode === 0 && fs.existsSync(absoluteOutputPath)) {
                        try { fs.unlinkSync(tempWavPath); } catch (e) {}
                        console.log('🔊 MP3 generated successfully');
                        resolve(mp3OutputPath);
                    } else {
                        console.log('🔊 Using WAV format (ffmpeg failed or not available)');
                        resolve(relativeOutputPath);
                    }
                });
                
                ffmpegProcess.on('error', () => {
                    console.log('🔊 Using WAV format (ffmpeg error)');
                    resolve(relativeOutputPath);
                });
            } else {
                console.error(`❌ Piper error: ${piperStderr}`);
                reject(new Error(`Piper exited with code ${code}. Error: ${piperStderr}`));
            }
        });
        
        piperProcess.on('error', reject);

        // Send the input text cleanly through stdin to bypass character-escaping bugs
        piperProcess.stdin.write(text + "\n");
        piperProcess.stdin.end();
    });
}

module.exports = { generateSpeech };
