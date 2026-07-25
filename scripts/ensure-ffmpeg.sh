#!/usr/bin/env bash
# Ensure ffmpeg/ffprobe are available — system PATH or bundled npm static binaries.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

if command -v ffmpeg >/dev/null 2>&1 && command -v ffprobe >/dev/null 2>&1; then
  exit 0
fi

BENSON_ROOT="$ROOT" node <<'NODE'
const { createRequire } = require('module');
const fs = require('fs');
const path = require('path');
const root = process.env.BENSON_ROOT;
const req = createRequire(path.join(root, 'services/core/package.json'));

let ffmpegPath;
try {
  ffmpegPath = req('ffmpeg-static');
} catch {
  console.error('ffmpeg-static package not installed');
  process.exit(1);
}

if (!ffmpegPath || !fs.existsSync(ffmpegPath)) {
  try {
    req(path.join(path.dirname(req.resolve('ffmpeg-static')), 'install.js'));
    ffmpegPath = req('ffmpeg-static');
  } catch (err) {
    console.error('ffmpeg download failed:', err?.message ?? err);
    process.exit(1);
  }
}

let ffprobePath;
try {
  const mod = req('ffprobe-static');
  ffprobePath = typeof mod === 'string' ? mod : mod?.path;
} catch {
  console.error('ffprobe-static package not installed');
  process.exit(1);
}

if (!ffmpegPath || !fs.existsSync(ffmpegPath) || !ffprobePath || !fs.existsSync(ffprobePath)) {
  console.error('Bundled ffmpeg/ffprobe binaries missing after install');
  process.exit(1);
}

console.log(`Using bundled ffmpeg: ${ffmpegPath}`);
NODE
