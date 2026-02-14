/**
 * summarizer.js – Local Call Transcript Summarization Handler
 *
 * This module runs in the Electron **main process**.  It receives the
 * full raw transcript (string) and produces a structured JSON summary.
 *
 * CURRENT IMPLEMENTATION: Rule-based / heuristic
 * ───────────────────────────────────────────────
 * The current version uses simple NLP heuristics (keyword matching,
 * sentence splitting) to extract a summary.  This is a fully offline
 * baseline that works without any external model.
 *
 * WHERE TO REPLACE WITH A LOCAL LLM ENGINE
 * ─────────────────────────────────────────
 * To upgrade to a real local LLM:
 *
 *   Option A – llama.cpp / Ollama:
 *     1. Install Ollama (https://ollama.ai) or build llama.cpp
 *     2. Download a quantized model (e.g. Mistral-7B-Q4)
 *     3. Replace the summarize() function below with a call to:
 *          spawn('ollama', ['run', 'mistral', '--prompt', prompt])
 *        or an HTTP POST to the Ollama local server on localhost:11434.
 *
 *   Option B – ONNX Runtime:
 *     1. Export / download an ONNX-format summarization model
 *     2. Use the 'onnxruntime-node' npm package to load and infer
 *     3. Replace summarize() with the ONNX inference call
 *
 * The structured output schema stays the same regardless of backend.
 */

/**
 * Produce a structured summary from a raw call transcript.
 *
 * @param {string} transcript – the full transcribed text
 * @returns {Promise<object>} structured summary JSON
 */
async function summarize(transcript) {
  if (!transcript || transcript.trim().length === 0) {
    return {
      callSummary: 'No transcript available.',
      identifiedIssues: [],
      stepsTaken: [],
      suggestedActionItems: [],
      customerSentiment: 'unknown',
    };
  }

  const sentences = transcript
    .replace(/([.!?])\s+/g, '$1\n')
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean);

  // ---- Call summary: first ~3 sentences or up to 300 chars ----
  const callSummary = sentences.slice(0, 3).join(' ').substring(0, 300) ||
    transcript.substring(0, 300);

  // ---- Issue detection (keyword-based heuristic) ----
  const issueKeywords = [
    'problem', 'issue', 'error', 'broken', 'not working', 'fail',
    'crash', 'bug', 'unable', 'cannot', 'wrong', 'complaint',
    'frustrated', 'disappointed', 'concern',
  ];
  const identifiedIssues = sentences.filter((s) =>
    issueKeywords.some((kw) => s.toLowerCase().includes(kw))
  );

  // ---- Steps taken ----
  const stepKeywords = [
    'tried', 'restarted', 'reset', 'updated', 'checked', 'verified',
    'installed', 'configured', 'ran', 'cleared', 'rebooted',
    'escalated', 'submitted', 'contacted',
  ];
  const stepsTaken = sentences.filter((s) =>
    stepKeywords.some((kw) => s.toLowerCase().includes(kw))
  );

  // ---- Action items ----
  const actionKeywords = [
    'follow up', 'follow-up', 'schedule', 'send', 'will',
    'need to', 'should', 'please', 'make sure', 'ensure',
    'next step', 'action', 'todo', 'to-do',
  ];
  const suggestedActionItems = sentences.filter((s) =>
    actionKeywords.some((kw) => s.toLowerCase().includes(kw))
  );

  // ---- Sentiment analysis (very basic) ----
  const posWords = [
    'thank', 'great', 'happy', 'appreciate', 'resolved', 'good',
    'excellent', 'wonderful', 'satisfied', 'perfect',
  ];
  const negWords = [
    'angry', 'upset', 'frustrated', 'terrible', 'worst', 'horrible',
    'disappointed', 'unacceptable', 'awful', 'furious',
  ];
  const lower = transcript.toLowerCase();
  const posScore = posWords.filter((w) => lower.includes(w)).length;
  const negScore = negWords.filter((w) => lower.includes(w)).length;

  let customerSentiment = 'neutral';
  if (posScore > negScore + 1) customerSentiment = 'positive';
  else if (negScore > posScore + 1) customerSentiment = 'negative';
  else if (negScore > 0 && posScore > 0) customerSentiment = 'mixed';

  return {
    callSummary,
    identifiedIssues:
      identifiedIssues.length > 0
        ? identifiedIssues
        : ['No specific issues detected.'],
    stepsTaken:
      stepsTaken.length > 0
        ? stepsTaken
        : ['No explicit steps detected in transcript.'],
    suggestedActionItems:
      suggestedActionItems.length > 0
        ? suggestedActionItems
        : ['Review transcript for follow-up items.'],
    customerSentiment,
  };
}

module.exports = { summarize };
