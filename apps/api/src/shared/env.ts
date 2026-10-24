import { type DynamicModule, Global, Inject, Module } from '@nestjs/common';
import type { Env } from '../config/env.js';

export const ENV = Symbol('ENV');

/** Injects the validated environment: `constructor(@InjectEnv() env: Env)`. */
export const InjectEnv = (): ParameterDecorator => Inject(ENV);

@Global()
@Module({})
export class EnvModule {
  static forRoot(env: Env): DynamicModule {
    return { module: EnvModule, providers: [{ provide: ENV, useValue: env }], exports: [ENV] };
  }
}
