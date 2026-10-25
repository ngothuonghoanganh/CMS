import { Body, Controller, Param, Post, Res } from '@nestjs/common';
import {
  type PublicLeadResponse,
  type PublicLeadValues,
  publicLeadRequestSchema,
} from '@plp/contracts';
import type { Response } from 'express';
import {
  type RendererClient,
  RendererRequest,
  VisitorClient,
} from '../../shared/renderer-channel/renderer-request.js';
import { ZodPipe } from '../../shared/zod.pipe.js';
import { LeadIntakeService } from './lead-intake.service.js';

/** Lead form submissions relayed and signed by the renderer (ADR-016). */
@RendererRequest()
@Controller('public/sites/:subdomain/leads')
export class PublicLeadsController {
  constructor(private readonly intake: LeadIntakeService) {}

  /** 201 for a new lead; 200 when this submission was already received. */
  @Post()
  async submit(
    @Param('subdomain') subdomain: string,
    @Body(new ZodPipe(publicLeadRequestSchema)) body: PublicLeadValues,
    @VisitorClient() client: RendererClient,
    @Res({ passthrough: true }) response: Response,
  ): Promise<PublicLeadResponse> {
    const outcome = await this.intake.submit(subdomain, body, client);
    response.status(outcome.replayed ? 200 : 201);
    return { status: 'received' };
  }
}
