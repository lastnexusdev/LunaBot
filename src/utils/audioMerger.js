/**
 * audioMerger.js – Merge Multiple MediaStreams Into a Single Audio Buffer
 *
 * HOW STREAM MERGING WORKS
 * ────────────────────────
 * We use the Web Audio API (AudioContext) to combine two independent
 * MediaStreams (call audio + microphone) into one output:
 *
 *   1. Create an AudioContext (offline-capable, runs in the renderer).
 *   2. For each MediaStream, create a MediaStreamSource node.
 *   3. Connect both source nodes to a single ChannelMergerNode (or,
 *      more simply, to the same destination / ScriptProcessorNode).
 *   4. A ScriptProcessorNode (or AudioWorklet) captures the mixed
 *      PCM samples and appends them to an in-memory buffer array.
 *
 * All audio stays in RAM – no disk writes at any point.
 *
 * The merged Float32Array is what we later send to Whisper for
 * transcription.
 */

/**
 * AudioMerger manages an AudioContext that mixes two MediaStreams and
 * collects the interleaved PCM data into an in-memory buffer.
 */
export class AudioMerger {
  constructor() {
    /** @type {AudioContext|null} */
    this.ctx = null;
    /** @type {MediaStreamAudioSourceNode[]} */
    this.sources = [];
    /** @type {ScriptProcessorNode|null} */
    this.processor = null;
    /** @type {Float32Array[]} Chunks of PCM data kept in RAM */
    this.chunks = [];
    /** @type {number} Total sample count across all chunks */
    this.totalSamples = 0;
    /** @type {function|null} Optional callback that receives chunks for live transcription */
    this.onChunk = null;
  }

  /**
   * Begin capturing and merging audio from two streams.
   *
   * @param {MediaStream} callStream   – the call / virtual-cable stream
   * @param {MediaStream} micStream    – the user's microphone stream
   * @param {function}    [onChunk]    – optional callback(Float32Array)
   *                                     invoked every ~4096 samples for
   *                                     live / incremental transcription
   */
  start(callStream, micStream, onChunk) {
    this.stop(); // clean up any prior session

    this.onChunk = onChunk || null;
    this.chunks = [];
    this.totalSamples = 0;

    // Create a standard AudioContext (44100 or 48000 Hz depending on OS)
    this.ctx = new (window.AudioContext || window.webkitAudioContext)();

    // Create source nodes from each MediaStream
    const callSource = this.ctx.createMediaStreamSource(callStream);
    const micSource = this.ctx.createMediaStreamSource(micStream);
    this.sources = [callSource, micSource];

    // ----------------------------------------------------------------
    // ScriptProcessorNode (bufferSize=4096, 1 input channel, 1 output)
    //
    // Although ScriptProcessorNode is deprecated in favour of
    // AudioWorklet, it remains widely supported in Electron 26 and is
    // simpler to set up for this use-case.  To migrate to AudioWorklet,
    // create a dedicated AudioWorkletProcessor class that posts PCM
    // data back via its port.
    // ----------------------------------------------------------------
    const BUFFER_SIZE = 4096;
    this.processor = this.ctx.createScriptProcessor(BUFFER_SIZE, 1, 1);

    this.processor.onaudioprocess = (e) => {
      // The input buffer already contains the *mixed* signal because
      // both sources are connected to this processor's input.
      const pcm = e.inputBuffer.getChannelData(0);
      const copy = new Float32Array(pcm.length);
      copy.set(pcm);
      this.chunks.push(copy);
      this.totalSamples += copy.length;

      if (this.onChunk) {
        this.onChunk(copy);
      }
    };

    // Wire: sources → GainNode (unity mix) → processor → destination
    // Both sources feed into the same gain node so their signals add.
    const gain = this.ctx.createGain();
    gain.gain.value = 1.0;

    callSource.connect(gain);
    micSource.connect(gain);
    gain.connect(this.processor);
    // ScriptProcessorNode requires connection to destination to tick
    this.processor.connect(this.ctx.destination);
  }

  /**
   * Stop capturing and return the complete merged audio buffer.
   * @returns {Float32Array} – all captured PCM samples in one contiguous array
   */
  stop() {
    if (this.processor) {
      this.processor.disconnect();
      this.processor.onaudioprocess = null;
      this.processor = null;
    }
    this.sources.forEach((s) => {
      try { s.disconnect(); } catch { /* already disconnected */ }
    });
    this.sources = [];

    if (this.ctx && this.ctx.state !== 'closed') {
      this.ctx.close().catch(() => {});
    }

    // Flatten all chunks into one contiguous Float32Array
    const merged = new Float32Array(this.totalSamples);
    let offset = 0;
    for (const chunk of this.chunks) {
      merged.set(chunk, offset);
      offset += chunk.length;
    }

    const sampleRate = this.ctx ? this.ctx.sampleRate : 48000;
    this.ctx = null;
    this.chunks = [];
    this.totalSamples = 0;

    return { samples: merged, sampleRate };
  }

  /** @returns {number} The AudioContext sample rate (e.g. 48000) */
  getSampleRate() {
    return this.ctx ? this.ctx.sampleRate : 48000;
  }
}
