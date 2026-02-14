/**
 * SummaryPanel.js – Structured Call Summary Display
 *
 * Renders the structured summary JSON returned by the summarization
 * handler after a call ends.  Provides "Copy to Clipboard" and
 * "Export as Plain Text" actions.
 *
 * Props:
 *   summary {object|null} – the structured summary, or null if no summary yet
 */

import React, { useCallback } from 'react';

export default function SummaryPanel({ summary }) {
  // ---- Copy to Clipboard ----
  const handleCopy = useCallback(() => {
    if (!summary) return;
    const text = formatSummaryAsText(summary);
    navigator.clipboard.writeText(text).then(
      () => alert('Summary copied to clipboard!'),
      () => alert('Failed to copy – please select and copy manually.')
    );
  }, [summary]);

  // ---- Export as Plain Text (download) ----
  const handleExport = useCallback(() => {
    if (!summary) return;
    const text = formatSummaryAsText(summary);
    const blob = new Blob([text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `callsage-summary-${Date.now()}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }, [summary]);

  if (!summary) return null;

  return (
    <div className="summary-panel">
      <h3>Call Summary</h3>

      <div className="summary-section">
        <h4>Summary</h4>
        <p>{summary.callSummary}</p>
      </div>

      <div className="summary-section">
        <h4>Identified Issues</h4>
        <ul>
          {summary.identifiedIssues.map((issue, i) => (
            <li key={i}>{issue}</li>
          ))}
        </ul>
      </div>

      <div className="summary-section">
        <h4>Steps Taken</h4>
        <ul>
          {summary.stepsTaken.map((step, i) => (
            <li key={i}>{step}</li>
          ))}
        </ul>
      </div>

      <div className="summary-section">
        <h4>Suggested Action Items</h4>
        <ul>
          {summary.suggestedActionItems.map((item, i) => (
            <li key={i}>{item}</li>
          ))}
        </ul>
      </div>

      <div className="summary-section">
        <h4>Customer Sentiment</h4>
        <p className={`sentiment sentiment-${summary.customerSentiment}`}>
          {summary.customerSentiment.charAt(0).toUpperCase() +
            summary.customerSentiment.slice(1)}
        </p>
      </div>

      <div className="summary-actions">
        <button className="btn btn-secondary" onClick={handleCopy}>
          Copy to Clipboard
        </button>
        <button className="btn btn-secondary" onClick={handleExport}>
          Export as Plain Text
        </button>
      </div>
    </div>
  );
}

/**
 * Format the structured summary object as human-readable plain text.
 */
function formatSummaryAsText(s) {
  return [
    '=== CallSage – Call Summary ===',
    '',
    'SUMMARY:',
    s.callSummary,
    '',
    'IDENTIFIED ISSUES:',
    ...s.identifiedIssues.map((i) => `  - ${i}`),
    '',
    'STEPS TAKEN:',
    ...s.stepsTaken.map((st) => `  - ${st}`),
    '',
    'SUGGESTED ACTION ITEMS:',
    ...s.suggestedActionItems.map((a) => `  - ${a}`),
    '',
    `CUSTOMER SENTIMENT: ${s.customerSentiment}`,
  ].join('\n');
}
