export const TENANT_SUBSCRIPTION_PROVISIONER = Symbol('TENANT_SUBSCRIPTION_PROVISIONER');

/** Optional provisioning hook owned by the frozen billing composition. */
export interface TenantSubscriptionProvisioner {
  ensureDefaultForTenant(tenantId: string, planKey: string): Promise<unknown>;
}
