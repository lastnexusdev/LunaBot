/**
 * whisperBridge.js – Local Offline Whisper Transcription Backend
 *
 * WHERE TO INTEGRATE THE LOCAL WHISPER BACKEND
 * ─────────────────────────────────────────────
 * This module runs in the Electron **main process** (Node.js).  It
 * receives a Float32Array of PCM audio from the renderer via IPC and
 * transcribes it using a locally installed whisper.cpp binary.
 *
 * SETUP REQUIREMENTS
 * ──────────────────
 * 1. Build or download whisper.cpp:
 *      git clone https://github.com/ggerganov/whisper.cpp
 *      cd whisper.cpp && make
 *    Place the binary at:  <app>/whisper/main   (or whisper/main.exe)
 *
 * 2. Download a GGML model (e.g. ggml-base.en.bin):
 *      bash whisper.cpp/models/download-ggml-model.sh base.en
 *    Place the model at:  <app>/whisper/models/ggml-base.en.bin
 *
 * 3. The paths below resolve relative to the Electron app root.  In a
 *    packaged build, electron-builder copies the whisper/ directory into
 *    the app's resources folder (see "extraResources" in package.json).
 *
 * ALTERNATIVE: WASM-based Whisper
 * ───────────────────────────────
 * Instead of spawning a native binary you can use whisper.cpp compiled
 * to WebAssembly.  Replace the spawn() call below with a WASM loader:
 *   - Load the .wasm binary with WebAssembly.instantiate()
 *   - Pass the PCM buffer to the WASM transcribe() export
 *   - Return the text result
 * The rest of the IPC plumbing stays identical.
 *
 * NO CLOUD APIs are contacted.  Everything runs locally.
 */

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');

// Resolve paths – works both in dev and when packaged via electron-builder
const isPackaged = __dirname.includes('app.asar');
const appRoot = isPackaged
  ? path.join(process.resourcesPath)
  : path.join(__dirname, '..', '..');

const WHISPER_BIN = path.join(
  appRoot,
  'whisper',
  process.platform === 'win32' ? 'main.exe' : 'main'
);
const WHISPER_MODEL = path.join(
  appRoot,
  'whisper',
  'models',
  'ggml-base.en.bin'
);

/**
 * Convert a Float32Array of PCM samples to a 16-bit WAV buffer in
 * memory (required by whisper.cpp's --file flag).
 *
 * @param {Float32Array} samples
 * @param {number}       sampleRate
 * @returns {Buffer}
 */
function float32ToWavBuffer(samples, sampleRate = 16000) {
  const numChannels = 1;
  const bitsPerSample = 16;
  const byteRate = sampleRate * numChannels * (bitsPerSample / 8);
  const blockAlign = numChannels * (bitsPerSample / 8);
  const dataSize = samples.length * (bitsPerSample / 8);
  const headerSize = 44;
  const buffer = Buffer.alloc(headerSize + dataSize);

  // RIFF header
  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write('WAVE', 8);

  // fmt sub-chunk
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16);           // sub-chunk size
  buffer.writeUInt16LE(1, 20);            // PCM format
  buffer.writeUInt16LE(numChannels, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(byteRate, 28);
  buffer.writeUInt16LE(blockAlign, 32);
  buffer.writeUInt16LE(bitsPerSample, 34);

  // data sub-chunk
  buffer.write('data', 36);
  buffer.writeUInt32LE(dataSize, 40);

  // Write PCM samples (Float32 → Int16)
  for (let i = 0; i < samples.length; i++) {
    const clamped = Math.max(-1, Math.min(1, samples[i]));
    const int16 = clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff;
    buffer.writeInt16LE(Math.round(int16), headerSize + i * 2);
  }

  return buffer;
}

/**
 * Resample audio from a source sample rate to a target sample rate
 * using simple linear interpolation.
 *
 * @param {Float32Array} samples
 * @param {number}       fromRate
 * @param {number}       toRate
 * @returns {Float32Array}
 */
function resample(samples, fromRate, toRate) {
  if (fromRate === toRate) return samples;
  const ratio = fromRate / toRate;
  const newLength = Math.round(samples.length / ratio);
  const result = new Float32Array(newLength);
  for (let i = 0; i < newLength; i++) {
    const srcIdx = i * ratio;
    const lo = Math.floor(srcIdx);
    const hi = Math.min(lo + 1, samples.length - 1);
    const frac = srcIdx - lo;
    result[i] = samples[lo] * (1 - frac) + samples[hi] * frac;
  }
  return result;
}

/**
 * Transcribe a Float32Array of PCM audio using the local whisper.cpp
 * binary.  Returns the transcribed text.
 *
 * If whisper.cpp is not installed, returns a helpful placeholder
 * message instead of crashing.
 *
 * @param {Float32Array} float32Samples – raw PCM audio
 * @param {number}       [sampleRate=48000] – source sample rate
 * @returns {Promise<string>}
 */
async function transcribeBuffer(float32Samples, sampleRate = 48000) {
  // ----------------------------------------------------------------
  // Check that the whisper binary and model exist
  // ----------------------------------------------------------------
  if (!fs.existsSync(WHISPER_BIN) || !fs.existsSync(WHISPER_MODEL)) {
    console.warn(
      '[whisperBridge] whisper.cpp binary or model not found.\n' +
        `  Expected binary: ${WHISPER_BIN}\n` +
        `  Expected model:  ${WHISPER_MODEL}\n` +
        '  Returning raw placeholder.  See whisperBridge.js for setup instructions.'
    );
    // Return a placeholder so the rest of the app still works during
    // development without a Whisper installation.
    return (
      '[Whisper not installed – placeholder transcript]\n' +
      'To enable real transcription, build whisper.cpp and place the\n' +
      'binary + model in the whisper/ directory.  See whisperBridge.js.'
    );
  }

  // Whisper expects 16 kHz mono PCM
  const resampled = resample(float32Samples, sampleRate, 16000);
  const wavBuf = float32ToWavBuffer(resampled, 16000);

  // Write WAV to a temp file (whisper.cpp requires a file path)
  const tmpPath = path.join(os.tmpdir(), `callsage_${Date.now()}.wav`);
  fs.writeFileSync(tmpPath, wavBuf);

  return new Promise((resolve, reject) => {
    const args = [
      '-m', WHISPER_MODEL,
      '-f', tmpPath,
      '--no-timestamps',
      '-nt',            // no timestamps in output
    ];

    const proc = spawn(WHISPER_BIN, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (d) => { stdout += d.toString(); });
    proc.stderr.on('data', (d) => { stderr += d.toString(); });

    proc.on('close', (code) => {
      // Clean up temp file
      try { fs.unlinkSync(tmpPath); } catch { /* ignore */ }

      if (code === 0) {
        resolve(stdout.trim());
      } else {
        reject(new Error(`whisper.cpp exited with code ${code}: ${stderr}`));
      }
    });

    proc.on('error', (err) => {
      try { fs.unlinkSync(tmpPath); } catch { /* ignore */ }
      reject(err);
    });
  });
}

module.exports = { transcribeBuffer };
