/**
 * TranscriptArea.js – Live Transcript Display
 *
 * Shows the transcribed text in real time while a call is active.
 * The parent component appends new text as it arrives from the
 * Whisper transcription backend.
 *
 * Props:
 *   transcript {string}  – the running transcript text
 *   isLive     {boolean} – true while a call is in progress
 */

import React, { useEffect, useRef } from 'react';

export default function TranscriptArea({ transcript, isLive }) {
  const containerRef = useRef(null);

  // Auto-scroll to the bottom as new text arrives
  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [transcript]);

  return (
    <div className="transcript-area">
      <div className="transcript-header">
        <h3>Live Transcript</h3>
        {isLive && <span className="live-indicator">LIVE</span>}
      </div>
      <div className="transcript-content" ref={containerRef}>
        {transcript || (
          <span className="placeholder-text">
            Transcript will appear here when a call is started…
          </span>
        )}
      </div>
    </div>
  );
}
