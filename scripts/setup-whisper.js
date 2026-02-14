#!/usr/bin/env node
/* eslint-disable no-console */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const { Readable } = require('stream');
const { pipeline } = require('stream/promises');

const ROOT = path.join(__dirname, '..');
const WHISPER_DIR = path.join(ROOT, 'whisper');
const MODELS_DIR = path.join(WHISPER_DIR, 'models');
const IS_WIN = process.platform === 'win32';
const IS_MAC = process.platform === 'darwin';

const BIN_NAME = IS_WIN ? 'whisper-cli.exe' : 'whisper-cli';
const WHISPER_BIN = path.join(WHISPER_DIR, BIN_NAME);
const MODEL_PATH = path.join(MODELS_DIR, 'ggml-base.en.bin');

const MODEL_URL =
  'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.en.bin?download=true';

function log(msg) {
  console.log(`[setup-whisper] ${msg}`);
}

function run(cmd, args, cwd) {
  const result = spawnSync(cmd, args, {
    cwd,
    stdio: 'inherit',
    shell: false,
  });
  if (result.status !== 0) {
    throw new Error(`Command failed: ${cmd} ${args.join(' ')}`);
  }
}

function ensureDirs() {
  fs.mkdirSync(WHISPER_DIR, { recursive: true });
  fs.mkdirSync(MODELS_DIR, { recursive: true });
}

async function downloadFile(url, outPath) {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed download: ${url} (${res.status})`);
  }

  if (res.body && typeof res.body.getReader === 'function') {
    await pipeline(Readable.fromWeb(res.body), fs.createWriteStream(outPath));
    return;
  }

  const data = await res.arrayBuffer();
  fs.writeFileSync(outPath, Buffer.from(data));
}

function copyFileResolved(src, destDir, destName = path.basename(src)) {
  const destPath = path.join(destDir, destName);
  const stat = fs.lstatSync(src);
  if (stat.isSymbolicLink()) {
    const real = fs.realpathSync(src);
    fs.copyFileSync(real, destPath);
    return;
  }
  fs.copyFileSync(src, destPath);
}

function copyBuiltArtifacts(buildRoot) {
  const binDir = path.join(buildRoot, 'bin');
  const libDirs = [path.join(buildRoot, 'src'), path.join(buildRoot, 'ggml', 'src')];

  const builtBin = path.join(binDir, BIN_NAME);
  if (!fs.existsSync(builtBin)) {
    throw new Error(`Could not find built binary: ${builtBin}`);
  }

  fs.copyFileSync(builtBin, WHISPER_BIN);
  if (!IS_WIN) {
    fs.chmodSync(WHISPER_BIN, 0o755);
  }

  const libRegex = IS_MAC
    ? /^lib(whisper|ggml).*\.dylib(?:\..+)?$/
    : /^lib(whisper|ggml).*\.so(?:\..+)?$/;

  for (const dir of libDirs) {
    if (!fs.existsSync(dir)) continue;
    for (const name of fs.readdirSync(dir)) {
      if (!libRegex.test(name)) continue;
      const src = path.join(dir, name);
      copyFileResolved(src, WHISPER_DIR, name);

      if (fs.lstatSync(src).isSymbolicLink()) {
        const resolvedBase = path.basename(fs.realpathSync(src));
        const resolvedSrc = path.join(dir, resolvedBase);
        if (fs.existsSync(resolvedSrc)) {
          copyFileResolved(resolvedSrc, WHISPER_DIR, resolvedBase);
        }
      }
      log(`Copied ${name}`);
    }
  }
}

async function setupWindowsBinary() {
  const version = 'v1.8.3';
  const zipName = 'whisper-bin-x64.zip';
  const releaseUrl = `https://github.com/ggerganov/whisper.cpp/releases/download/${version}/${zipName}`;

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'whisper-cpp-win-'));
  const zipPath = path.join(tmpDir, zipName);
  const unpackDir = path.join(tmpDir, 'unpacked');
  fs.mkdirSync(unpackDir, { recursive: true });

  log(`Downloading ${releaseUrl}`);
  await downloadFile(releaseUrl, zipPath);

  run('powershell', [
    '-NoProfile',
    '-Command',
    `Expand-Archive -Path '${zipPath}' -DestinationPath '${unpackDir}' -Force`,
  ]);

  const candidates = [];
  function walk(dir) {
    for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, item.name);
      if (item.isDirectory()) {
        walk(full);
      } else {
        candidates.push(full);
      }
    }
  }
  walk(unpackDir);

  const exe = candidates.find((p) => p.toLowerCase().endsWith('whisper-cli.exe'));
  if (!exe) throw new Error('whisper-cli.exe not found in downloaded archive.');
  fs.copyFileSync(exe, WHISPER_BIN);

  for (const file of candidates) {
    const name = path.basename(file);
    if (/^.*\.dll$/i.test(name)) {
      fs.copyFileSync(file, path.join(WHISPER_DIR, name));
      log(`Copied ${name}`);
    }
  }
}

function setupUnixBinary() {
  const tmpSrc = fs.mkdtempSync(path.join(os.tmpdir(), 'whisper-cpp-src-'));
  log('Building whisper.cpp from source...');
  run('git', ['clone', '--depth', '1', 'https://github.com/ggerganov/whisper.cpp', tmpSrc]);
  run('cmake', ['-B', 'build'], tmpSrc);
  const threads = String(Math.max(1, os.cpus().length));
  run('cmake', ['--build', 'build', '--config', 'Release', '-j', threads], tmpSrc);
  copyBuiltArtifacts(path.join(tmpSrc, 'build'));
}

async function ensureBinary() {
  if (fs.existsSync(WHISPER_BIN)) {
    log(`Binary already exists at ${WHISPER_BIN}, skipping.`);
    return;
  }

  if (IS_WIN) {
    await setupWindowsBinary();
  } else {
    setupUnixBinary();
  }

  log(`Binary ready at ${WHISPER_BIN}`);
}

async function ensureModel() {
  if (fs.existsSync(MODEL_PATH)) {
    log('Model already present, skipping download.');
    return;
  }
  log('Downloading ggml-base.en model (~142MB)...');
  await downloadFile(MODEL_URL, MODEL_PATH);
  log(`Model ready at ${MODEL_PATH}`);
}

async function main() {
  console.log('╔══════════════════════════════════════════╗');
  console.log('║   CallSage – Whisper Setup               ║');
  console.log('╚══════════════════════════════════════════╝');
  ensureDirs();
  await ensureBinary();
  await ensureModel();
  log('Done.');
}

main().catch((err) => {
  console.error(`[setup-whisper] Failed: ${err.message}`);
  if (process.env.WHISPER_SETUP_STRICT === '1') {
    process.exit(1);
  }
  console.warn('[setup-whisper] Continuing without Whisper (set WHISPER_SETUP_STRICT=1 to fail fast).');
});
