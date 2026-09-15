import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptPath = fileURLToPath(import.meta.url);
const root = path.resolve(path.dirname(scriptPath), '..');
const failures = [];

function relative(filePath) {
  return path.relative(root, filePath) || '.';
}

function read(relativePath) {
  const filePath = path.join(root, relativePath);
  if (!existsSync(filePath) || !statSync(filePath).isFile()) {
    failures.push(`Missing required file: ${relativePath}`);
    return null;
  }
  return readFileSync(filePath, 'utf8');
}

function requireText(source, filePath, expected, label = expected) {
  if (source !== null && !source.includes(expected)) {
    failures.push(`${filePath} is missing ${label}`);
  }
}

function collectFiles(directory) {
  if (!existsSync(directory)) return [];
  const files = [];
  const entries = readdirSync(directory, { withFileTypes: true }).sort((a, b) =>
    a.name < b.name ? -1 : a.name > b.name ? 1 : 0,
  );
  for (const entry of entries) {
    const filePath = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...collectFiles(filePath));
    else if (entry.isFile()) files.push(filePath);
  }
  return files;
}

const agents = read('AGENTS.md');
const architecture = read('docs/ARCHITECTURE.md');
const readme = read('README.md');
const pullRequestTemplate = read('.github/pull_request_template.md');
const packageJsonSource = read('package.json');
const ci = read('.github/workflows/ci.yml');

if (architecture !== null) {
  if (!/^CURRENT_PHASE\s*=\s*PHASE\s+\d+[A-Z]?\s*$/m.test(architecture)) {
    failures.push('docs/ARCHITECTURE.md must declare CURRENT_PHASE');
  }
  requireText(
    architecture,
    'docs/ARCHITECTURE.md',
    'This document is the canonical architecture',
  );
  requireText(architecture, 'docs/ARCHITECTURE.md', '## Architecture Decision Log');
  requireText(architecture, 'docs/ARCHITECTURE.md', '# 26. New Development Phases');
}

if (agents !== null) {
  requireText(agents, 'AGENTS.md', 'docs/ARCHITECTURE.md');
  requireText(agents, 'AGENTS.md', '1. Read `AGENTS.md`.');
  requireText(agents, 'AGENTS.md', '2. Read `docs/ARCHITECTURE.md`.');
  requireText(agents, 'AGENTS.md', 'CURRENT_PHASE');
  requireText(agents, 'AGENTS.md', 'docs/_archive/**');
}

if (readme !== null) {
  requireText(readme, 'README.md', 'docs/ARCHITECTURE.md');
  requireText(readme, 'README.md', 'AGENTS.md');
}

if (pullRequestTemplate !== null) {
  for (const item of [
    'Read `AGENTS.md`',
    'Read `docs/ARCHITECTURE.md`',
    'belongs to `CURRENT_PHASE`',
    'No frozen module expanded unintentionally',
    'No duplicate source of truth introduced',
    'Tests added/updated',
    'Lint/typecheck/test/build status reported',
  ]) {
    requireText(pullRequestTemplate, '.github/pull_request_template.md', item);
  }
}

const docsDirectory = path.join(root, 'docs');
const archiveDirectory = path.join(
  docsDirectory,
  '_archive',
  'pre-rebaseline-2026-09-15',
);
if (existsSync(docsDirectory)) {
  const entries = readdirSync(docsDirectory, { withFileTypes: true }).sort((a, b) =>
    a.name < b.name ? -1 : a.name > b.name ? 1 : 0,
  );
  for (const entry of entries) {
    if (entry.name !== 'ARCHITECTURE.md' && entry.name !== '_archive') {
      failures.push(`Unexpected active documentation entry: docs/${entry.name}`);
    }
  }
} else {
  failures.push('Missing docs directory');
}
if (!existsSync(archiveDirectory) || !statSync(archiveDirectory).isDirectory()) {
  failures.push('Missing historical archive: docs/_archive/pre-rebaseline-2026-09-15');
} else if (collectFiles(archiveDirectory).length === 0) {
  failures.push('Historical archive is empty');
}

if (packageJsonSource !== null) {
  try {
    const packageJson = JSON.parse(packageJsonSource);
    if (
      packageJson.scripts?.['check:governance'] !== 'node scripts/check-governance.mjs'
    ) {
      failures.push('package.json must expose check:governance');
    }
    if (!packageJson.scripts?.verify?.includes('pnpm check:governance')) {
      failures.push('package.json verify script must run check:governance');
    }
  } catch (error) {
    failures.push(`package.json is not valid JSON: ${error.message}`);
  }
}

requireText(ci, '.github/workflows/ci.yml', 'pnpm check:governance');

for (const directory of ['scripts', '.github']) {
  for (const filePath of collectFiles(path.join(root, directory))) {
    if (filePath === scriptPath) continue;
    const source = readFileSync(filePath, 'utf8');
    if (source.includes('docs/_archive')) {
      failures.push(`${relative(filePath)} must not reference archived documentation`);
    }
  }
}

if (failures.length > 0) {
  console.error('Repository governance check failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exitCode = 1;
} else {
  console.log('Repository governance check passed.');
}
