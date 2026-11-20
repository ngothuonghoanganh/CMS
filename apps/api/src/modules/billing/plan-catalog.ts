import { readFileSync } from 'node:fs';
import { Inject } from '@nestjs/common';
import { findPlan, type Plan, type PlanCatalog, planCatalogSchema } from '@plp/contracts';
import { z } from 'zod';

export const PLAN_CATALOG = Symbol('PLAN_CATALOG');

/** Injects the plan catalog read at startup: `constructor(@InjectPlanCatalog() catalog)`. */
export const InjectPlanCatalog = (): ParameterDecorator => Inject(PLAN_CATALOG);

/**
 * Reads the plan catalog file (`PLAN_CATALOG_FILE`, ADR-035). It throws when the file cannot be
 * read or does not match `planCatalogSchema`, so the API does not start with prices or limits it
 * cannot trust.
 */
export function loadPlanCatalog(file: string): PlanCatalog {
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(file, 'utf8'));
  } catch (error) {
    throw new Error(`Invalid plan catalog ${file}: it cannot be read as JSON`, { cause: error });
  }
  const result = planCatalogSchema.safeParse(raw);
  if (!result.success) {
    throw new Error(`Invalid plan catalog ${file}:\n${z.prettifyError(result.error)}`);
  }
  return result.data;
}

/**
 * The plan a subscription names. Startup checks that every plan in use is in the catalog
 * (`SubscriptionBackfill`), so a missing one is a bug, not a user error.
 */
export function planOf(catalog: PlanCatalog, planId: string): Plan {
  const plan = findPlan(catalog, planId);
  if (!plan) {
    throw new Error(`Plan "${planId}" is not in the plan catalog (ADR-035)`);
  }
  return plan;
}
