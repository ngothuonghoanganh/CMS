import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../../lib/api-core';
import { problemBesideFields, problemMessage, reportUnexpected } from './problem-message';
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

  it('says what is wrong with a refused field before the generic title', () => {
    const refused = new ApiError(422, {
      type: 'about:blank',
      title: 'Dữ liệu không hợp lệ',
      status: 422,
      code: 'validation_failed',
      issues: [
        { path: ['siteIds'], code: 'invalid', message: 'Biên tập toàn bộ làm việc trên mọi site' },
      ],
    });
    expect(problemMessage(refused)).toBe('Biên tập toàn bộ làm việc trên mọi site');
    // A rule of zod may carry its English default: the title stands instead.
    const tooLong = new ApiError(422, {
      type: 'about:blank',
      title: 'Dữ liệu không hợp lệ',
      status: 422,
      code: 'validation_failed',
      issues: [
        {
          path: ['phone'],
          code: 'too_big',
          message: 'Too big: expected string to have <=20 characters',
        },
      ],
    });
    expect(problemMessage(tooLong)).toBe('Dữ liệu không hợp lệ');
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

describe('problemBesideFields', () => {
  const refused = (paths: Array<Array<string | number>>) =>
    apiError(
      422,
      'validation_failed',
      'Dữ liệu không hợp lệ',
      paths.map((path) => ({ path, code: 'custom', message: `Sai ở ${path.join('.')}` })),
    );

  it('has nothing to add when every issue shows on a field of the form', () => {
    expect(
      problemBesideFields(refused([['name'], ['scope', 'siteIds']]), ['name', 'scope.siteIds']),
    ).toBeNull();
  });

  it('says what no field shows, such as a composition the registry refused', () => {
    expect(
      problemBesideFields(refused([['name'], ['composition', 'sections', 1, 'content']]), ['name']),
    ).toBe('Sai ở composition.sections.1.content');
  });

  it('says the problem itself without issues, and explains other failures', () => {
    expect(problemBesideFields(apiError(409, 'conflict', 'Dữ liệu đã thay đổi'), ['name'])).toBe(
      'Dữ liệu đã thay đổi',
    );
    expect(problemBesideFields(new TypeError('Failed to fetch'), ['name'])).toBe(
      'Không kết nối được máy chủ. Kiểm tra kết nối mạng rồi thử lại.',
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
