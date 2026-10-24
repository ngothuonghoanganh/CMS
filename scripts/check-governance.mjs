// Repository rules that dependency-cruiser cannot see. Run with `pnpm governance`.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = new URL('..', import.meta.url).pathname;
const problems = [];

for (const file of ['AGENTS.md', 'CLAUDE.md', 'README.md', 'docs/ARCHITECTURE.md']) {
  if (!existsSync(join(root, file))) {
    problems.push(`Missing required document: ${file}`);
  }
}

const bannedDependencies = [/^grapesjs/, /^antd$/, /^@ant-design\//];
const workspacePackages = [
  'package.json',
  'apps/admin/package.json',
  'apps/api/package.json',
  'apps/renderer/package.json',
  'packages/config/package.json',
  'packages/contracts/package.json',
  'packages/ui/package.json',
  'packages/sections/package.json',
  'tests/e2e/package.json',
];

for (const manifestPath of workspacePackages) {
  const fullPath = join(root, manifestPath);
  if (!existsSync(fullPath)) {
    continue;
  }
  const manifest = JSON.parse(readFileSync(fullPath, 'utf8'));
  const dependencies = { ...manifest.dependencies, ...manifest.devDependencies };
  for (const name of Object.keys(dependencies)) {
    if (bannedDependencies.some((pattern) => pattern.test(name))) {
      problems.push(`${manifestPath}: banned dependency "${name}" (ADR-001/ADR-002)`);
    }
    if (name === '@plp/ui' && !manifestPath.startsWith('apps/admin/')) {
      problems.push(`${manifestPath}: @plp/ui is admin-only and may not be a dependency here`);
    }
  }
}

if (problems.length > 0) {
  console.error(`Governance check failed:\n- ${problems.join('\n- ')}`);
  process.exit(1);
}
console.log('Governance check passed.');
