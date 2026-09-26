import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const frontendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const tauriRoot = path.join(frontendRoot, 'src-tauri');
const repositoryRoot = path.dirname(frontendRoot);

function readTarget(applicationId) {
    return JSON.parse(fs.readFileSync(
        path.join(tauriRoot, `tauri.${applicationId}.conf.json`),
        'utf8',
    ));
}

test('independent desktop targets have unique identities and do not bundle retail runtime data', () => {
    const workshop = readTarget('workshop');
    const restaurant = readTarget('restaurant');

    assert.equal(workshop.identifier, 'com.vibeexe.workshop');
    assert.equal(restaurant.identifier, 'com.vibeexe.restaurant');
    assert.notEqual(workshop.identifier, restaurant.identifier);
    assert.ok(workshop.bundle.resources.includes('bin/.env'));
    assert.ok(restaurant.bundle.resources.includes('bin/.env'));
    assert.ok(!workshop.bundle.resources.some((resource) => resource.includes('bin/data')));
    assert.ok(!restaurant.bundle.resources.some((resource) => resource.includes('bin/data')));
});

test('app-specific package scripts target both independent products', () => {
    const packageJson = JSON.parse(fs.readFileSync(path.join(frontendRoot, 'package.json'), 'utf8'));
    assert.equal(packageJson.scripts['tauri:build:workshop'], 'node scripts/build-application.mjs workshop');
    assert.equal(packageJson.scripts['tauri:build:restaurant'], 'node scripts/build-application.mjs restaurant');
});

test('all products retain the same LAN and API ports for one-at-a-time use', () => {
    const launcher = fs.readFileSync(path.join(repositoryRoot, 'backend', 'run_server.py'), 'utf8');
    for (const applicationId of ['retail', 'workshop', 'restaurant']) {
        assert.match(
            launcher,
            new RegExp(`['\"]${applicationId}['\"]:\\s*\\(4321,\\s*8000,\\s*['\"]pos\\.local['\"]\\)`),
        );
    }
});
