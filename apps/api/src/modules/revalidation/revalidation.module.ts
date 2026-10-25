import { Module } from '@nestjs/common';
import { RevalidationClient } from './revalidation.client.js';

/** Renderer cache invalidation; integration tests override `RevalidationClient` with a recorder. */
@Module({
  providers: [RevalidationClient],
  exports: [RevalidationClient],
})
export class RevalidationModule {}
