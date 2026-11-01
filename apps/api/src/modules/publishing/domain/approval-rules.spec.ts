import { describe, expect, it } from 'vitest';
import { approvalPurgeAt, visibleApproval } from './approval-rules.js';

describe('visibleApproval', () => {
  // Refused while the page had 3 releases.
  const refused = { status: 'rejected' as const, releaseSeq: 3 };

  it('shows a pending request whatever was published', () => {
    const pending = { status: 'pending' as const, releaseSeq: null };
    expect(visibleApproval(pending, 0)).toBe(true);
    expect(visibleApproval(pending, 9)).toBe(true);
  });

  it('shows a refusal until the page is published again after it', () => {
    expect(visibleApproval(refused, 3)).toBe(true);
    expect(visibleApproval(refused, 4)).toBe(false);
    expect(visibleApproval(refused, 7)).toBe(false);
  });

  it('keeps a refusal of a page never published, or rolled back from that same draft', () => {
    expect(visibleApproval({ status: 'rejected', releaseSeq: 0 }, 0)).toBe(true);
  });

  it('shows a refusal stored before release counts were kept', () => {
    expect(visibleApproval({ status: 'rejected' }, 5)).toBe(true);
    expect(visibleApproval({ status: 'rejected', releaseSeq: null }, 5)).toBe(true);
  });

  it('shows nothing for a published or withdrawn request, or none', () => {
    expect(visibleApproval({ status: 'published', releaseSeq: null }, 4)).toBe(false);
    expect(visibleApproval({ status: 'withdrawn', releaseSeq: null }, 0)).toBe(false);
    expect(visibleApproval(null, 0)).toBe(false);
  });
});

describe('approvalPurgeAt', () => {
  it('keeps a closed request 30 days', () => {
    expect(approvalPurgeAt(new Date('2026-11-01T00:00:00.000Z'))).toEqual(
      new Date('2026-12-01T00:00:00.000Z'),
    );
  });
});
