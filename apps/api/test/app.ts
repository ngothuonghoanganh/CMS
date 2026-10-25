import 'reflect-metadata';
import { getConnectionToken } from '@nestjs/mongoose';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test, type TestingModuleBuilder } from '@nestjs/testing';
import type { Connection } from 'mongoose';
import { AppModule } from '../src/app.module.js';
import { type Env, type EnvInput, parseEnv } from '../src/config/env.js';
import { configureApp, NEST_APP_OPTIONS } from '../src/configure-app.js';
import { testEnvInput } from './env.js';
import { dropDatabase, isolatedMongoUri } from './mongo.js';

export interface TestApp {
  app: NestExpressApplication;
  env: Env;
  connection: Connection;
  close(): Promise<void>;
}

export interface TestAppOptions {
  env?: Partial<EnvInput>;
  /** Replace providers, e.g. the revalidation client: `builder.overrideProvider(X).useValue(y)`. */
  override?: (builder: TestingModuleBuilder) => TestingModuleBuilder;
}

/** Boots the whole API against a database of its own, with every index built. */
export async function createTestApp(
  prefix: string,
  options: TestAppOptions = {},
): Promise<TestApp> {
  const mongoUri = isolatedMongoUri(prefix);
  const env = parseEnv(testEnvInput({ ...options.env, MONGODB_URI: mongoUri }));
  let builder = Test.createTestingModule({ imports: [AppModule.forRoot(env)] });
  if (options.override) {
    builder = options.override(builder);
  }
  const moduleRef = await builder.compile();
  const app = moduleRef.createNestApplication<NestExpressApplication>({
    logger: false,
    ...NEST_APP_OPTIONS,
  });
  configureApp(app, env);
  await app.init();
  const connection = app.get<Connection>(getConnectionToken());
  // Collections and unique indexes must exist before tests rely on them and before transactions write.
  await Promise.all(Object.values(connection.models).map((model) => model.init()));
  return {
    app,
    env,
    connection,
    async close() {
      await app.close();
      await dropDatabase(mongoUri);
    },
  };
}
