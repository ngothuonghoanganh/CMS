import { describe, expect, it } from 'vitest';
import { ApiError } from '../../lib/api-core';
import { apiError } from '../shell/test-utils';
import { planProblemOf } from './plan-problem';

function withContext(error: ApiError, context: Record<string, unknown>): ApiError {
  return new ApiError(error.status, { ...error.problem, context });
}

describe('planProblemOf', () => {
  it('reads which limit a 402 reached', () => {
    const error = withContext(apiError(402, 'plan_limit_reached', 'Đã dùng hết hạn mức'), {
      limit: 'sites',
      max: 5,
    });
    expect(planProblemOf(error)).toEqual({ kind: 'limit', limit: 'sites', max: 5 });
  });

  it('reads which feature a 402 needs, and why a workspace is read-only', () => {
    const feature = withContext(apiError(402, 'plan_feature_required', 'Chưa có'), {
      feature: 'automation',
    });
    expect(planProblemOf(feature)).toEqual({ kind: 'feature', feature: 'automation' });
    const readOnly = withContext(apiError(402, 'workspace_read_only', 'Chỉ đọc'), {
      state: 'trial_expired',
    });
    expect(planProblemOf(readOnly)).toEqual({ kind: 'read_only', state: 'trial_expired' });
  });

  it('still tells a plan problem without its context', () => {
    expect(planProblemOf(apiError(402, 'plan_limit_reached', 'Hết'))).toEqual({
      kind: 'limit',
      limit: null,
      max: null,
    });
  });

  it('leaves a missing permission, other API problems and other errors alone', () => {
    expect(planProblemOf(apiError(403, 'forbidden', 'Không có quyền'))).toBeNull();
    expect(planProblemOf(apiError(409, 'plan_change_unavailable', 'Chưa đổi được'))).toBeNull();
    expect(planProblemOf(new TypeError('network'))).toBeNull();
  });
});
