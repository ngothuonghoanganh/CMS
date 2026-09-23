import { Inject, Injectable } from '@nestjs/common';

import {
  PAGE_PUBLISH_COMPATIBILITY,
  type PagePublishCompatibility,
} from '../shared/page-publish-compatibility';
import { WorkflowService } from './workflow.service';

@Injectable()
export class WorkflowPagePublishCompatibilityAdapter implements PagePublishCompatibility {
  constructor(@Inject(WorkflowService) private readonly workflows: WorkflowService) {}

  validateBeforePublish(pageId: string, workspaceId: string): Promise<void> {
    return this.workflows.validatePagePublishDependencies(pageId, workspaceId);
  }
}

export const WORKFLOW_PAGE_PUBLISH_COMPATIBILITY_PROVIDER = {
  provide: PAGE_PUBLISH_COMPATIBILITY,
  useExisting: WorkflowPagePublishCompatibilityAdapter,
} as const;
