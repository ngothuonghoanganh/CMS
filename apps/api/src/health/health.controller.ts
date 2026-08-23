import {
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  ServiceUnavailableException,
} from '@nestjs/common';

import type { HealthResponse } from '@payload/contracts';

// NestJS emitDecoratorMetadata needs the runtime class token for constructor injection.
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { HealthService } from './health.service';

@Controller('health')
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Get('live')
  @HttpCode(HttpStatus.OK)
  live(@Headers('x-request-id') requestId?: string): HealthResponse {
    return this.healthService.getLiveness(requestId);
  }

  @Get('ready')
  @HttpCode(HttpStatus.OK)
  ready(@Headers('x-request-id') requestId?: string): HealthResponse {
    const response = this.healthService.getReadiness(requestId);

    if (response.status === 'degraded') {
      throw new ServiceUnavailableException('Database is not ready');
    }

    return response;
  }
}
