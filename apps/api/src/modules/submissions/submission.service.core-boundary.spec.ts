import { Test } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { describe, expect, it, vi } from 'vitest';
import type { FormProps } from '@payload/contracts';

import { FormSubmissionRecord } from '../../persistence/schemas/form-submission.schema';
import { PageRecord } from '../../persistence/schemas/page.schema';
import { PageVersionRecord } from '../../persistence/schemas/page-version.schema';
import { SiteRecord } from '../../persistence/schemas/site.schema';
import { WorkspaceRecord } from '../../persistence/schemas/workspace.schema';
import { TenantContext } from '../../tenancy/tenant-context';
import { CORE_EVENT_PUBLISHER } from '../../shared/events/core-event-publisher';
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
        { provide: CORE_EVENT_PUBLISHER, useValue: {} },
        { provide: TenantContext, useValue: {} },
        SubmissionService,
      ],
    }).compile();

    expect(moduleRef.get(SubmissionService)).toBeInstanceOf(SubmissionService);
    await moduleRef.close();
  });

  it('returns success after durable persistence when optional event delivery fails', async () => {
    const service = Object.create(SubmissionService.prototype) as SubmissionService;
    const state = service as unknown as Record<string, unknown>;
    const submission = { _id: { toString: () => 'submission-1' } };
    state.rateBuckets = new Map();
    const formProps = {
      fields: [
        {
          id: 'email',
          type: 'email',
          label: 'Email',
          name: 'email',
          required: true,
        },
      ],
      submitLabel: 'Submit',
      successMessage: 'Thanks',
    } satisfies FormProps;

    const resolved = {
      site: {
        _id: { toString: () => 'site-1' },
        workspaceId: 'workspace-1',
      },
      page: { _id: { toString: () => 'page-1' } },
      version: {
        _id: { toString: () => 'version-1' },
        versionNumber: 4,
      },
      form: { id: 'contact-form', type: 'form', props: formProps, children: [] },
    };
    const create = vi.fn().mockResolvedValue(submission);
    state.submissionModel = { create };
    state.resolvePublishedFormByPath = vi.fn().mockResolvedValue(resolved);
    state.tenantContext = { require: () => ({ id: 'tenant-1' }) };
    state.events = { publish: vi.fn().mockRejectedValue(new Error('optional failure')) };

    await expect(
      service.submitPublicByPath(
        'site',
        '/',
        'contact-form',
        { values: [{ fieldId: 'email', value: 'lead@example.com' }] },
        '127.0.0.1',
      ),
    ).resolves.toEqual({ success: true });
    expect(create).toHaveBeenCalledTimes(1);
    expect(state.events).toMatchObject({
      publish: expect.any(Function),
    });
  });
});
