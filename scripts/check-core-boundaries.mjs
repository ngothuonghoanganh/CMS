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

// Every entry is an exact file plus exact import specifier. This debt must
// shrink as Phase 1 progresses; it is not a category or wildcard exemption.
const knownDebt = {
  'apps/api/src/domain/workspace.service.ts': [],
  'apps/api/src/domain/site.service.ts': [
    '../persistence/schemas/navigation.schema',
    './reusable.service',
  ],
  'apps/api/src/domain/page.service.ts': [
    '../extensions/page-extension.service',
    './navigation.service',
    './layout-extension.service',
    './reusable.service',
    './collection.service',
  ],
  'apps/api/src/domain/submission.service.ts': [
    '../billing/usage.service',
    './integration-dispatcher',
    './analytics.service',
    '../extensions/event-bus',
  ],
  'apps/api/src/domain/asset.service.ts': [
    '../persistence/schemas/collection.schema',
    '../persistence/schemas/template.schema',
    '../persistence/schemas/reusable.schema',
    '../persistence/schemas/layout-extension.schema',
  ],
  'apps/api/src/domain/public-page.resolver.ts': [
    './navigation.service',
    './layout-extension.service',
    '../extensions/page-extension.service',
    './reusable.service',
    './collection.service',
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

function inspectSource(relativePath, source, debt = knownDebt) {
  const allowed = new Set(debt[relativePath] ?? []);
  return extractImports(source).flatMap(({ source: importSource, index }) => {
    const dependency = dependencyForImport(importSource);
    if (!dependency || allowed.has(importSource)) return [];
    return [
      `${relativePath}:${lineNumber(source, index)} imports frozen ${dependency} dependency (${importSource})`,
    ];
  });
}

function staleDebtEntries(relativePath, source, debt = knownDebt) {
  const actualImports = new Set(
    extractImports(source).map(({ source: importSource }) => importSource),
  );
  return (debt[relativePath] ?? []).filter(
    (importSource) =>
      !actualImports.has(importSource) || !dependencyForImport(importSource),
  );
}

function runSelfTest() {
  const existingDebt =
    "import { PageExtensionService } from '../extensions/page-extension.service';\n";
  const existingDebtViolations = inspectSource(
    'apps/api/src/domain/page.service.ts',
    existingDebt,
  );
  if (existingDebtViolations.length !== 0) {
    throw new Error('Core boundary checker did not allow an existing exact debt import');
  }

  const billingViolations = inspectSource(
    'apps/api/src/domain/workspace.service.ts',
    "import { QuotaService } from '../billing/quota.service';\n",
  );
  if (billingViolations.length !== 1 || !billingViolations[0].includes('billing')) {
    throw new Error(
      'Core boundary checker self-test did not detect a new billing import',
    );
  }

  const extensionViolations = inspectSource(
    'apps/api/src/domain/page.service.ts',
    "import { ExtensionRegistry } from '../extensions/extension-registry';\n",
  );
  if (
    extensionViolations.length !== 1 ||
    !extensionViolations[0].includes('extension-registry')
  ) {
    throw new Error(
      'Core boundary checker self-test did not detect a new extension import',
    );
  }

  const stale = staleDebtEntries('fixture.ts', existingDebt, {
    'fixture.ts': ['../extensions/page-extension.service', '../extensions/removed'],
  });
  if (stale.length !== 1 || stale[0] !== '../extensions/removed') {
    throw new Error('Core boundary checker self-test did not detect stale debt');
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
  const source = readFileSync(filePath, 'utf8');
  for (const stale of staleDebtEntries(relativePath, source)) {
    failures.push(
      `${relativePath} has stale exact debt entry (${stale}); remove it from knownDebt`,
    );
  }
  failures.push(...inspectSource(relativePath, source));
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
