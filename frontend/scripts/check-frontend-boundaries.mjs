import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const sourceExtensions = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs']);
const skippedDirectories = new Set(['.next', 'node_modules', 'out', 'build', 'src-tauri']);

function listSourceFiles(directory) {
    if (!fs.existsSync(directory)) return [];
    return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
        const entryPath = path.join(directory, entry.name);
        if (entry.isDirectory()) {
            return skippedDirectories.has(entry.name) ? [] : listSourceFiles(entryPath);
        }
        return sourceExtensions.has(path.extname(entry.name)) ? [entryPath] : [];
    });
}

function importedApplicationId(specifier, importerPath, frontendRoot) {
    const aliasMatch = specifier.match(/^@\/applications\/([^/]+)(?:\/|$)/);
    if (aliasMatch) return aliasMatch[1];

    if (!specifier.startsWith('.')) return null;
    const resolved = path.resolve(path.dirname(importerPath), specifier);
    const relative = path.relative(frontendRoot, resolved).split(path.sep);
    const applicationIndex = relative.indexOf('applications');
    return applicationIndex >= 0 ? relative[applicationIndex + 1] || null : null;
}

export function findBoundaryViolations(frontendRoot) {
    const absoluteRoot = path.resolve(frontendRoot);
    const sourceDirectories = ['app', 'applications', 'components', 'lib'];
    const files = sourceDirectories.flatMap((directory) =>
        listSourceFiles(path.join(absoluteRoot, directory))
    );
    const violations = [];
    const importPattern = /(?:\bfrom\s*|\bimport\s*\()\s*['"]([^'"]+)['"]/g;

    for (const filePath of files) {
        const relativePath = path.relative(absoluteRoot, filePath).split(path.sep);
        const applicationIndex = relativePath.indexOf('applications');
        const applicationModuleOwner = applicationIndex >= 0
            ? relativePath[applicationIndex + 1]
            : null;
        const routeOwner = relativePath[0] === 'app' &&
            ['workshop', 'restaurant'].includes(relativePath[1])
            ? relativePath[1]
            : null;
        const ownerApplication = applicationModuleOwner || routeOwner;
        const source = fs.readFileSync(filePath, 'utf8');

        for (const match of source.matchAll(importPattern)) {
            const targetApplication = importedApplicationId(match[1], filePath, absoluteRoot);
            if (!targetApplication) continue;

            if (!ownerApplication || targetApplication !== ownerApplication) {
                violations.push({
                    file: path.relative(absoluteRoot, filePath),
                    specifier: match[1],
                    reason: ownerApplication
                        ? `${ownerApplication} cannot import ${targetApplication}`
                        : `shared frontend code cannot import ${targetApplication}`,
                });
            }
        }
    }

    return violations;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    const frontendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
    const violations = findBoundaryViolations(frontendRoot);
    if (violations.length) {
        for (const violation of violations) {
            console.error(`${violation.file}: ${violation.specifier} (${violation.reason})`);
        }
        process.exitCode = 1;
    } else {
        console.log('Frontend application import boundaries passed.');
    }
}