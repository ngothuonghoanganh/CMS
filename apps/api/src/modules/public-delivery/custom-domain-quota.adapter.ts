import { Inject, Injectable } from '@nestjs/common';

import { QuotaService } from '../../billing/quota.service';
import {
  CUSTOM_DOMAIN_QUOTA_PORT,
  type CustomDomainQuotaPort,
} from '../../shared/custom-domain-quota-port';

@Injectable()
export class CustomDomainQuotaAdapter implements CustomDomainQuotaPort {
  constructor(@Inject(QuotaService) private readonly quotas: QuotaService) {}

  withHardQuota<T>(operation: () => Promise<T>): Promise<T> {
    return this.quotas.withHardQuota('custom_domains', operation);
  }
}

export const CUSTOM_DOMAIN_QUOTA_PORT_PROVIDER = {
  provide: CUSTOM_DOMAIN_QUOTA_PORT,
  useExisting: CustomDomainQuotaAdapter,
} as const;
