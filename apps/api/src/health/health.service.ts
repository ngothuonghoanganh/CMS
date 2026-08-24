import { Injectable } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import type { Connection } from 'mongoose';

import type { HealthResponse } from '@payload/contracts';
import { MASTER_CONNECTION } from '../tenancy/master-connection';

@Injectable()
export class HealthService {
  constructor(
    @InjectConnection(MASTER_CONNECTION) private readonly connection: Connection,
  ) {}

  getLiveness(requestId?: string): HealthResponse {
    return {
      service: 'api',
      status: 'ok',
      ...(requestId ? { requestId } : {}),
      timestamp: new Date().toISOString(),
      version: 'v1',
    };
  }

  getReadiness(requestId?: string): HealthResponse {
    const isDatabaseReady = this.connection.readyState === 1;

    return {
      service: 'api',
      status: isDatabaseReady ? 'ok' : 'degraded',
      ...(requestId ? { requestId } : {}),
      timestamp: new Date().toISOString(),
      version: 'v1',
    };
  }
}
