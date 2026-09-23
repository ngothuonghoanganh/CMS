import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptPath = fileURLToPath(import.meta.url);
const root = path.resolve(path.dirname(scriptPath), '..');

// These are the core service files that Phase 1A is actively protecting. The
// DomainModule remains a composition root until the graph is split gradually.
const coreFiles = [
  'apps/api/src/domain/workspace.service.ts',
  'apps/api/src/domain/site.service.ts',
  'apps/api/src/domain/page.service.ts',
  'apps/api/src/domain/submission.service.ts',
  'apps/api/src/domain/asset.service.ts',
  'apps/api/src/domain/public-page.resolver.ts',
];

// Every entry is an exact file plus dependency classification. This debt must
// shrink as Phase 1 progresses; it is not a wildcard exemption for the domain.
const knownDebt = {
  'apps/api/src/domain/workspace.service.ts': [],
  'apps/api/src/domain/site.service.ts': ['navigation', 'reusables'],
  'apps/api/src/domain/page.service.ts': [
    'billing',
    'extensions',
    'workflows',
    'navigation',
    'layouts',
    'reusables',
    'collections',
  ],
  'apps/api/src/domain/submission.service.ts': [
    'billing',
    'integrations',
    'analytics',
    'extensions',
  ],
  'apps/api/src/domain/asset.service.ts': [
    'collections',
    'templates',
    'reusables',
    'layouts',
  ],
  'apps/api/src/domain/public-page.resolver.ts': [
    'navigation',
    'layouts',
    'reusables',
    'extensions',
    'collections',
  ],
};

const frozenDependencyRules = [
  { dependency: 'billing', matches: (source) => source.includes('/billing/') },
  {
    dependency: 'extensions',
    matches: (source) => source.includes('/extensions/'),
  },
  { dependency: 'workflows', matches: (source) => source.includes('/workflows/') },
  {
    dependency: 'analytics',
    matches: (source) => /(?:^|\/)analytics\.service$/.test(source),
  },
  {
    dependency: 'integrations',
    matches: (source) =>
      /(?:^|\/)(?:integration-dispatcher|integration\.service|integration\.schema)$/.test(
        source,
      ) || source.includes('/integrations/'),
  },
  {
    dependency: 'collections',
    matches: (source) =>
      /(?:^|\/)(?:collection\.service|collection\.schema)$/.test(source),
  },
  {
    dependency: 'reusables',
    matches: (source) => /(?:^|\/)(?:reusable\.service|reusable\.schema)$/.test(source),
  },
  {
    dependency: 'templates',
    matches: (source) =>
      /(?:^|\/)(?:template\.service|template\.schema|template-version\.schema)$/.test(
        source,
      ),
  },
  {
    dependency: 'navigation',
    matches: (source) =>
      /(?:^|\/)(?:navigation\.service|navigation\.schema)$/.test(source),
  },
  {
    dependency: 'layouts',
    matches: (source) => source.includes('/layout-extension'),
  },
  {
    dependency: 'organizations',
    matches: (source) => /(?:^|\/)organization\.service$/.test(source),
  },
];

function extractImports(source) {
  const imports = [];
  const fromPattern = /^\s*import\s+(?:type\s+)?[\s\S]*?\sfrom\s+['"]([^'"]+)['"]\s*;?/gm;
  for (const match of source.matchAll(fromPattern)) {
    imports.push({ source: match[1], index: match.index ?? 0 });
  }
  const sideEffectPattern = /^\s*import\s+['"]([^'"]+)['"]\s*;?/gm;
  for (const match of source.matchAll(sideEffectPattern)) {
    imports.push({ source: match[1], index: match.index ?? 0 });
  }
  return imports;
}

function dependencyForImport(source) {
  return frozenDependencyRules.find((rule) => rule.matches(source))?.dependency;
}

function lineNumber(source, index) {
  return source.slice(0, index).split('\n').length;
}

function inspectSource(relativePath, source) {
  const allowed = new Set(knownDebt[relativePath] ?? []);
  return extractImports(source).flatMap(({ source: importSource, index }) => {
    const dependency = dependencyForImport(importSource);
    if (!dependency || allowed.has(dependency)) return [];
    return [
      `${relativePath}:${lineNumber(source, index)} imports frozen ${dependency} dependency (${importSource})`,
    ];
  });
}

function runSelfTest() {
  const violations = inspectSource(
    'apps/api/src/domain/workspace.service.ts',
    "import { QuotaService } from '../billing/quota.service';\n",
  );
  if (violations.length !== 1 || !violations[0].includes('billing')) {
    throw new Error(
      'Core boundary checker self-test did not detect a new billing import',
    );
  }
}

runSelfTest();

const failures = [];
for (const relativePath of coreFiles) {
  const filePath = path.join(root, relativePath);
  if (!existsSync(filePath)) {
    failures.push(`Missing protected core file: ${relativePath}`);
    continue;
  }
  failures.push(...inspectSource(relativePath, readFileSync(filePath, 'utf8')));
}

if (failures.length > 0) {
  console.error('Core boundary check failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exitCode = 1;
} else {
  const debtEntries = Object.values(knownDebt).reduce(
    (count, dependencies) => count + dependencies.length,
    0,
  );
  console.log(
    `Core boundary check passed (${coreFiles.length} files checked; ${debtEntries} explicit debt entries).`,
  );
}
