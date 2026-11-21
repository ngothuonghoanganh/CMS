import { describe, expect, it } from 'vitest';
import { dialogTemplateOf, hasUpdate, licenceSourceLabel, updateSentence } from './owned-items';

describe('board 32 rows', () => {
  it('names where the licence came from', () => {
    expect(licenceSourceLabel('purchase')).toBe('Payload · Đã mua');
    expect(licenceSourceLabel('free')).toBe('Payload · Miễn phí');
  });

  it('offers an update only when a later version exists', () => {
    expect(hasUpdate({ newVersions: [] })).toBe(false);
    expect(
      hasUpdate({
        newVersions: [{ version: 2, releasedOn: '2026-12-01', note: 'Thêm lịch lớp.' }],
      }),
    ).toBe(true);
  });

  it('creates pages from the version of the licence', () => {
    expect(
      dialogTemplateOf({
        itemId: 'mp-khai-truong-phong-tap',
        version: 1,
        name: 'Khai trương',
        hasForm: true,
      }),
    ).toEqual({
      id: 'mp-khai-truong-phong-tap',
      source: 'marketplace',
      version: 1,
      name: 'Khai trương',
      hasForm: true,
    });
  });

  it('says the pages already made stay as they are', () => {
    expect(updateSentence(2, 3)).toBe(
      '2 trang đã tạo từ mẫu này không đổi. Chỉ trang tạo mới từ giờ dùng v3.',
    );
    expect(updateSentence(0, 2)).toBe(
      'Chưa có trang nào tạo từ mẫu này. Chỉ trang tạo mới từ giờ dùng v2.',
    );
  });
});
