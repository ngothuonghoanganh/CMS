import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve('apps/cms');
const rawColorPattern = /#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(/gi;
const legacyPalettePattern =
  /#(?:131c32|273453|8cf0c5|1b2742|3a4b70|11233a|10172a|182842|0d1426|0b1020)\b/i;
const allowedRawColorFiles = [
  'app/ui/tokens.css',
  'app/ui/field-utils.ts',
  'app/ui/fields.tsx',
  'app/design-system/design-system-view.tsx',
  'app/extensions/extensions-view.tsx',
  'builder/grapes-editor.tsx',
  'builder/block-presets.ts',
  'builder/builder-preview-model.ts',
];

async function collectFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (['.next', 'coverage', 'node_modules'].includes(entry.name)) continue;
    const filePath = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await collectFiles(filePath)));
    else if (/\.(css|ts|tsx)$/.test(entry.name) && !entry.name.includes('.spec.')) {
      files.push(filePath);
    }
  }
  return files;
}

function isAllowed(relativePath) {
  return allowedRawColorFiles.includes(relativePath);
}

const violations = [];
for (const filePath of await collectFiles(root)) {
  const relativePath = path.relative(root, filePath);
  const source = await readFile(filePath, 'utf8');
  if (!isAllowed(relativePath) && legacyPalettePattern.test(source)) {
    violations.push(`${relativePath}: legacy admin palette value`);
  }
  if (isAllowed(relativePath)) continue;
  const match = rawColorPattern.exec(source);
  rawColorPattern.lastIndex = 0;
  if (match) {
    const line = source.slice(0, match.index).split('\n').length;
    violations.push(`${relativePath}:${line}: raw color outside token/data allowlist`);
  }
}

if (violations.length > 0) {
  console.error('CMS Admin Design System guardrail failed:');
  for (const violation of violations) console.error(`- ${violation}`);
  process.exitCode = 1;
} else {
  console.log('CMS Admin Design System guardrail passed.');
}
