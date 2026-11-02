import { Injectable } from '@nestjs/common';
import type { ApprovalResponse, RejectApproval, RequestApproval } from '@plp/contracts';
import { AppError, notFound } from '../../shared/errors.js';
import { isDuplicateKeyError } from '../../shared/persistence/duplicate-key.js';
import { newObjectId, toObjectId } from '../../shared/persistence/object-id.js';
import { TransactionRunner } from '../../shared/persistence/transaction.js';
import type { AuthenticatedUser } from '../auth/authenticated-user.js';
import { UsersRepository } from '../auth/users.repository.js';
import { EmailQuota, type QuotaUse } from '../notifications/email-quota.js';
import { PAGE_NOT_FOUND, PageAccessService } from '../pages/page-access.service.js';
import { revisionConflict } from '../pages/page-errors.js';
import { PageEvaluator } from '../pages/page-evaluator.service.js';
import type { PageRecord } from '../pages/page.schema.js';
import { PagesRepository } from '../pages/pages.repository.js';
import type { SiteRecord } from '../sites/site.schema.js';
import type { WorkspaceScope } from '../workspaces/workspace-scope.js';
import { ApprovalNotifier } from './approval-notifier.service.js';
import { APPROVAL_PENDING_INDEX, type ApprovalRecord } from './approval.schema.js';
import { ApprovalsRepository } from './approvals.repository.js';
import { APPROVALS_PER_DAY } from './domain/approval-rules.js';
import { pointerConflict } from './pointer.service.js';

const APPROVAL_NOT_FOUND = 'Không tìm thấy yêu cầu xuất bản đang chờ';

function approvalChanged(options?: { cause: unknown }): AppError {
  return new AppError(409, 'approval_changed', 'Yêu cầu xuất bản vừa thay đổi', {
    detail: 'Yêu cầu vừa được trả lời, hoặc được gửi từ nơi khác. Xem lại trang rồi gửi.',
    ...options,
  });
}

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
    private readonly pages: PagesRepository,
    private readonly users: UsersRepository,
    private readonly quota: EmailQuota,
    private readonly notifier: ApprovalNotifier,
    private readonly transactions: TransactionRunner,
  ) {}

  /**
   * Sends the saved draft for approval, or sends the sender's pending request again for it. The
   * draft must be the one the sender reviewed and have no blocking error; warnings are the
   * approver's to decide.
   */
  async request(
    user: AuthenticatedUser,
    siteId: string,
    pageId: string,
    input: RequestApproval,
  ): Promise<ApprovalResponse> {
    const { scope, site, page } = await this.pageAccess.access(
      user,
      siteId,
      pageId,
      'pages.requestPublish',
    );
    if (page.draft.revision !== input.expectedRevision) {
      throw revisionConflict(page.draft.revision);
    }
    // Published since the sender looked: nobody asks to publish what just went live.
    if ((page.publishedReleaseId?.toHexString() ?? null) !== input.expectedPublishedReleaseId) {
      throw pointerConflict();
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
  async withdraw(
    user: AuthenticatedUser,
    siteId: string,
    pageId: string,
  ): Promise<ApprovalResponse> {
    const { scope, site, page } = await this.pageAccess.access(
      user,
      siteId,
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
    siteId: string,
    pageId: string,
    input: RejectApproval,
  ): Promise<ApprovalResponse> {
    const { scope, site, page } = await this.pageAccess.access(
      user,
      siteId,
      pageId,
      'publishApprovals.decide',
    );
    const rejected = await this.approvals.close(
      scope,
      page._id,
      toObjectId(input.approvalId, APPROVAL_NOT_FOUND),
      {
        status: 'rejected',
        at: new Date(),
        reason: input.reason,
        revision: input.revision,
        releaseSeq: page.releaseSeq,
      },
    );
    // Published, withdrawn, refused or sent again meanwhile, or not this page's.
    if (!rejected) {
      throw notFound(APPROVAL_NOT_FOUND);
    }
    await this.notifier.rejected(scope, page, rejected, user.name);
    return this.response(scope, site, page);
  }

  /**
   * One pending request per page (ADR-023). The sender's own is sent again only when it is the
   * one they saw (`approvalId`); someone else's is a 409 naming them. A request answered, or sent
   * from elsewhere, since the sender looked is a 409 too: their dialog reloads and shows it,
   * rather than asking again for a page that went live under them. All in one transaction that
   * first marks the page, guarded by the draft and the pointer the sender saw: a publish or a
   * save at the same moment conflicts with it, so a request is never stored for a draft that is
   * live already.
   */
  private async store(
    scope: WorkspaceScope,
    page: PageRecord,
    input: RequestApproval,
    now: Date,
  ): Promise<{ approval: ApprovalRecord; resent: boolean }> {
    try {
      return await this.transactions.run(async (tx) => {
        const held = await this.pages.holdForApproval(
          scope,
          {
            id: page._id,
            revision: input.expectedRevision,
            publishedReleaseId:
              input.expectedPublishedReleaseId === null
                ? null
                : toObjectId(input.expectedPublishedReleaseId, PAGE_NOT_FOUND),
          },
          now,
          tx,
        );
        if (!held) {
          const current = await this.pages.findById(scope, page._id, tx);
          if (current === null) {
            // Deleted since it was read (ADR-027).
            throw notFound(PAGE_NOT_FOUND);
          }
          throw current.draft.revision !== input.expectedRevision
            ? revisionConflict(current.draft.revision)
            : pointerConflict();
        }
        const pending = await this.approvals.findPending(scope, page._id, tx);
        if (pending !== null && !pending.requestedBy.equals(scope.userId)) {
          throw await this.pendingConflict(pending);
        }
        if ((pending?._id.toHexString() ?? null) !== input.approvalId) {
          throw approvalChanged();
        }
        if (pending !== null) {
          const resent = await this.approvals.resend(
            scope,
            pending._id,
            { revision: input.expectedRevision, note: input.note, at: now },
            tx,
          );
          if (resent === null) {
            throw approvalChanged();
          }
          return { approval: resent, resent: true };
        }
        const approval: ApprovalRecord = {
          _id: newObjectId(),
          workspaceId: scope.workspaceId,
          siteId: page.siteId,
          pageId: page._id,
          requestedBy: scope.userId,
          revision: input.expectedRevision,
          note: input.note,
          status: 'pending',
          createdAt: now,
          sentAt: now,
          decidedAt: null,
          decidedBy: null,
          reason: null,
          releaseId: null,
          releaseSeq: null,
          purgeAt: null,
        };
        await this.approvals.create(scope, approval, tx);
        return { approval, resent: false };
      });
    } catch (error) {
      // Another request was stored at the same moment: the dialog reloads and shows it.
      if (isDuplicateKeyError(error, APPROVAL_PENDING_INDEX)) {
        throw approvalChanged({ cause: error });
      }
      throw error;
    }
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
