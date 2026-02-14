/**
 * CallControls.js – Start Call / End Call Buttons
 *
 * Props:
 *   isCallActive {boolean}  – whether a call is currently in progress
 *   onStartCall  {function} – handler for "Start Call"
 *   onEndCall    {function} – handler for "End Call"
 *   isProcessing {boolean}  – true while transcription/summarization runs
 *   canStart     {boolean}  – false until both devices are selected
 */

import React from 'react';

export default function CallControls({
  isCallActive,
  onStartCall,
  onEndCall,
  isProcessing,
  canStart,
}) {
  return (
    <div className="call-controls">
      {!isCallActive ? (
        <button
          className="btn btn-start"
          onClick={onStartCall}
          disabled={!canStart || isProcessing}
        >
          {isProcessing ? 'Processing…' : 'Start Call'}
        </button>
      ) : (
        <button className="btn btn-end" onClick={onEndCall}>
          End Call
        </button>
      )}
    </div>
  );
}
