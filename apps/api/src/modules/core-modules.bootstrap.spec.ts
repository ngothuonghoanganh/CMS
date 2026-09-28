import { getConnectionToken } from '@nestjs/mongoose';
import { Global, Module } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { Connection } from 'mongoose';
import { describe, expect, it, vi } from 'vitest';

import { AssetModule } from './assets/asset.module';
import { PagesModule } from './pages/pages.module';
import { PublicDeliveryModule } from './public-delivery/public-delivery.module';
import { SiteModule } from './sites/site.module';
import { SubmissionsModule } from './submissions/submissions.module';
import { WorkspaceModule } from './workspaces/workspace.module';
import { AssetService } from './assets/asset.service';
import { PageService } from './pages/page.service';
import { PublicPageResolver } from './public-delivery/public-page.resolver';
import { SiteService } from './sites/site.service';
import { SubmissionService } from './submissions/submission.service';
import { WorkspaceService } from './workspaces/workspace.service';
import { DomainModule } from '../domain/domain.module';
import { MASTER_CONNECTION } from '../tenancy/master-connection';
import { AnalyticsService } from '../domain/analytics.service';
import { CollectionService } from '../domain/collection.service';
import { UsageService } from '../billing/usage.service';
import { PageExtensionService } from '../extensions/page-extension.service';
import { WorkflowService } from '../workflows/workflow.service';
import { ReusableService } from './reusables/reusable.service';

function createConnectionStub(): Connection {
  return {
    model: vi.fn().mockReturnValue({}),
    models: {},
  } as unknown as Connection;
}

const masterConnectionProvider = {
  provide: getConnectionToken(MASTER_CONNECTION),
  useValue: createConnectionStub(),
};

@Global()
@Module({
  providers: [masterConnectionProvider],
  exports: [masterConnectionProvider],
})
class FakeMasterConnectionModule {}

describe('Core feature module bootstrap', () => {
  it('bootstraps core ownership without importing deferred platform modules', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        FakeMasterConnectionModule,
        WorkspaceModule,
        SiteModule,
        PagesModule,
        AssetModule,
        SubmissionsModule,
        PublicDeliveryModule,
      ],
    }).compile();

    expect(moduleRef.get(WorkspaceService, { strict: false })).toBeInstanceOf(
      WorkspaceService,
    );
    expect(moduleRef.get(SiteService, { strict: false })).toBeInstanceOf(SiteService);
    expect(moduleRef.get(PageService, { strict: false })).toBeInstanceOf(PageService);
    expect(moduleRef.get(AssetService, { strict: false })).toBeInstanceOf(AssetService);
    expect(moduleRef.get(SubmissionService, { strict: false })).toBeInstanceOf(
      SubmissionService,
    );
    expect(moduleRef.get(PublicPageResolver, { strict: false })).toBeInstanceOf(
      PublicPageResolver,
    );

    for (const deferredService of [
      UsageService,
      WorkflowService,
      PageExtensionService,
      AnalyticsService,
      CollectionService,
      ReusableService,
    ]) {
      expect(() => moduleRef.get(deferredService, { strict: false })).toThrow();
    }

    await moduleRef.close();
  });

  it('keeps optional platform wiring in the composition boundary', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [FakeMasterConnectionModule, DomainModule],
    }).compile();

    expect(moduleRef.get(PageService, { strict: false })).toBeInstanceOf(PageService);
    expect(moduleRef.get(SubmissionService, { strict: false })).toBeInstanceOf(
      SubmissionService,
    );
    expect(moduleRef.get(PublicPageResolver, { strict: false })).toBeInstanceOf(
      PublicPageResolver,
    );

    await moduleRef.close();
  });
});
