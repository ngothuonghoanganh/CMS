import { Controller, Get, Param, Query } from '@nestjs/common';
import { activityListQuerySchema, type ActivityListResponse } from '@plp/contracts';
import { ZodPipe } from '../../shared/zod.pipe.js';
import type { AuthenticatedUser } from '../auth/authenticated-user.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { SitesService } from '../sites/sites.service.js';
import { type ActivityListQueryValues, ActivityService } from './activity.service.js';

@Controller()
export class ActivityController {
  constructor(
    private readonly sites: SitesService,
    private readonly activity: ActivityService,
  ) {}

  @Get('sites/:siteId/activity')
  async listForSite(
    @CurrentUser() user: AuthenticatedUser,
    @Param('siteId') siteId: string,
    @Query(new ZodPipe(activityListQuerySchema)) query: ActivityListQueryValues,
  ): Promise<ActivityListResponse> {
    const { scope, site } = await this.sites.access(user, siteId);
    return this.activity.listForSite(scope, site._id, query);
  }
}
