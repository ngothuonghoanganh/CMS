import { describe, expect, it } from 'vitest';
import { approvalPurgeAt, visibleApproval } from './approval-rules.js';

describe('visibleApproval', () => {
  it('shows a pending request whatever is live', () => {
    expect(visibleApproval({ status: 'pending', revision: 4 }, null)).toBe(true);
    expect(visibleApproval({ status: 'pending', revision: 4 }, 9)).toBe(true);
  });

  it('shows a refusal until a draft at least as new goes live', () => {
    expect(visibleApproval({ status: 'rejected', revision: 4 }, null)).toBe(true);
    expect(visibleApproval({ status: 'rejected', revision: 4 }, 3)).toBe(true);
    expect(visibleApproval({ status: 'rejected', revision: 4 }, 4)).toBe(false);
    expect(visibleApproval({ status: 'rejected', revision: 4 }, 7)).toBe(false);
  });

  it('shows nothing for a published or withdrawn request, or none', () => {
    expect(visibleApproval({ status: 'published', revision: 4 }, 4)).toBe(false);
    expect(visibleApproval({ status: 'withdrawn', revision: 4 }, null)).toBe(false);
    expect(visibleApproval(null, null)).toBe(false);
  });
});

describe('approvalPurgeAt', () => {
  it('keeps a closed request 30 days', () => {
    expect(approvalPurgeAt(new Date('2026-11-01T00:00:00.000Z'))).toEqual(
      new Date('2026-12-01T00:00:00.000Z'),
    );
  });
});
