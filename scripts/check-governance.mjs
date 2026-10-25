// Repository rules that dependency-cruiser cannot see. Run with `pnpm governance`.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';

const root = new URL('..', import.meta.url).pathname;
const problems = [];

for (const file of ['AGENTS.md', 'CLAUDE.md', 'README.md', 'docs/ARCHITECTURE.md']) {
  if (!existsSync(join(root, file))) {
    problems.push(`Missing required document: ${file}`);
  }
}

// JSX compiles to an import of react/jsx-runtime that no source line shows, so dependency-cruiser
// cannot see it: the framework-free schema entry (ADR-007) has no .tsx file at all.
const schemaDir = 'packages/sections/src/schema';
for (const file of readdirSync(join(root, schemaDir), { recursive: true })) {
  if (file.endsWith('.tsx')) {
    problems.push(`${schemaDir}/${file}: JSX belongs in packages/sections/src/react (ADR-007)`);
  }
}

// dependency-cruiser resolves the workspace packages through these paths: an export into dist/
// without one, or with one to another file, would vanish from the graph, and no boundary rule
// would see its imports. Without the option that points at the file, all of them would.
const GOVERNANCE_TSCONFIG = 'tsconfig.governance.json';
const cruiseOptions = createRequire(import.meta.url)('../.dependency-cruiser.cjs').options;
if (cruiseOptions?.tsConfig?.fileName !== GOVERNANCE_TSCONFIG) {
  problems.push(`.dependency-cruiser.cjs: options.tsConfig must name ${GOVERNANCE_TSCONFIG}`);
}
const governancePaths = JSON.parse(readFileSync(join(root, GOVERNANCE_TSCONFIG), 'utf8'))
  .compilerOptions.paths;

/** `exports` as a map of subpaths: a string or a set of conditions is the package's "." export. */
function exportMap(exports) {
  if (exports === undefined || exports === null) {
    return {};
  }
  if (typeof exports === 'string' || !Object.keys(exports).some((key) => key.startsWith('.'))) {
    return { '.': exports };
  }
  return exports;
}

/** The file an export loads at run time, through nested conditions. */
function runtimeFile(target) {
  if (typeof target === 'string') {
    return target;
  }
  for (const condition of ['import', 'default', 'require', 'node']) {
    if (target !== null && typeof target === 'object' && condition in target) {
      return runtimeFile(target[condition]);
    }
  }
  return undefined;
}

/** The source a dist/ file is built from, as a path from the repository root. */
function sourceOf(packageDir, distFile) {
  const stem = `./${packageDir}/src/${distFile.slice('./dist/'.length)}`;
  if (!stem.endsWith('.js')) {
    return stem;
  }
  const typescript = stem.replace(/\.js$/, '.ts');
  return existsSync(join(root, `${typescript}x`)) ? `${typescript}x` : typescript;
}

/** Every package.json of the workspace, from the globs in pnpm-workspace.yaml. */
function workspaceManifests() {
  const workspace = readFileSync(join(root, 'pnpm-workspace.yaml'), 'utf8');
  const globs = (workspace.match(/^packages:\n((?:[ \t]+- .+\n?)+)/m)?.[1] ?? '')
    .split('\n')
    .map((line) =>
      line
        .replace(/^\s*-\s*/, '')
        .replace(/['"]/g, '')
        .trim(),
    )
    .filter(Boolean);
  const dirs = globs.flatMap((glob) =>
    glob.endsWith('/*')
      ? readdirSync(join(root, glob.slice(0, -2)), { withFileTypes: true })
          .filter((entry) => entry.isDirectory())
          .map((entry) => `${glob.slice(0, -2)}/${entry.name}`)
      : [glob],
  );
  return ['package.json', ...dirs.map((dir) => `${dir}/package.json`)];
}

const bannedDependencies = [/^grapesjs/, /^antd$/, /^@ant-design\//];

for (const manifestPath of workspaceManifests()) {
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
  const packageDir = manifestPath.replace(/\/?package\.json$/, '');
  for (const [subpath, target] of Object.entries(exportMap(manifest.exports))) {
    const file = runtimeFile(target);
    if (file === undefined || !file.startsWith('./dist/')) {
      continue;
    }
    const specifier = subpath === '.' ? manifest.name : `${manifest.name}${subpath.slice(1)}`;
    const expected = sourceOf(packageDir, file);
    const [source] = governancePaths[specifier] ?? [];
    if (source !== expected || !existsSync(join(root, expected))) {
      problems.push(`${GOVERNANCE_TSCONFIG}: "${specifier}" needs the path ${expected}`);
    }
  }
}

if (problems.length > 0) {
  console.error(`Governance check failed:\n- ${problems.join('\n- ')}`);
  process.exit(1);
}
console.log('Governance check passed.');
