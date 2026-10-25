import { Body, Controller, HttpCode, Param, Post } from '@nestjs/common';
import { type PageView, pageViewSchema } from '@plp/contracts';
import {
  type RendererClient,
  RendererRequest,
  VisitorClient,
} from '../../shared/renderer-channel/renderer-request.js';
import { ZodPipe } from '../../shared/zod.pipe.js';
import { PageViewCollector } from './page-view-collector.service.js';

/** Views of live pages, relayed and signed by the renderer (ADR-016, ADR-019). */
@RendererRequest()
@Controller('public/sites/:subdomain/events')
export class PublicEventsController {
  constructor(private readonly collector: PageViewCollector) {}

  /** Always 204: whether the view was counted is not the visitor's concern. */
  @Post()
  @HttpCode(204)
  async record(
    @Param('subdomain') subdomain: string,
    @Body(new ZodPipe(pageViewSchema)) body: PageView,
    @VisitorClient() client: RendererClient,
  ): Promise<void> {
    await this.collector.record(subdomain, body, client);
  }
}
