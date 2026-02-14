# CallSage

Offline desktop call transcription and summarization application built with **Electron v26** and **React v18**.

## Features

- **Dynamic audio device selection** – enumerates all system audio inputs (physical mics, virtual cables, Sonar channels) and lets you pick a call-audio device and a microphone device
- **In-memory audio capture** – merges both streams into a single PCM buffer in RAM (no disk writes)
- **Local Whisper transcription** – integrates with whisper.cpp for fully offline speech-to-text
- **Live transcript** – shows incremental transcription while the call is active
- **Structured call summary** – after the call ends, produces JSON with summary, issues, steps, action items, and sentiment
- **Copy / Export** – copy the summary to clipboard or download as plain text
- **Fully offline** – no audio or text is sent to any cloud service

## Prerequisites

- Node.js 18+
- npm 9+

### Optional: Local Whisper (for real transcription)

1. Build [whisper.cpp](https://github.com/ggerganov/whisper.cpp):
   ```bash
   git clone https://github.com/ggerganov/whisper.cpp
   cd whisper.cpp && make
   ```
2. Download a model:
   ```bash
   bash models/download-ggml-model.sh base.en
   ```
3. Place files in the project:
   ```
   whisper/
     main            # (or main.exe on Windows)
     models/
       ggml-base.en.bin
   ```

Without Whisper installed, the app runs with placeholder transcription text.

## Quick Start

```bash
npm install
npm start        # build React + launch Electron
```

## Development

```bash
npm run dev      # watch-mode webpack + Electron (concurrent)
```

## Production Build

```bash
npm run build    # webpack production + electron-builder package
```

Output goes to `dist/`.

## Project Structure

```
main.js                  Electron main process
preload.js               Context-bridge preload script
webpack.config.js        Webpack config for the React renderer
src/
  index.js               React entry point
  styles.css             Application styles
  components/
    App.js               Root component – call lifecycle orchestration
    DeviceSelector.js    Audio device dropdown
    TranscriptArea.js    Live transcript display
    CallControls.js      Start / End call buttons
    SummaryPanel.js      Structured summary with copy/export
  utils/
    audioDevices.js      Device enumeration & getUserMedia helpers
    audioMerger.js       Web Audio API stream merger (in-memory)
    whisperBridge.js     Node-side whisper.cpp integration
    summarizer.js        Rule-based summarization (replaceable with LLM)
```

## Replacing the Summarizer with a Local LLM

See the inline comments in `src/utils/summarizer.js` for detailed instructions on swapping in:
- **Ollama / llama.cpp** – spawn or HTTP-POST to a local model server
- **ONNX Runtime** – load an ONNX summarization model in Node

## License

MIT
