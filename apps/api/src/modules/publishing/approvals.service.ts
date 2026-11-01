import { Injectable } from '@nestjs/common';
import type { ApprovalResponse, RejectApproval, RequestApproval } from '@plp/contracts';
import { AppError, notFound } from '../../shared/errors.js';
import { newObjectId, toObjectId } from '../../shared/persistence/object-id.js';
import type { AuthenticatedUser } from '../auth/authenticated-user.js';
import { UsersRepository } from '../auth/users.repository.js';
import { EmailQuota, type QuotaUse } from '../notifications/email-quota.js';
import { PageAccessService } from '../pages/page-access.service.js';
import { revisionConflict } from '../pages/page-errors.js';
import { PageEvaluator } from '../pages/page-evaluator.service.js';
import type { PageRecord } from '../pages/page.schema.js';
import type { SiteRecord } from '../sites/site.schema.js';
import type { WorkspaceScope } from '../workspaces/workspace-scope.js';
import { ApprovalNotifier } from './approval-notifier.service.js';
import type { ApprovalRecord } from './approval.schema.js';
import { ApprovalsRepository } from './approvals.repository.js';
import { APPROVALS_PER_DAY } from './domain/approval-rules.js';

export const APPROVAL_NOT_FOUND = 'Không tìm thấy yêu cầu xuất bản đang chờ';

const REQUESTS: QuotaUse = {
  what: 'Approval request email',
  tooMany: () =>
    new AppError(429, 'rate_limited', 'Đã gửi quá nhiều yêu cầu xuất bản', {
      detail: `Mỗi người gửi tối đa ${APPROVALS_PER_DAY} yêu cầu trong 24 giờ. Hãy thử lại sau.`,
    }),
};

/**
 * Requests to publish (ADR-023): a role without `pages.publish` asks, Chủ sở hữu and Quản trị get
 * an email. Approving is publishing, which closes the request (`PublishingService`); here are
 * sending, withdrawing and refusing.
 */
@Injectable()
export class ApprovalsService {
  constructor(
    private readonly pageAccess: PageAccessService,
    private readonly evaluator: PageEvaluator,
    private readonly approvals: ApprovalsRepository,
    private readonly users: UsersRepository,
    private readonly quota: EmailQuota,
    private readonly notifier: ApprovalNotifier,
  ) {}

  /**
   * Sends the saved draft for approval, or sends the sender's pending request again for it. The
   * draft must be the one the sender reviewed and have no blocking error; warnings are the
   * approver's to decide.
   */
  async request(
    user: AuthenticatedUser,
    pageId: string,
    input: RequestApproval,
  ): Promise<ApprovalResponse> {
    const { scope, site, page } = await this.pageAccess.access(
      user,
      pageId,
      'pages.requestPublish',
    );
    if (page.draft.revision !== input.expectedRevision) {
      throw revisionConflict(page.draft.revision);
    }
    const { checks } = await this.evaluator.evaluate(scope, site, page);
    if (checks.blocking.length > 0) {
      throw new AppError(422, 'publish_blocked', 'Chưa thể gửi yêu cầu xuất bản', {
        detail: 'Sửa các lỗi chặn trước khi gửi yêu cầu.',
        context: { checks },
      });
    }
    const now = new Date();
    const hits = await this.quota.take(
      [
        {
          key: `approval:workspace:${scope.workspaceId.toHexString()}:user:${user.id.toHexString()}`,
          max: APPROVALS_PER_DAY,
        },
      ],
      REQUESTS,
      now,
    );
    const { approval, resent } = await this.quota.giveBackOnError(hits, REQUESTS, () =>
      this.store(scope, page, input, now),
    );
    const sent = await this.notifier.requested(scope, site, page, approval, user.name, resent);
    if (!sent) {
      await this.quota.giveBack(hits, REQUESTS);
    }
    return this.response(scope, site, page);
  }

  /** The sender takes their pending request back. */
  async withdraw(user: AuthenticatedUser, pageId: string): Promise<ApprovalResponse> {
    const { scope, site, page } = await this.pageAccess.access(
      user,
      pageId,
      'pages.requestPublish',
    );
    const pending = await this.approvals.findPending(scope, page._id);
    if (
      !pending?.requestedBy.equals(scope.userId) ||
      !(await this.approvals.close(scope, page._id, pending._id, {
        status: 'withdrawn',
        at: new Date(),
      }))
    ) {
      throw notFound(APPROVAL_NOT_FOUND);
    }
    return this.response(scope, site, page);
  }

  /** Refuses the request the approver saw, with a reason the sender reads in an email. */
  async reject(
    user: AuthenticatedUser,
    pageId: string,
    input: RejectApproval,
  ): Promise<ApprovalResponse> {
    const { scope, site, page } = await this.pageAccess.access(
      user,
      pageId,
      'publishApprovals.decide',
    );
    const rejected = await this.approvals.close(
      scope,
      page._id,
      toObjectId(input.approvalId, APPROVAL_NOT_FOUND),
      { status: 'rejected', at: new Date(), reason: input.reason },
    );
    // Published, withdrawn or refused meanwhile, or not this page's.
    if (!rejected) {
      throw notFound(APPROVAL_NOT_FOUND);
    }
    await this.notifier.rejected(scope, page, rejected, user.name);
    return this.response(scope, site, page);
  }

  /**
   * One pending request per page: the sender's own is sent again for this revision; someone
   * else's is a 409. A request closed or created between the reads is read again, once.
   */
  private async store(
    scope: WorkspaceScope,
    page: PageRecord,
    input: RequestApproval,
    now: Date,
  ): Promise<{ approval: ApprovalRecord; resent: boolean }> {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const pending = await this.approvals.findPending(scope, page._id);
      if (pending !== null) {
        if (!pending.requestedBy.equals(scope.userId)) {
          throw await this.pendingConflict(pending);
        }
        const resent = await this.approvals.resend(scope, pending._id, {
          revision: page.draft.revision,
          note: input.note,
          at: now,
        });
        if (resent !== null) {
          return { approval: resent, resent: true };
        }
        continue;
      }
      const approval: ApprovalRecord = {
        _id: newObjectId(),
        workspaceId: scope.workspaceId,
        siteId: page.siteId,
        pageId: page._id,
        requestedBy: scope.userId,
        revision: page.draft.revision,
        note: input.note,
        status: 'pending',
        createdAt: now,
        sentAt: now,
        decidedAt: null,
        decidedBy: null,
        reason: null,
        releaseId: null,
        purgeAt: null,
      };
      if (await this.approvals.create(scope, approval)) {
        return { approval, resent: false };
      }
    }
    throw new Error(`The pending request to publish page ${page._id.toHexString()} kept changing`);
  }

  private async pendingConflict(pending: ApprovalRecord): Promise<AppError> {
    const refs = await this.users.findRefs([pending.requestedBy]);
    const sender = refs.get(pending.requestedBy.toHexString())?.name ?? 'một thành viên khác';
    return new AppError(409, 'approval_pending', `Trang đang chờ duyệt yêu cầu của ${sender}`, {
      detail: 'Người duyệt sẽ xem bản nháp hiện tại, gồm cả thay đổi của bạn.',
    });
  }

  private async response(
    scope: WorkspaceScope,
    site: SiteRecord,
    page: PageRecord,
  ): Promise<ApprovalResponse> {
    return { page: (await this.evaluator.evaluate(scope, site, page)).summary };
  }
}
