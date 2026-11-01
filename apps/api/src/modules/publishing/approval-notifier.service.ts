import { Injectable, Logger } from '@nestjs/common';
import { can } from '@plp/contracts';
import type { Env } from '../../config/env.js';
import { InjectEnv } from '../../shared/env.js';
import type { ObjectId } from '../../shared/persistence/object-id.js';
import { UsersRepository } from '../auth/users.repository.js';
import { EmailSender, EmailSendError, type EmailMessage } from '../notifications/email-sender.js';
import {
  approvalPublishedEmail,
  approvalRejectedEmail,
  approvalRequestEmail,
} from '../notifications/email-templates.js';
import type { PageRecord } from '../pages/page.schema.js';
import type { SiteRecord } from '../sites/site.schema.js';
import type { WorkspaceScope } from '../workspaces/workspace-scope.js';
import { WorkspacesRepository } from '../workspaces/workspaces.repository.js';
import type { ApprovalRecord } from './approval.schema.js';

/**
 * The emails of a request to publish (ADR-023). A failed email is logged, not raised: the request
 * or the decision is stored already.
 */
@Injectable()
export class ApprovalNotifier {
  private readonly logger = new Logger(ApprovalNotifier.name);

  constructor(
    @InjectEnv() private readonly env: Env,
    private readonly sender: EmailSender,
    private readonly users: UsersRepository,
    private readonly workspaces: WorkspacesRepository,
  ) {}

  /** One email to every member who may decide on the site's pages; true when it went out. */
  async requested(
    scope: WorkspaceScope,
    site: SiteRecord,
    page: PageRecord,
    approval: ApprovalRecord,
    requesterName: string,
    resent: boolean,
  ): Promise<boolean> {
    const approvers = (await this.workspaces.listMembers(scope)).filter(
      (member) =>
        (can(member.role, 'publishApprovals.decide') &&
          // A membership without `siteIds` covers the whole workspace (ADR-020).
          (member.siteIds ?? null) === null) ||
        (member.siteIds ?? []).some((id) => id.equals(site._id)),
    );
    const contacts = await this.users.findContacts(approvers.map((member) => member.userId));
    if (contacts.length === 0) {
      throw new Error(`Workspace ${scope.workspaceId.toHexString()} has nobody to approve`);
    }
    return this.send(scope, approval, {
      to: contacts.map((contact) => contact.email),
      ...approvalRequestEmail({
        requesterName,
        pageTitle: page.title,
        siteName: site.name,
        note: approval.note,
        resent,
        pageUrl: this.pageUrl(page),
      }),
    });
  }

  async published(
    scope: WorkspaceScope,
    page: PageRecord,
    approval: ApprovalRecord,
    release: { version: number; publisherName: string; liveUrl: string },
  ): Promise<void> {
    const email = await this.requesterEmail(scope, approval.requestedBy);
    if (email === null) {
      return;
    }
    await this.send(scope, approval, {
      to: [email],
      ...approvalPublishedEmail({
        pageTitle: page.title,
        publisherName: release.publisherName,
        version: release.version,
        liveUrl: release.liveUrl,
      }),
    });
  }

  async rejected(
    scope: WorkspaceScope,
    page: PageRecord,
    approval: ApprovalRecord,
    rejecterName: string,
  ): Promise<void> {
    const email = await this.requesterEmail(scope, approval.requestedBy);
    if (email === null || approval.reason === null) {
      return;
    }
    await this.send(scope, approval, {
      to: [email],
      ...approvalRejectedEmail({
        pageTitle: page.title,
        rejecterName,
        reason: approval.reason,
        pageUrl: this.pageUrl(page),
      }),
    });
  }

  private pageUrl(page: PageRecord): string {
    return `${this.env.ADMIN_ORIGIN}/sites/${page.siteId.toHexString()}/pages/${page._id.toHexString()}/edit`;
  }

  /** The sender's address while they are still a member: someone removed hears nothing. */
  private async requesterEmail(scope: WorkspaceScope, userId: ObjectId): Promise<string | null> {
    const [membership, [contact]] = await Promise.all([
      this.workspaces.findMember(scope, userId),
      this.users.findContacts([userId]),
    ]);
    return membership && contact ? contact.email : null;
  }

  private async send(
    scope: WorkspaceScope,
    approval: ApprovalRecord,
    message: EmailMessage,
  ): Promise<boolean> {
    try {
      await this.sender.send(message);
      return true;
    } catch (error) {
      this.logger.warn(
        {
          workspaceId: scope.workspaceId.toHexString(),
          approvalId: approval._id.toHexString(),
          code: error instanceof EmailSendError ? error.code : 'unknown',
        },
        'Approval email not sent',
      );
      return false;
    }
  }
}
