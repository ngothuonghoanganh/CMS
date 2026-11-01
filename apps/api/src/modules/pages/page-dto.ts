import type {
  ChangeItem,
  CheckCounts,
  Draft,
  LiveReleaseRef,
  PageApproval,
  PageStatus,
  PageSummary,
  PointerEvent,
  UserRef,
} from '@plp/contracts';
import type { ObjectId } from '../../shared/persistence/object-id.js';
import type { ActivityRecord } from '../activity/activity.schema.js';
import type { ApprovalRecord } from '../publishing/approval.schema.js';
import type { ReleaseRecord } from '../publishing/release.schema.js';
import type { PageRecord } from './page.schema.js';

/** Public URL of a live slug: the origin itself for the home page (""). */
export function liveUrlOf(origin: string, slug: string): string {
  return slug === '' ? origin : `${origin}/${slug}`;
}

/** The contract view of a pointer event (`page.published`, rollbacks, undo, unpublish). */
export function toPointerEvent(record: ActivityRecord, by: UserRef): PointerEvent {
  const at = record.createdAt.toISOString();
  switch (record.type) {
    case 'page.published':
      return { type: 'published', version: record.data.version, by, at };
    case 'page.rolled_back':
      return { type: 'rolled_back', version: record.data.toVersion, by, at };
    case 'page.rollback_undone':
      return { type: 'rollback_undone', version: record.data.toVersion, by, at };
    case 'page.unpublished':
      return { type: 'unpublished', version: null, by, at };
    case 'site.created':
    case 'page.created':
    case 'page.draft_restored':
    case 'asset.uploaded':
    case 'privacy.updated':
    case 'consent.version_created':
    case 'lead.exported':
    case 'lead.person_deleted':
    case 'lead.recipients_changed':
    case 'data_request.created':
    case 'data_request.completed':
      throw new Error(
        `Activity ${record._id.toHexString()} (${record.type}) is not a pointer event`,
      );
  }
}

function toLiveReleaseRef(release: ReleaseRecord): LiveReleaseRef {
  return {
    id: release._id.toHexString(),
    version: release.version,
    slug: release.slug,
    publishedAt: release.createdAt.toISOString(),
  };
}

/** `PageSummary.approval` of a request `visibleApproval` shows (ADR-023). */
export function toPageApproval(
  approval: ApprovalRecord,
  userRef: (id: ObjectId) => UserRef,
): PageApproval {
  const base = {
    id: approval._id.toHexString(),
    requestedBy: userRef(approval.requestedBy),
    revision: approval.revision,
    note: approval.note,
    sentAt: approval.sentAt.toISOString(),
  };
  if (approval.status === 'pending') {
    return { status: 'pending', ...base };
  }
  if (
    approval.status === 'rejected' &&
    approval.decidedBy !== null &&
    approval.decidedAt !== null &&
    approval.reason !== null
  ) {
    return {
      status: 'rejected',
      ...base,
      rejectedBy: userRef(approval.decidedBy),
      rejectedAt: approval.decidedAt.toISOString(),
      reason: approval.reason,
    };
  }
  throw new Error(`Approval ${base.id} (${approval.status}) is not shown on its page`);
}

export interface PageSummaryInput {
  page: PageRecord;
  status: PageStatus;
  siteChanges: ChangeItem[];
  liveRelease: ReleaseRecord | null;
  lastPointerEvent: PointerEvent | null;
  origin: string;
  checks: CheckCounts;
  approval: PageApproval | null;
  createdBy: UserRef;
}

export function toPageSummary(input: PageSummaryInput): PageSummary {
  const { page, liveRelease } = input;
  return {
    id: page._id.toHexString(),
    siteId: page.siteId.toHexString(),
    title: page.title,
    slug: page.draft.slug,
    goal: page.goal,
    status: input.status,
    siteChanges: input.siteChanges,
    liveRelease: liveRelease ? toLiveReleaseRef(liveRelease) : null,
    latestVersion: page.releaseSeq,
    lastPointerEvent: input.lastPointerEvent,
    liveUrl: page.publishedSlug === null ? null : liveUrlOf(input.origin, page.publishedSlug),
    checks: input.checks,
    approval: input.approval,
    createdBy: input.createdBy,
    createdAt: page.createdAt.toISOString(),
    updatedAt: page.updatedAt.toISOString(),
  };
}

export function toDraft(page: PageRecord, updatedBy: UserRef): Draft {
  return {
    slug: page.draft.slug,
    composition: page.draft.composition,
    seo: page.draft.seo,
    revision: page.draft.revision,
    updatedAt: page.draft.updatedAt.toISOString(),
    updatedBy,
  };
}
