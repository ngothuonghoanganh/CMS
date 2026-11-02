import { Body, Controller, Delete, Get, HttpCode, Param, Post, Put, Query } from '@nestjs/common';
import {
  type AddDomainRequest,
  addDomainRequestSchema,
  type Domain,
  type DomainAvailability,
  domainAvailabilityQuerySchema,
  type DomainListResponse,
  type SetPrimaryDomainRequest,
  setPrimaryDomainRequestSchema,
  type SiteAddressStatus,
} from '@plp/contracts';
import type { z } from 'zod';
import { ZodPipe } from '../../shared/zod.pipe.js';
import type { AuthenticatedUser } from '../auth/authenticated-user.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { DomainsService } from './domains.service.js';

type DomainAvailabilityQuery = z.output<typeof domainAvailabilityQuerySchema>;

@Controller('sites/:siteId')
export class DomainsController {
  constructor(private readonly domains: DomainsService) {}

  @Get('domains')
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Param('siteId') siteId: string,
  ): Promise<DomainListResponse> {
    return this.domains.list(user, siteId);
  }

  @Get('domains/availability')
  availability(
    @CurrentUser() user: AuthenticatedUser,
    @Param('siteId') siteId: string,
    @Query(new ZodPipe(domainAvailabilityQuerySchema)) query: DomainAvailabilityQuery,
  ): Promise<DomainAvailability> {
    return this.domains.availability(user, siteId, query.hostname);
  }

  @Post('domains')
  add(
    @CurrentUser() user: AuthenticatedUser,
    @Param('siteId') siteId: string,
    @Body(new ZodPipe(addDomainRequestSchema)) body: AddDomainRequest,
  ): Promise<Domain> {
    return this.domains.add(user, siteId, body);
  }

  @Post('domains/:domainId/check')
  @HttpCode(200)
  check(
    @CurrentUser() user: AuthenticatedUser,
    @Param('siteId') siteId: string,
    @Param('domainId') domainId: string,
  ): Promise<Domain> {
    return this.domains.check(user, siteId, domainId);
  }

  @Delete('domains/:domainId')
  @HttpCode(204)
  remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('siteId') siteId: string,
    @Param('domainId') domainId: string,
  ): Promise<void> {
    return this.domains.remove(user, siteId, domainId);
  }

  @Put('primary-domain')
  setPrimary(
    @CurrentUser() user: AuthenticatedUser,
    @Param('siteId') siteId: string,
    @Body(new ZodPipe(setPrimaryDomainRequestSchema)) body: SetPrimaryDomainRequest,
  ): Promise<DomainListResponse> {
    return this.domains.setPrimary(user, siteId, body);
  }

  @Get('address-status')
  addressStatus(
    @CurrentUser() user: AuthenticatedUser,
    @Param('siteId') siteId: string,
  ): Promise<SiteAddressStatus> {
    return this.domains.addressStatus(user, siteId);
  }
}
