import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { healthResponseSchema, type HealthResponse } from '@plp/contracts';
import type { Connection } from 'mongoose';

@Controller('health')
export class HealthController {
  constructor(@InjectConnection() private readonly connection: Connection) {}

  @Get()
  async check(): Promise<HealthResponse> {
    const db = this.connection.db;
    if (!db) {
      throw new ServiceUnavailableException('Database connection is not ready');
    }
    try {
      await db.admin().ping();
    } catch (error) {
      throw new ServiceUnavailableException('Database ping failed', { cause: error });
    }
    return healthResponseSchema.parse({ status: 'ok', mongo: 'up' });
  }
}
