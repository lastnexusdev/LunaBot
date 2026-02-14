/**
 * CallSage – Electron Main Process
 *
 * This file bootstraps the Electron application:
 *  - Creates the BrowserWindow that hosts the React UI
 *  - Grants microphone / audio-capture permissions so
 *    navigator.mediaDevices.enumerateDevices() and getUserMedia() work
 *  - Exposes IPC handlers for the local Whisper transcription backend
 *    and the summarization handler (both run in the main/Node process)
 */

const { app, BrowserWindow, ipcMain, session } = require('electron');
const path = require('path');
const { transcribeBuffer } = require('./src/utils/whisperBridge');
const { summarize } = require('./src/utils/summarizer');

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1100,
    height: 800,
    title: 'CallSage',
    webPreferences: {
      // The preload script exposes safe IPC wrappers to the renderer
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // Load the webpack-built React UI
  mainWindow.loadFile(path.join(__dirname, 'build', 'index.html'));

  // -------------------------------------------------------------------
  // PERMISSION HANDLING
  // Electron requires an explicit permission handler so the renderer can
  // access media devices (microphone, audio capture).  We grant
  // 'media' requests automatically; all other permission types are
  // denied by default to follow the principle of least privilege.
  // -------------------------------------------------------------------
  session.defaultSession.setPermissionRequestHandler(
    (_webContents, permission, callback) => {
      if (permission === 'media') {
        callback(true);
      } else {
        callback(false);
      }
    }
  );
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

// -------------------------------------------------------------------
// IPC: Whisper transcription
// The renderer sends a raw PCM Float32 audio buffer (ArrayBuffer) via
// the 'transcribe' channel.  We forward it to the whisperBridge module
// which spawns a local whisper.cpp process (or can be swapped for a
// WASM build).  The transcribed text is returned to the renderer.
// -------------------------------------------------------------------
ipcMain.handle('transcribe', async (_event, audioArrayBuffer) => {
  try {
    const float32 = new Float32Array(audioArrayBuffer);
    const text = await transcribeBuffer(float32);
    return { ok: true, text };
  } catch (err) {
    console.error('Transcription error:', err);
    return { ok: false, error: err.message };
  }
});

// -------------------------------------------------------------------
// IPC: Summarization
// The renderer sends the full raw transcript string.  The summarizer
// module parses it and returns a structured JSON summary.
// FUTURE: Replace the rule-based summarizer with a local LLM engine
//         (e.g. llama.cpp, Ollama, or a fine-tuned ONNX model).
// -------------------------------------------------------------------
ipcMain.handle('summarize', async (_event, transcript) => {
  try {
    const summary = await summarize(transcript);
    return { ok: true, summary };
  } catch (err) {
    console.error('Summarization error:', err);
    return { ok: false, error: err.message };
  }
});
