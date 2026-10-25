import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../../lib/api-core';
import { problemMessage, reportUnexpected } from './problem-message';
import { apiError } from './test-utils';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('problemMessage', () => {
  it('prefers the problem detail, then its title', () => {
    const conflict = apiError(409, 'conflict', 'Dữ liệu đã thay đổi');
    expect(problemMessage(conflict)).toBe('Dữ liệu đã thay đổi');
    const detailed = new ApiError(409, {
      type: 'about:blank',
      title: 'Dữ liệu đã thay đổi',
      status: 409,
      code: 'conflict',
      detail: 'Trang vừa được xuất bản bởi Minh',
    });
    expect(problemMessage(detailed)).toBe('Trang vừa được xuất bản bởi Minh');
  });

  it('explains network and unexpected failures', () => {
    expect(problemMessage(new TypeError('Failed to fetch'))).toBe(
      'Không kết nối được máy chủ. Kiểm tra kết nối mạng rồi thử lại.',
    );
    expect(problemMessage(new Error('boom'))).toBe(
      'Đã có lỗi không mong muốn. Hãy tải lại trang rồi thử lại.',
    );
  });
});

describe('reportUnexpected', () => {
  it('logs everything but expected API problems', () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    reportUnexpected('Saving failed', apiError(422, 'validation_failed', 'Dữ liệu không hợp lệ'));
    expect(log).not.toHaveBeenCalled();
    const failure = new Error('boom');
    reportUnexpected('Saving failed', failure);
    expect(log).toHaveBeenCalledWith('Saving failed', failure);
  });
});
