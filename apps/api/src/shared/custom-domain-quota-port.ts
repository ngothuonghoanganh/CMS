export const CUSTOM_DOMAIN_QUOTA_PORT = Symbol('CUSTOM_DOMAIN_QUOTA_PORT');

/** Quota capability required by custom-domain creation. */
export interface CustomDomainQuotaPort {
  withHardQuota<T>(operation: () => Promise<T>): Promise<T>;
}
