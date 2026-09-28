import { describe, expect, it, vi } from 'vitest';

import type { EventBus } from '../../extensions/event-bus';
import type { QuotaService } from '../../billing/quota.service';
import { CustomDomainEventAdapter } from './custom-domain-event.adapter';
import { CustomDomainQuotaAdapter } from './custom-domain-quota.adapter';

describe('custom-domain optional platform adapters', () => {
  it('maps domain quota operations to the custom_domains metric', async () => {
    const withHardQuota = vi.fn().mockImplementation((_metric, operation) => operation());
    const adapter = new CustomDomainQuotaAdapter({ withHardQuota } as QuotaService);
    const operation = vi.fn().mockResolvedValue('created');

    await expect(adapter.withHardQuota(operation)).resolves.toBe('created');
    expect(withHardQuota).toHaveBeenCalledWith('custom_domains', operation);
  });

  it('publishes verification through the platform event bus', async () => {
    const publish = vi.fn().mockResolvedValue(undefined);
    const adapter = new CustomDomainEventAdapter({ publish } as EventBus);
    const event = {
      tenantId: 'tenant-a',
      domainId: 'domain-1',
      workspaceId: 'workspace-1',
      occurredAt: '2026-09-28T00:00:00.000Z',
    };

    await adapter.publishDomainVerified(event);
    expect(publish).toHaveBeenCalledWith('domain.verified', event);
  });
});
