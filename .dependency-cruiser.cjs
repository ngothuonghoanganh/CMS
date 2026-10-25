/**
 * Module boundaries from docs/ARCHITECTURE.md (§3.3, ADR-003, ADR-013).
 * Run with `pnpm governance`.
 * @type {import('dependency-cruiser').IConfiguration}
 */
module.exports = {
  forbidden: [
    {
      name: 'no-unresolvable',
      comment: 'Every import must resolve; otherwise the other rules cannot see the dependency.',
      severity: 'error',
      from: {},
      to: { couldNotResolve: true },
    },
    {
      name: 'no-circular',
      severity: 'error',
      from: {},
      to: { circular: true },
    },
    {
      name: 'apps-are-independent',
      comment: 'An app never imports another app; shared code lives in packages/.',
      severity: 'error',
      from: { path: '^apps/([^/]+)/' },
      to: { path: '^apps/', pathNot: '^apps/$1/' },
    },
    {
      name: 'packages-do-not-import-apps',
      severity: 'error',
      from: { path: '^packages/' },
      to: { path: '^apps/' },
    },
    {
      name: 'admin-ui-stays-in-admin',
      comment: 'Admin tokens and components never reach the renderer or customer sections.',
      severity: 'error',
      from: { path: '^(apps/renderer|apps/api|packages/sections|packages/contracts)/' },
      to: { path: '^packages/ui/' },
    },
    {
      name: 'section-schemas-have-no-react',
      comment:
        'The API validates content with @plp/sections/schema, which must stay framework-free.',
      severity: 'error',
      from: { path: '^packages/sections/src/schema/' },
      to: { path: 'node_modules/(react|react-dom|next)/' },
    },
    {
      name: 'api-has-no-react',
      severity: 'error',
      from: { path: '^apps/api/' },
      to: { path: ['node_modules/(react|react-dom|next)/', '^packages/sections/src/react/'] },
    },
    {
      name: 'no-free-form-builders-or-antd',
      comment: 'ADR-001/ADR-002: no GrapesJS, no Ant Design.',
      severity: 'error',
      from: {},
      to: { path: 'node_modules/(grapesjs|antd|@ant-design/)' },
    },
    {
      name: 'mongoose-only-in-persistence',
      comment: 'ADR-003: data access goes through repositories that apply the workspace scope.',
      severity: 'error',
      from: {
        path: '^apps/api/src/',
        pathNot: [
          '\\.repository\\.ts$',
          '\\.schema\\.ts$',
          '\\.module\\.ts$',
          '\\.int\\.spec\\.ts$',
          '^apps/api/src/health/',
          '^apps/api/src/shared/persistence/',
        ],
      },
      to: { path: 'node_modules/(mongoose|@nestjs/mongoose)/' },
    },
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    exclude: { path: ['(^|/)(dist|\\.next|coverage)/', 'next-env\\.d\\.ts$'] },
    tsPreCompilationDeps: true,
    enhancedResolveOptions: {
      exportsFields: ['exports'],
      conditionNames: ['import', 'require', 'node', 'default', 'types'],
      extensions: ['.ts', '.tsx', '.js', '.mjs', '.cjs', '.json', '.css'],
    },
  },
};
