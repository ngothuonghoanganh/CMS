import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { BUNDLED_PLAN_CATALOG_FILE } from '../../config/env.js';
import { loadPlanCatalog, planOf } from './plan-catalog.js';

const dir = mkdtempSync(join(tmpdir(), 'plp-plans-'));

function file(name: string, content: string): string {
  const path = join(dir, name);
  writeFileSync(path, content);
  return path;
}

afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('the plan catalog file (ADR-035)', () => {
  it('comes with the temporary numbers of ADR-035', () => {
    const catalog = loadPlanCatalog(BUNDLED_PLAN_CATALOG_FILE);
    expect(catalog.trial).toEqual({ planId: 'agency', days: 14 });
    expect(catalog.graceDays).toBe(7);
    expect(
      catalog.plans.map((plan) => [plan.id, plan.name, plan.prices, plan.limits, plan.features]),
    ).toEqual([
      [
        'basic',
        'Cơ bản',
        { monthly: 199_000, yearly: 1_990_000 },
        { sites: 1, members: 3, aiUses: 20, automationRuns: 0, customDomains: 1 },
        { automation: false, customRoles: false },
      ],
      [
        'agency',
        'Agency',
        { monthly: 599_000, yearly: 5_990_000 },
        { sites: 5, members: 10, aiUses: 100, automationRuns: 2000, customDomains: 10 },
        { automation: true, customRoles: false },
      ],
      [
        'business',
        'Doanh nghiệp',
        { monthly: 1_490_000, yearly: 14_900_000 },
        { sites: 20, members: 30, aiUses: 300, automationRuns: 10_000, customDomains: 40 },
        { automation: true, customRoles: true },
      ],
    ]);
    expect(planOf(catalog, 'business').name).toBe('Doanh nghiệp');
    expect(() => planOf(catalog, 'gold')).toThrow('Plan "gold" is not in the plan catalog');
  });

  it('stops the API on a file that is missing or not JSON', () => {
    expect(() => loadPlanCatalog(join(dir, 'missing.json'))).toThrow('cannot be read as JSON');
    expect(() => loadPlanCatalog(file('broken.json', '{ "plans": ['))).toThrow(
      'cannot be read as JSON',
    );
  });

  it('stops the API on a file that does not match, naming what is wrong', () => {
    const path = file(
      'wrong.json',
      JSON.stringify({ trial: { planId: 'gold', days: 14 }, graceDays: 7, plans: [] }),
    );
    expect(() => loadPlanCatalog(path)).toThrow(/Invalid plan catalog .*wrong\.json/);
    expect(() => loadPlanCatalog(path)).toThrow(/expiringSoonDays/);
  });
});
