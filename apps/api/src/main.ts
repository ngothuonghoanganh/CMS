import 'reflect-metadata';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module.js';
import { configureApp, NEST_APP_OPTIONS } from './configure-app.js';
import { parseEnv } from './config/env.js';

const rootEnv = fileURLToPath(new URL('../../../.env', import.meta.url));
if (existsSync(rootEnv)) {
  process.loadEnvFile(rootEnv);
}

const env = parseEnv(process.env);
const app = await NestFactory.create<NestExpressApplication>(AppModule.forRoot(env), {
  bufferLogs: true,
  ...NEST_APP_OPTIONS,
});
app.useLogger(app.get(Logger));
configureApp(app, env);
app.enableShutdownHooks();
await app.listen(env.API_PORT);
