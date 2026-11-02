import { Injectable, Logger } from '@nestjs/common';
import { can } from '@plp/contracts';
import { UsersRepository } from '../auth/users.repository.js';
import { EmailSender, EmailSendError, type EmailMessage } from '../notifications/email-sender.js';
import {
  approvalPublishedEmail,
  approvalRejectedEmail,
  approvalRequestEmail,
} from '../notifications/emails.js';
import type { PageRecord } from '../pages/page.schema.js';
import type { SiteRecord } from '../sites/site.schema.js';
import type { WorkspaceScope } from '../workspaces/workspace-scope.js';
import { CustomRolesRepository } from '../workspaces/custom-roles.repository.js';
import { accessOf } from '../workspaces/domain/member-access.js';
import { WorkspaceLinks } from '../workspaces/workspace-links.js';
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
    private readonly sender: EmailSender,
    private readonly users: UsersRepository,
    private readonly workspaces: WorkspacesRepository,
    private readonly customRoles: CustomRolesRepository,
    private readonly links: WorkspaceLinks,
  ) {}

  /** One email to every member who may decide on the site's pages; true when it went out. */
  requested(
    scope: WorkspaceScope,
    site: SiteRecord,
    page: PageRecord,
    approval: ApprovalRecord,
    requesterName: string,
    resent: boolean,
  ): Promise<boolean> {
    return this.send(scope, approval, async () => {
      const [members, roles] = await Promise.all([
        this.workspaces.listMembers(scope),
        this.customRoles.mapForWorkspace(scope),
      ]);
      const approvers = members.filter((member) => {
        // A membership without `siteIds` covers the whole workspace (ADR-020).
        const siteIds = member.siteIds ?? null;
        return (
          can(accessOf(member, roles), 'publishApprovals.decide') &&
          (siteIds === null || siteIds.some((id) => id.equals(site._id)))
        );
      });
      const contacts = await this.users.findContacts(approvers.map((member) => member.userId));
      if (contacts.length === 0) {
        throw new Error(`Workspace ${scope.workspaceId.toHexString()} has nobody to approve`);
      }
      return {
        to: contacts.map((contact) => contact.email),
        ...approvalRequestEmail({
          approvalId: approval._id.toHexString(),
          sentAt: approval.sentAt,
          requesterName,
          pageTitle: page.title,
          siteName: site.name,
          note: approval.note,
          resent,
          pageUrl: await this.pageUrl(scope, page),
        }),
      };
    });
  }

  async published(
    scope: WorkspaceScope,
    page: PageRecord,
    approval: ApprovalRecord,
    release: { version: number; publisherName: string; liveUrl: string },
  ): Promise<void> {
    await this.send(scope, approval, async () => {
      const email = await this.requesterEmail(scope, approval);
      return email === null
        ? null
        : {
            to: [email],
            ...approvalPublishedEmail({
              approvalId: approval._id.toHexString(),
              pageTitle: page.title,
              publisherName: release.publisherName,
              approved: can(scope.access, 'publishApprovals.decide'),
              version: release.version,
              liveUrl: release.liveUrl,
            }),
          };
    });
  }

  async rejected(
    scope: WorkspaceScope,
    page: PageRecord,
    approval: ApprovalRecord,
    rejecterName: string,
  ): Promise<void> {
    await this.send(scope, approval, async () => {
      const email = await this.requesterEmail(scope, approval);
      return email === null || approval.reason === null
        ? null
        : {
            to: [email],
            ...approvalRejectedEmail({
              approvalId: approval._id.toHexString(),
              pageTitle: page.title,
              rejecterName,
              reason: approval.reason,
              pageUrl: await this.pageUrl(scope, page),
            }),
          };
    });
  }

  private async pageUrl(scope: WorkspaceScope, page: PageRecord): Promise<string> {
    return `${await this.links.originOf(scope.workspaceId)}/sites/${page.siteId.toHexString()}/pages/${page._id.toHexString()}/edit`;
  }

  /**
   * The sender's address while they still open the page's site: someone removed, or kept to other
   * sites since, hears nothing.
   */
  private async requesterEmail(
    scope: WorkspaceScope,
    approval: ApprovalRecord,
  ): Promise<string | null> {
    const [membership, [contact]] = await Promise.all([
      this.workspaces.findMember(scope, approval.requestedBy),
      this.users.findContacts([approval.requestedBy]),
    ]);
    // A membership without `siteIds` covers the whole workspace (ADR-020).
    const siteIds = membership?.siteIds ?? null;
    const covers = siteIds === null || siteIds.some((id) => id.equals(approval.siteId));
    return membership && contact && covers ? contact.email : null;
  }

  /**
   * Builds the email (null: nobody to tell) and sends it. Reading its recipients is part of it:
   * any failure is logged, never raised, since the request or the release is stored already.
   */
  private async send(
    scope: WorkspaceScope,
    approval: ApprovalRecord,
    build: () => Promise<EmailMessage | null>,
  ): Promise<boolean> {
    try {
      const message = await build();
      if (message === null) {
        return false;
      }
      await this.sender.send(message);
      return true;
    } catch (error) {
      this.logger.warn(
        {
          workspaceId: scope.workspaceId.toHexString(),
          approvalId: approval._id.toHexString(),
          code: error instanceof EmailSendError ? error.code : 'unknown',
          err: error instanceof EmailSendError ? undefined : error,
        },
        'Approval email not sent',
      );
      return false;
    }
  }
}
