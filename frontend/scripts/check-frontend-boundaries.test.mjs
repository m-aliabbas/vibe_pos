import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { findBoundaryViolations } from './check-frontend-boundaries.mjs';

test('allows an application to import its own features and shared code', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'frontend-boundary-'));
    try {
        fs.mkdirSync(path.join(root, 'applications', 'retail'), { recursive: true });
        fs.mkdirSync(path.join(root, 'components'), { recursive: true });
        fs.writeFileSync(path.join(root, 'applications', 'retail', 'page.tsx'),
            "import { Panel } from '@/applications/retail/panel';\nimport { Button } from '@/components/ui/button';\n");
        assert.deepEqual(findBoundaryViolations(root), []);
    } finally {
        fs.rmSync(root, { recursive: true, force: true });
    }
});

test('blocks cross-application and shared-to-application imports', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'frontend-boundary-'));
    try {
        fs.mkdirSync(path.join(root, 'applications', 'retail'), { recursive: true });
        fs.mkdirSync(path.join(root, 'applications', 'workshop'), { recursive: true });
        fs.mkdirSync(path.join(root, 'components'), { recursive: true });
        fs.writeFileSync(path.join(root, 'applications', 'retail', 'page.tsx'),
            "import { JobCard } from '@/applications/workshop/job-card';\n");
        fs.writeFileSync(path.join(root, 'components', 'shared.tsx'),
            "export { WorkshopPage } from '../applications/workshop/page';\n");

        const violations = findBoundaryViolations(root);
        assert.equal(violations.length, 2);
        assert.match(violations[0].reason, /retail cannot import workshop/);
        assert.match(violations[1].reason, /shared frontend code cannot import workshop/);
    } finally {
        fs.rmSync(root, { recursive: true, force: true });
    }
});