import 'reflect-metadata';

import { randomUUID } from 'node:crypto';

import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import pinoHttp from 'pino-http';
import { json } from 'express';

import { ApiExceptionFilter } from './common/filters/api-exception.filter';
import { PlatformLogger, platformLogger } from './common/logging/platform-logger';
import { requestIdMiddleware } from './common/middleware/request-id.middleware';
import { env } from './config/env';
import { AppModule } from './app.module';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });

  app.useLogger(new PlatformLogger());
  // Global resource removal is represented by a JSON `null` snapshot. Express
  // defaults to strict JSON parsing, which rejects scalar JSON bodies before
  // the route's Zod schema can validate that nullable contract.
  app.use(json({ limit: '64kb', strict: false }));
  app.use(
    pinoHttp({
      genReqId: (request) => {
        const headerValue = request.headers['x-request-id'];
        return (
          (Array.isArray(headerValue) ? headerValue[0] : headerValue) ?? randomUUID()
        );
      },
      logger: platformLogger,
      redact: [
        'req.headers.authorization',
        'req.headers.cookie',
        'req.headers["x-api-key"]',
      ],
    }),
  );
  app.use(requestIdMiddleware);
  app.setGlobalPrefix('api/v1');
  app.useGlobalFilters(new ApiExceptionFilter());
  app.useGlobalPipes(
    new ValidationPipe({
      forbidUnknownValues: true,
      transform: true,
      whitelist: true,
    }),
  );
  app.enableCors({
    credentials: true,
    origin: env.CORS_ORIGIN.split(',').map((origin) => origin.trim()),
  });
  app.enableShutdownHooks();

  await app.listen(env.PORT, '0.0.0.0');
}

void bootstrap().catch((error: unknown) => {
  const message = error instanceof Error ? (error.stack ?? error.message) : String(error);
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
