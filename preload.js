/**
 * CallSage – Preload Script
 *
 * Runs in a sandboxed renderer context *before* the React app loads.
 * Uses contextBridge to expose a safe, minimal API surface to the
 * renderer process.  The renderer CANNOT access Node.js directly;
 * it can only call these whitelisted methods.
 */

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('callsageAPI', {
  /**
   * Send a raw PCM Float32 audio buffer to the main process for
   * local Whisper transcription.
   * @param {ArrayBuffer} audioBuffer – interleaved PCM F32 samples
   * @returns {Promise<{ok: boolean, text?: string, error?: string}>}
   */
  transcribe: (audioBuffer) => ipcRenderer.invoke('transcribe', audioBuffer),

  /**
   * Send the full transcript string to the main process for
   * summarization.
   * @param {string} transcript
   * @returns {Promise<{ok: boolean, summary?: object, error?: string}>}
   */
  summarize: (transcript) => ipcRenderer.invoke('summarize', transcript),
});
