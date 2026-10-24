import type { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';

/** HTTP settings shared by the server and integration tests. */
export function configureApp(app: NestExpressApplication): void {
  app.use(cookieParser());
  app.useBodyParser('json', { limit: '1mb' });
  app.disable('x-powered-by');
}
