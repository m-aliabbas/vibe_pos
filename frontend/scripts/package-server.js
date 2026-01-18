const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Configuration
const platform = process.platform;
const arch = process.arch;

let TARGET_TRIPLE = '';
let EXTENSION = '';

if (platform === 'darwin') {
    TARGET_TRIPLE = arch === 'arm64' ? 'aarch64-apple-darwin' : 'x86_64-apple-darwin';
} else if (platform === 'win32') {
    TARGET_TRIPLE = 'x86_64-pc-windows-msvc';
    EXTENSION = '.exe';
} else if (platform === 'linux') {
    TARGET_TRIPLE = 'x86_64-unknown-linux-gnu';
} else {
    console.error(`Unsupported platform: ${platform}`);
    process.exit(1);
}

const BIN_NAME = 'next-server';
const BIN_DIR = path.join(__dirname, '../src-tauri/bin');

// Ensure output directory exists
if (!fs.existsSync(BIN_DIR)) {
    fs.mkdirSync(BIN_DIR, { recursive: true });
}

console.log('📦  Preparing Next.js server sidecar...');

// 1. Copy static files into standalone (Next.js doesn't do this by default)
const standaloneDir = path.join(__dirname, '../.next/standalone');
const staticSrc = path.join(__dirname, '../.next/static');
const staticDest = path.join(standaloneDir, '.next/static');
const publicSrc = path.join(__dirname, '../public');
const publicDest = path.join(standaloneDir, 'public');

console.log('📂  Copying static files to standalone...');

// Helper to copy directory robustly
function copyDir(src, dest) {
    if (!fs.existsSync(src)) {
        console.warn(`Warning: Source directory not found: ${src}`);
        return;
    }

    console.log(`Copying ${src} -> ${dest}`);

    // Create parent directory if needed
    const parent = path.dirname(dest);
    if (!fs.existsSync(parent)) {
        fs.mkdirSync(parent, { recursive: true });
    }

    // Remove destination if it exists to ensure clean copy
    if (fs.existsSync(dest)) {
        fs.rmSync(dest, { recursive: true, force: true });
    }

    fs.cpSync(src, dest, { recursive: true });
}

copyDir(staticSrc, staticDest);
copyDir(publicSrc, publicDest);

// 2. Bundle Node.js binary as the sidecar
console.log('🤖  Bundling Node.js binary...');
const nodePath = process.execPath; // Use the current Node binary
const sidecarPath = path.join(BIN_DIR, `${BIN_NAME}-${TARGET_TRIPLE}${EXTENSION}`);

fs.copyFileSync(nodePath, sidecarPath);
fs.chmodSync(sidecarPath, 0o755);

console.log(`✅  Node binary copied to ${sidecarPath}`);
console.log('   (Note: bundling "standalone" directory as resources in tauri.conf.json)');
