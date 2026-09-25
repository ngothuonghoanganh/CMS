import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as ts from 'typescript';

const scriptPath = fileURLToPath(import.meta.url);
const root = path.resolve(path.dirname(scriptPath), '..');

// These are the core service files that Phase 1A is actively protecting. The
// DomainModule remains a composition root until the graph is split gradually.
const coreServiceFiles = [
  'apps/api/src/domain/workspace.service.ts',
  'apps/api/src/domain/site.service.ts',
  'apps/api/src/domain/page.service.ts',
  'apps/api/src/domain/submission.service.ts',
  'apps/api/src/domain/asset.service.ts',
  'apps/api/src/domain/public-page.resolver.ts',
];

// Core-owned infrastructure is protected separately from the service debt
// list. It must remain usable when optional platform modules are not loaded.
const coreInfrastructureFiles = [
  'apps/api/src/shared/events/core-event-publisher.ts',
  'apps/api/src/shared/events/core-event-bus.ts',
  'apps/api/src/shared/events/core-events.module.ts',
  'apps/api/src/shared/page-publish-compatibility.ts',
  'apps/api/src/shared/page-extension-port.ts',
];

const protectedCoreFiles = [...coreServiceFiles, ...coreInfrastructureFiles];

// Every entry is an exact file plus exact import specifier. This debt must
// shrink as Phase 1 progresses; it is not a category or wildcard exemption.
const knownDebt = {
  'apps/api/src/domain/workspace.service.ts': [],
  'apps/api/src/domain/site.service.ts': [
    '../persistence/schemas/navigation.schema',
    './reusable.service',
  ],
  'apps/api/src/domain/page.service.ts': [
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
    './reusable.service',
    './collection.service',
  ],
};

const frozenDependencyRules = [
  { dependency: 'billing', matches: (source) => hasPathSegment(source, 'billing') },
  {
    dependency: 'extensions',
    matches: (source) => hasPathSegment(source, 'extensions'),
  },
  {
    dependency: 'workflows',
    matches: (source) => hasPathSegment(source, 'workflows'),
  },
  {
    dependency: 'analytics',
    matches: (source) =>
      /(?:^|\/)analytics\.service$/.test(normalizeImportSource(source)) ||
      hasPathSegment(source, 'analytics'),
  },
  {
    dependency: 'integrations',
    matches: (source) =>
      /(?:^|\/)(?:integration-dispatcher|integration\.service|integration\.schema)$/.test(
        normalizeImportSource(source),
      ) || hasPathSegment(source, 'integrations'),
  },
  {
    dependency: 'collections',
    matches: (source) =>
      /(?:^|\/)(?:collection\.service|collection\.schema)$/.test(
        normalizeImportSource(source),
      ) || hasPathSegment(source, 'collections'),
  },
  {
    dependency: 'reusables',
    matches: (source) =>
      /(?:^|\/)(?:reusable\.service|reusable\.schema)$/.test(
        normalizeImportSource(source),
      ) || hasPathSegment(source, 'reusables'),
  },
  {
    dependency: 'templates',
    matches: (source) =>
      /(?:^|\/)(?:template\.service|template\.schema|template-version\.schema)$/.test(
        normalizeImportSource(source),
      ) || hasPathSegment(source, 'templates'),
  },
  {
    dependency: 'navigation',
    matches: (source) =>
      /(?:^|\/)(?:navigation\.service|navigation\.schema)$/.test(
        normalizeImportSource(source),
      ) || hasPathSegment(source, 'navigation'),
  },
  {
    dependency: 'layouts',
    matches: (source) =>
      /(?:^|\/)layout-extension(?:\.|\/|$)/.test(normalizeImportSource(source)) ||
      hasPathSegment(source, 'layouts'),
  },
  {
    dependency: 'organizations',
    matches: (source) =>
      /(?:^|\/)organization\.service$/.test(normalizeImportSource(source)) ||
      hasPathSegment(source, 'organizations'),
  },
];

function normalizeImportSource(source) {
  return source.startsWith('.')
    ? path.posix.normalize(source.replaceAll('\\', '/'))
    : source;
}

function hasPathSegment(source, segment) {
  return normalizeImportSource(source).split('/').includes(segment);
}

function stringLiteralText(node) {
  return node && ts.isStringLiteralLike(node) ? node.text : undefined;
}

function scriptKindForPath(filePath) {
  if (filePath.endsWith('.tsx')) return ts.ScriptKind.TSX;
  if (filePath.endsWith('.jsx')) return ts.ScriptKind.JSX;
  if (filePath.endsWith('.js')) return ts.ScriptKind.JS;
  return ts.ScriptKind.TS;
}

/**
 * Parse module edges with TypeScript instead of matching source text. This
 * covers multiline imports, type imports, re-exports, import(), import types
 * and CommonJS require() calls without treating comments or string literals as
 * dependencies.
 */
function extractImports(source, filePath = 'fixture.ts') {
  const sourceFile = ts.createSourceFile(
    filePath,
    source,
    ts.ScriptTarget.Latest,
    true,
    scriptKindForPath(filePath),
  );
  const imports = [];
  const add = (node, moduleSource) => {
    if (!moduleSource) return;
    imports.push({ source: moduleSource, index: node.getStart(sourceFile) });
  };

  function visit(node) {
    if (ts.isImportDeclaration(node)) {
      add(node, stringLiteralText(node.moduleSpecifier));
    } else if (ts.isExportDeclaration(node)) {
      add(node, stringLiteralText(node.moduleSpecifier));
    } else if (ts.isImportEqualsDeclaration(node)) {
      const reference = node.moduleReference;
      if (ts.isExternalModuleReference(reference)) {
        add(node, stringLiteralText(reference.expression));
      }
    } else if (ts.isImportTypeNode(node)) {
      const argument = node.argument;
      if (ts.isLiteralTypeNode(argument)) {
        add(node, stringLiteralText(argument.literal));
      }
    } else if (ts.isCallExpression(node)) {
      const firstArgument = node.arguments[0];
      if (
        node.expression.kind === ts.SyntaxKind.ImportKeyword ||
        (ts.isIdentifier(node.expression) && node.expression.text === 'require')
      ) {
        add(node, stringLiteralText(firstArgument));
      }
    }
    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return imports.sort((left, right) => left.index - right.index);
}

function dependencyForImport(source) {
  return frozenDependencyRules.find((rule) => rule.matches(source))?.dependency;
}

function lineNumber(source, index) {
  return source.slice(0, index).split('\n').length;
}

function inspectSource(relativePath, source, debt = knownDebt) {
  const allowed = new Set(debt[relativePath] ?? []);
  return extractImports(source, relativePath).flatMap(
    ({ source: importSource, index }) => {
      const dependency = dependencyForImport(importSource);
      if (!dependency || allowed.has(importSource)) return [];
      return [
        `${relativePath}:${lineNumber(source, index)} imports frozen ${dependency} dependency (${importSource})`,
      ];
    },
  );
}

function staleDebtEntries(relativePath, source, debt = knownDebt) {
  const actualImports = new Set(
    extractImports(source, relativePath).map(({ source: importSource }) => importSource),
  );
  return (debt[relativePath] ?? []).filter(
    (importSource) =>
      !actualImports.has(importSource) || !dependencyForImport(importSource),
  );
}

function runSelfTest() {
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

  const directPageExtensionViolation = inspectSource(
    'apps/api/src/domain/page.service.ts',
    "import { PageExtensionService } from '../extensions/page-extension.service';\n",
  );
  if (
    directPageExtensionViolation.length !== 1 ||
    !directPageExtensionViolation[0].includes('page-extension.service')
  ) {
    throw new Error(
      'Core boundary checker self-test did not detect a direct PageExtensionService import',
    );
  }

  const syntaxCases = [
    {
      source: "export { EventBus } from '../extensions/event-bus';\n",
      dependency: 'extensions',
    },
    {
      source: "export * from '../billing/usage.service';\n",
      dependency: 'billing',
    },
    {
      source: "const load = () => import('../workflows/workflow.service');\n",
      dependency: 'workflows',
    },
    {
      source:
        "type Registry = import('../extensions/extension-registry').ExtensionRegistry;\n",
      dependency: 'extensions',
    },
    {
      source: "const load = () => require('../billing/quota.service');\n",
      dependency: 'billing',
    },
  ];
  for (const { source, dependency } of syntaxCases) {
    const violations = inspectSource('apps/api/src/domain/workspace.service.ts', source);
    if (violations.length !== 1 || !violations[0].includes(`frozen ${dependency}`)) {
      throw new Error(
        `Core boundary checker self-test did not detect ${dependency} syntax edge`,
      );
    }
  }

  const normalizedExtensionViolation = inspectSource(
    'apps/api/src/domain/workspace.service.ts',
    "import { ExtensionRegistry } from '../extensions/./extension-registry';\n",
  );
  if (
    normalizedExtensionViolation.length !== 1 ||
    !normalizedExtensionViolation[0].includes('extension-registry')
  ) {
    throw new Error(
      'Core boundary checker self-test did not detect a normalized extension import',
    );
  }

  const existingDebt =
    "import { PageExtensionService } from '../extensions/page-extension.service';\n";
  const stale = staleDebtEntries('fixture.ts', existingDebt, {
    'fixture.ts': ['../extensions/page-extension.service', '../extensions/removed'],
  });
  if (stale.length !== 1 || stale[0] !== '../extensions/removed') {
    throw new Error('Core boundary checker self-test did not detect stale debt');
  }
}

runSelfTest();

const failures = [];
const protectedCoreFileSet = new Set(protectedCoreFiles);
for (const relativePath of Object.keys(knownDebt)) {
  if (!protectedCoreFileSet.has(relativePath)) {
    failures.push(`Known debt targets an unprotected core file: ${relativePath}`);
  }
}
for (const relativePath of protectedCoreFiles) {
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
    `Core boundary check passed (${protectedCoreFiles.length} files checked; ${debtEntries} explicit debt entries).`,
  );
}
