import type { LoggerService, LogLevel } from '@nestjs/common';
import pino from 'pino';

import { env } from '../../config/env';

export const platformLogger = pino({ level: env.LOG_LEVEL });

export class PlatformLogger implements LoggerService {
  log(message: unknown, context?: string): void {
    this.write('info', message, context);
  }

  error(message: unknown, ...optionalParams: unknown[]): void {
    this.write('error', message, this.contextFrom(optionalParams));
  }

  warn(message: unknown, context?: string): void {
    this.write('warn', message, context);
  }

  debug(message: unknown, context?: string): void {
    this.write('debug', message, context);
  }

  verbose(message: unknown, context?: string): void {
    this.write('debug', message, context);
  }

  fatal(message: unknown, context?: string): void {
    this.write('fatal', message, context);
  }

  setLogLevels(_levels: LogLevel[]): void {
    // Pino owns the configured level through the centralized environment config.
  }

  private write(
    level: 'debug' | 'error' | 'fatal' | 'info' | 'warn',
    message: unknown,
    context?: string,
  ): void {
    const logger = platformLogger[level].bind(platformLogger);

    if (typeof message === 'string') {
      logger(context ? { context } : {}, message);
      return;
    }

    logger({ context, message });
  }

  private contextFrom(optionalParams: unknown[]): string | undefined {
    const context = optionalParams.at(-1);
    return typeof context === 'string' ? context : undefined;
  }
}
