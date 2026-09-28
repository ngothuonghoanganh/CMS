export const CUSTOM_DOMAIN_QUOTA_PORT = Symbol('CUSTOM_DOMAIN_QUOTA_PORT');
export const CUSTOM_DOMAIN_QUOTA_IMPLEMENTATION = Symbol(
  'CUSTOM_DOMAIN_QUOTA_IMPLEMENTATION',
);

/** Quota capability required by custom-domain creation. */
export interface CustomDomainQuotaPort {
  withHardQuota<T>(operation: () => Promise<T>): Promise<T>;
}
