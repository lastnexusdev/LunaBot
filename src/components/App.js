/**
 * App.js – CallSage Root Component
 *
 * Orchestrates the full call lifecycle:
 *   1. Enumerate audio devices on mount
 *   2. Let the user select call-audio and microphone devices
 *   3. On "Start Call": open both streams, merge them, begin live
 *      transcription (incremental chunks sent to Whisper)
 *   4. On "End Call": stop capture, run final Whisper transcription
 *      on the full buffer, then pass the transcript to the summarizer
 *   5. Display the structured summary with copy/export actions
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import DeviceSelector from './DeviceSelector';
import TranscriptArea from './TranscriptArea';
import CallControls from './CallControls';
import SummaryPanel from './SummaryPanel';
import { getAudioInputDevices, openAudioStream } from '../utils/audioDevices';
import { AudioMerger } from '../utils/audioMerger';

export default function App() {
  // ---- State ----
  const [devices, setDevices] = useState([]);
  const [callDeviceId, setCallDeviceId] = useState('');
  const [micDeviceId, setMicDeviceId] = useState('');
  const [isCallActive, setIsCallActive] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [liveTranscript, setLiveTranscript] = useState('');
  const [summary, setSummary] = useState(null);

  // Refs that persist across renders without triggering re-renders
  const mergerRef = useRef(new AudioMerger());
  const callStreamRef = useRef(null);
  const micStreamRef = useRef(null);
  // Buffer to accumulate live chunks for incremental transcription
  const liveChunksRef = useRef([]);
  const liveChunkSamplesRef = useRef(0);

  // -------------------------------------------------------------------
  // DEVICE ENUMERATION
  // On mount, request permission and list all audio input devices.
  // We also listen for device changes (e.g. user plugs in a USB mic).
  // -------------------------------------------------------------------
  useEffect(() => {
    async function enumerate() {
      const audioInputs = await getAudioInputDevices();
      setDevices(audioInputs);
    }
    enumerate();

    // Re-enumerate when devices are connected / disconnected
    navigator.mediaDevices.addEventListener('devicechange', enumerate);
    return () => {
      navigator.mediaDevices.removeEventListener('devicechange', enumerate);
    };
  }, []);

  // -------------------------------------------------------------------
  // LIVE (INCREMENTAL) TRANSCRIPTION CALLBACK
  // Called by AudioMerger every ~4096 samples.  We accumulate chunks
  // and send a batch to Whisper every ~3 seconds of audio so the user
  // sees text appear while the call is running.
  //
  // NOTE: The quality of incremental transcription depends on the
  //       Whisper model used.  Smaller models are faster but less
  //       accurate on short segments.
  // -------------------------------------------------------------------
  const LIVE_BATCH_SECONDS = 3;

  const handleAudioChunk = useCallback(
    (chunk) => {
      liveChunksRef.current.push(chunk);
      liveChunkSamplesRef.current += chunk.length;

      const sampleRate = mergerRef.current.getSampleRate();
      const batchSamples = LIVE_BATCH_SECONDS * sampleRate;

      if (liveChunkSamplesRef.current >= batchSamples) {
        // Flatten accumulated chunks into one buffer
        const total = liveChunkSamplesRef.current;
        const batch = new Float32Array(total);
        let off = 0;
        for (const c of liveChunksRef.current) {
          batch.set(c, off);
          off += c.length;
        }
        liveChunksRef.current = [];
        liveChunkSamplesRef.current = 0;

        // Send to Whisper via the preload-exposed IPC bridge
        if (window.callsageAPI) {
          window.callsageAPI
            .transcribe(batch.buffer)
            .then((res) => {
              if (res.ok && res.text) {
                setLiveTranscript((prev) => prev + ' ' + res.text);
              }
            })
            .catch(() => {
              // Silently ignore live transcription errors to avoid
              // disrupting the call
            });
        }
      }
    },
    []
  );

  // -------------------------------------------------------------------
  // START CALL
  // Open both audio streams, merge them, begin capturing.
  // -------------------------------------------------------------------
  const handleStartCall = useCallback(async () => {
    if (!callDeviceId || !micDeviceId) return;

    try {
      // Open both streams using the user-selected device IDs.
      // openAudioStream uses getUserMedia with { deviceId: { exact: id } }.
      const callStream = await openAudioStream(callDeviceId);
      const micStream = await openAudioStream(micDeviceId);

      callStreamRef.current = callStream;
      micStreamRef.current = micStream;

      // Reset transcript and summary for the new call
      setLiveTranscript('');
      setSummary(null);
      liveChunksRef.current = [];
      liveChunkSamplesRef.current = 0;

      // Start capturing and merging the two streams into one in-memory
      // buffer.  The handleAudioChunk callback enables live transcription.
      mergerRef.current.start(callStream, micStream, handleAudioChunk);

      setIsCallActive(true);
    } catch (err) {
      console.error('Failed to start call:', err);
      alert(`Could not open audio device: ${err.message}`);
    }
  }, [callDeviceId, micDeviceId, handleAudioChunk]);

  // -------------------------------------------------------------------
  // END CALL
  // Stop capture → full-buffer Whisper transcription → summarization
  // -------------------------------------------------------------------
  const handleEndCall = useCallback(async () => {
    setIsCallActive(false);
    setIsProcessing(true);

    // Stop the merger and get the complete PCM buffer
    const { samples, sampleRate } = mergerRef.current.stop();

    // Stop all media tracks so the OS releases the devices
    [callStreamRef.current, micStreamRef.current].forEach((stream) => {
      if (stream) stream.getTracks().forEach((t) => t.stop());
    });
    callStreamRef.current = null;
    micStreamRef.current = null;

    try {
      // ---- Step 1: Full-buffer transcription via Whisper ----
      let finalTranscript = liveTranscript;

      if (window.callsageAPI && samples.length > 0) {
        const res = await window.callsageAPI.transcribe(samples.buffer);
        if (res.ok && res.text) {
          finalTranscript = res.text;
        }
      }

      setLiveTranscript(finalTranscript);

      // ---- Step 2: Summarization ----
      if (window.callsageAPI && finalTranscript) {
        const sumRes = await window.callsageAPI.summarize(finalTranscript);
        if (sumRes.ok) {
          setSummary(sumRes.summary);
        }
      }
    } catch (err) {
      console.error('Post-call processing error:', err);
    } finally {
      setIsProcessing(false);
    }
  }, [liveTranscript]);

  // -------------------------------------------------------------------
  // RENDER
  // -------------------------------------------------------------------
  const canStart = callDeviceId !== '' && micDeviceId !== '';

  return (
    <div className="app">
      <header className="app-header">
        <h1>CallSage</h1>
        <p className="subtitle">Offline Call Transcription &amp; Summarization</p>
      </header>

      <main className="app-main">
        {/* Device selection row */}
        <div className="device-row">
          <DeviceSelector
            label="Call Audio Device"
            devices={devices}
            value={callDeviceId}
            onChange={setCallDeviceId}
            disabled={isCallActive}
          />
          <DeviceSelector
            label="Microphone"
            devices={devices}
            value={micDeviceId}
            onChange={setMicDeviceId}
            disabled={isCallActive}
          />
        </div>

        {/* Call controls */}
        <CallControls
          isCallActive={isCallActive}
          onStartCall={handleStartCall}
          onEndCall={handleEndCall}
          isProcessing={isProcessing}
          canStart={canStart}
        />

        {/* Live transcript */}
        <TranscriptArea
          transcript={liveTranscript}
          isLive={isCallActive}
        />

        {/* Structured summary (shown after End Call) */}
        <SummaryPanel summary={summary} />
      </main>
    </div>
  );
}
