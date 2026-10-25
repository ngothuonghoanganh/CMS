import type { ReleaseSummary, UserRef } from '@plp/contracts';
import type { ReleaseRecord } from './release.schema.js';

export const RELEASE_NOT_FOUND = 'Không tìm thấy phiên bản';

/** The contract view of a release; its content stays out of lists. */
export function toReleaseSummary(release: ReleaseRecord, createdBy: UserRef): ReleaseSummary {
  return {
    id: release._id.toHexString(),
    pageId: release.pageId.toHexString(),
    version: release.version,
    slug: release.slug,
    note: release.note,
    changeSummary: release.changeSummary.map((change) => ({
      kind: change.kind,
      label: change.label,
      sectionId: change.sectionId,
    })),
    sourceRevision: release.sourceRevision,
    createdBy,
    createdAt: release.createdAt.toISOString(),
  };
}
