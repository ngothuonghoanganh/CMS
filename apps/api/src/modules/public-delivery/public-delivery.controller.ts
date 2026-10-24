import { Controller, Get, Header, Param, Query } from '@nestjs/common';
import {
  type PublicPreviewResponse,
  type ResolveResponse,
  resolveQuerySchema,
  type SitemapResponse,
} from '@plp/contracts';
import type { z } from 'zod';
import { ZodPipe } from '../../shared/zod.pipe.js';
import { Public } from '../auth/public.decorator.js';
import { PublicDeliveryService } from './public-delivery.service.js';

type ResolveQuery = z.output<typeof resolveQuerySchema>;

/** Endpoints for the renderer only: no session, public contracts only (ADR-009). */
@Public()
@Controller('public')
export class PublicDeliveryController {
  constructor(private readonly delivery: PublicDeliveryService) {}

  @Get('sites/:subdomain/resolve')
  resolve(
    @Param('subdomain') subdomain: string,
    @Query(new ZodPipe(resolveQuerySchema)) query: ResolveQuery,
  ): Promise<ResolveResponse> {
    return this.delivery.resolve(subdomain, query.path);
  }

  @Get('sites/:subdomain/sitemap')
  sitemap(@Param('subdomain') subdomain: string): Promise<SitemapResponse> {
    return this.delivery.sitemap(subdomain);
  }

  @Get('preview/:token')
  @Header('Cache-Control', 'no-store')
  @Header('X-Robots-Tag', 'noindex, nofollow')
  preview(@Param('token') token: string): Promise<PublicPreviewResponse> {
    return this.delivery.preview(token);
  }
}
