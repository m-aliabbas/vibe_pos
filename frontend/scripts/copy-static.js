const fs = require('fs');
const path = require('path');

function copyDir(src, dest) {
    if (!fs.existsSync(src)) return;

    fs.mkdirSync(dest, { recursive: true });

    const entries = fs.readdirSync(src, { withFileTypes: true });

    for (let entry of entries) {
        let srcPath = path.join(src, entry.name);
        let destPath = path.join(dest, entry.name);

        if (entry.isDirectory()) {
            copyDir(srcPath, destPath);
        } else {
            fs.copyFileSync(srcPath, destPath);
        }
    }
}

const projectRoot = path.resolve(__dirname, '..');
// IMPORTANT: Matches the nested structure output by Next.js standalone
// .next/standalone/POS/frontend/server.js
const standaloneNextDir = path.join(projectRoot, '.next', 'standalone', 'POS', 'frontend', '.next');
const standalonePublicDir = path.join(projectRoot, '.next', 'standalone', 'POS', 'frontend', 'public');

const sourceNextStaticDir = path.join(projectRoot, '.next', 'static');
const sourcePublicDir = path.join(projectRoot, 'public');

console.log('Copying static assets to standalone build...');

// Copy .next/static -> .next/standalone/.next/static
if (fs.existsSync(sourceNextStaticDir)) {
    console.log(`Copying ${sourceNextStaticDir} -> ${path.join(standaloneNextDir, 'static')}`);
    copyDir(sourceNextStaticDir, path.join(standaloneNextDir, 'static'));
} else {
    console.warn(`Warning: ${sourceNextStaticDir} not found.`);
}

// Copy public -> .next/standalone/public
if (fs.existsSync(sourcePublicDir)) {
    console.log(`Copying ${sourcePublicDir} -> ${standalonePublicDir}`);
    copyDir(sourcePublicDir, standalonePublicDir);
} else {
    console.warn(`Warning: ${sourcePublicDir} not found.`);
}

console.log('Static assets copy complete.');