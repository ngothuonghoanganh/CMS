import { describe, expect, it } from 'vitest';

import { HealthService } from './health.service';

describe('HealthService', () => {
  it('reports liveness without depending on database readiness', () => {
    const service = new HealthService({ readyState: 0 } as never);

    expect(service.getLiveness('request-123')).toMatchObject({
      requestId: 'request-123',
      service: 'api',
      status: 'ok',
      version: 'v1',
    });
  });

  it('reports database readiness from the Mongoose connection state', () => {
    const service = new HealthService({ readyState: 1 } as never);

    expect(service.getReadiness()).toMatchObject({ service: 'api', status: 'ok' });
  });

  it('reports degraded readiness when MongoDB is not connected', () => {
    const service = new HealthService({ readyState: 0 } as never);

    expect(service.getReadiness()).toMatchObject({ service: 'api', status: 'degraded' });
  });
});
