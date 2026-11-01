import { Controller, Get, Param, Query } from '@nestjs/common';
import type { HostSiteResponse, SiteAddressResponse } from '@plp/contracts';
import { z } from 'zod';
import { ZodPipe } from '../../shared/zod.pipe.js';
import { Public } from '../auth/public.decorator.js';
import { PublicDomainsService } from './public-domains.service.js';

const tlsQuerySchema = z.object({ domain: z.string().min(1).max(260) });

/** Asked by the edge (Caddy) and the renderer; no session (ADR-022). */
@Public()
@Controller('public')
export class PublicDomainsController {
  constructor(private readonly domains: PublicDomainsService) {}

  /** Caddy's `on_demand_tls ask`: 200 to get a certificate for the domain, 404 not to. */
  @Get('tls/allowed')
  async tlsAllowed(
    @Query(new ZodPipe(tlsQuerySchema)) query: z.infer<typeof tlsQuerySchema>,
  ): Promise<{ allowed: true }> {
    await this.domains.tlsAllowed(query.domain);
    return { allowed: true };
  }

  @Get('hosts/:host')
  hostSite(@Param('host') host: string): Promise<HostSiteResponse> {
    return this.domains.hostSite(host);
  }

  @Get('sites/:subdomain/address')
  siteAddress(@Param('subdomain') subdomain: string): Promise<SiteAddressResponse> {
    return this.domains.siteAddress(subdomain);
  }
}
