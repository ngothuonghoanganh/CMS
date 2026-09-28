import { Test } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { describe, expect, it } from 'vitest';

import { FormSubmissionRecord } from '../persistence/schemas/form-submission.schema';
import { PageRecord } from '../persistence/schemas/page.schema';
import { PageVersionRecord } from '../persistence/schemas/page-version.schema';
import { SiteRecord } from '../persistence/schemas/site.schema';
import { WorkspaceRecord } from '../persistence/schemas/workspace.schema';
import { TenantContext } from '../tenancy/tenant-context';
import { SUBMISSION_SIDE_EFFECTS_PORT } from '../shared/submission-side-effects-port';
import { SubmissionService } from './submission.service';

describe('SubmissionService core dependency boundary', () => {
  it('is resolvable without concrete billing, integration, analytics or extension providers', async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        { provide: getModelToken(FormSubmissionRecord.name), useValue: {} },
        { provide: getModelToken(SiteRecord.name), useValue: {} },
        { provide: getModelToken(PageRecord.name), useValue: {} },
        { provide: getModelToken(PageVersionRecord.name), useValue: {} },
        { provide: getModelToken(WorkspaceRecord.name), useValue: {} },
        { provide: SUBMISSION_SIDE_EFFECTS_PORT, useValue: {} },
        { provide: TenantContext, useValue: {} },
        SubmissionService,
      ],
    }).compile();

    expect(moduleRef.get(SubmissionService)).toBeInstanceOf(SubmissionService);
    await moduleRef.close();
  });
});
