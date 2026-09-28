import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Model } from 'mongoose';

import {
  SITE_NAVIGATION_PORT,
  type SiteNavigationPort,
  type SiteNavigationReference,
} from '../../shared/site-navigation-port';
import { NavigationRecord } from '../../persistence/schemas/navigation.schema';

/** Composition-root adapter for the manifest's minimal navigation read. */
@Injectable()
export class SiteNavigationAdapter implements SiteNavigationPort {
  constructor(
    @InjectModel(NavigationRecord.name)
    private readonly navigationModel: Model<NavigationRecord>,
  ) {}

  async listReferences(
    workspaceId: string,
    siteId: string,
  ): Promise<readonly SiteNavigationReference[]> {
    const records = await this.navigationModel.find({ siteId, workspaceId }).exec();
    return records.map((record) => ({
      id: record._id.toString(),
      key: record.key,
    }));
  }
}

export const SITE_NAVIGATION_PORT_PROVIDER = {
  provide: SITE_NAVIGATION_PORT,
  useExisting: SiteNavigationAdapter,
} as const;
