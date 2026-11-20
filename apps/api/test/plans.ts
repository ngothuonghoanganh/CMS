import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { PlanCatalog, PlanFeatures, PlanLimits } from '@plp/contracts';
import { BUNDLED_PLAN_CATALOG_FILE } from '../src/config/env.js';

/** What a test changes in one plan of the bundled catalog. */
export interface PlanOverride {
  limits?: Partial<PlanLimits>;
  features?: Partial<PlanFeatures>;
}

/**
 * Writes the bundled plan catalog with some plans changed and returns its path, for
 * `createTestApp(..., { env: { PLAN_CATALOG_FILE } })`. The catalog is read once at startup, so a
 * test of a limit gives the app a catalog whose limit it can reach (ADR-035).
 */
export function planCatalogFile(overrides: Record<string, PlanOverride>): string {
  const catalog = JSON.parse(readFileSync(BUNDLED_PLAN_CATALOG_FILE, 'utf8')) as PlanCatalog;
  const plans = catalog.plans.map((plan) => {
    const override = overrides[plan.id];
    return override === undefined
      ? plan
      : {
          ...plan,
          limits: { ...plan.limits, ...override.limits },
          features: { ...plan.features, ...override.features },
        };
  });
  const file = join(mkdtempSync(join(tmpdir(), 'plp-plans-')), 'plans.json');
  writeFileSync(file, JSON.stringify({ ...catalog, plans }, null, 2));
  return file;
}

let hardCapFile: string | undefined;

/**
 * The catalog every integration test app reads unless it names its own (test/env.ts): its trial
 * plan allows what the hard caps of ADR-014 and ADR-022 allow, with custom roles, so that a test
 * that is not about plans never meets a plan limit. Tests of a plan's numbers pass
 * `BUNDLED_PLAN_CATALOG_FILE` or `planCatalogFile(...)` as `PLAN_CATALOG_FILE`.
 */
export function hardCapPlanCatalogFile(): string {
  hardCapFile ??= planCatalogFile({
    agency: {
      limits: { sites: 100, members: 100, customDomains: 500 },
      features: { customRoles: true },
    },
  });
  return hardCapFile;
}
