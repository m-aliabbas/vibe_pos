import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const applicationId = process.argv[2];
const supportedApplications = new Set(['workshop', 'restaurant']);

if (!supportedApplications.has(applicationId)) {
    console.error(`Expected an application ID: ${[...supportedApplications].join(', ')}`);
    process.exit(2);
}

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const executableName = process.platform === 'win32' ? 'tauri.cmd' : 'tauri';
const tauriExecutable = path.join(root, 'node_modules', '.bin', executableName);
const targetConfig = path.join('src-tauri', `tauri.${applicationId}.conf.json`);
const configs = process.platform === 'darwin'
    ? ['src-tauri/tauri.conf_mac.json', targetConfig]
    : [targetConfig];

if (!fs.existsSync(tauriExecutable)) {
    console.error(`Tauri CLI was not found at ${tauriExecutable}`);
    process.exit(1);
}

const result = spawnSync(
    tauriExecutable,
    ['build', ...configs.flatMap((config) => ['--config', config]), ...process.argv.slice(3)],
    {
        cwd: root,
        env: { ...process.env, VIBE_APPLICATION_ID: applicationId },
        stdio: 'inherit',
        shell: process.platform === 'win32',
    },
);

if (result.error) throw result.error;
process.exit(result.status ?? 1);
