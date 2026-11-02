import { describe, expect, it } from 'vitest';
import { imageNeedsOf, readinessItems, setupGap } from './readiness';
import { detailFixture, readinessFixture } from './test-fixtures';

const dental = detailFixture('nha-khoa-uu-dai');

function lines(input: Parameters<typeof readinessItems>[0]): string[] {
  return readinessItems(input).map((item) => `${item.title} · ${item.text} [${item.tone}]`);
}

describe('readinessItems', () => {
  it('says what a ready site has, as board 18 does', () => {
    expect(
      lines({
        hasForm: true,
        composition: dental.composition,
        siteName: 'Smile Care',
        site: readinessFixture(),
      }),
    ).toEqual([
      'Nơi nhận lead · Smile Care đã có ngocanh@mayxanh.vn [ready]',
      'Nội dung đồng ý · Smile Care đang dùng phiên bản 3 [ready]',
      'Ảnh của bạn · mẫu để trống khung ảnh, nên thêm ảnh thật của bạn [info]',
    ]);
  });

  it('counts the recipients for a role that does not see them, and the others for one that does', () => {
    const items = (site: Parameters<typeof readinessFixture>[0]) =>
      readinessItems({
        hasForm: true,
        composition: dental.composition,
        siteName: 'Smile Care',
        site: readinessFixture(site),
      })[0]?.text;
    expect(items({ recipientEmail: null, confirmedRecipients: 2 })).toBe(
      'Smile Care đã có 2 email nhận lead đã xác nhận',
    );
    expect(items({ confirmedRecipients: 3 })).toBe(
      'Smile Care đã có ngocanh@mayxanh.vn và 2 email khác',
    );
  });

  it('says what a site still misses', () => {
    expect(
      lines({
        hasForm: true,
        composition: dental.composition,
        siteName: 'Bếp Nhà Mây',
        site: readinessFixture({
          confirmedRecipients: 0,
          recipientEmail: null,
          consentVersion: null,
          consentGaps: ['privacy', 'consent'],
        }),
      }).slice(0, 2),
    ).toEqual([
      'Nơi nhận lead · Bếp Nhà Mây chưa có email nhận lead đã xác nhận [missing]',
      'Nội dung đồng ý · Bếp Nhà Mây chưa có đơn vị thu thập dữ liệu và link chính sách, chưa có nội dung đồng ý [missing]',
    ]);
    expect(
      readinessItems({
        hasForm: true,
        composition: dental.composition,
        siteName: 'Bếp Nhà Mây',
        site: readinessFixture({ consentVersion: null, consentGaps: ['consent'] }),
      })[1]?.text,
    ).toBe('Bếp Nhà Mây chưa có nội dung đồng ý');
  });

  it('tells what any site needs when there is none to check', () => {
    expect(
      lines({ hasForm: true, composition: dental.composition, siteName: null, site: null }).slice(
        0,
        2,
      ),
    ).toEqual([
      'Nơi nhận lead · site cần một email nhận lead đã xác nhận [info]',
      'Nội dung đồng ý · site cần nội dung đồng ý ở mục “Dữ liệu & đồng ý” [info]',
    ]);
  });

  it('asks nothing of the form for a template without one, and requires the photos it needs', () => {
    const fitness = detailFixture('phong-tap-ca-nhan');
    expect(
      lines({
        hasForm: false,
        composition: fitness.composition,
        siteName: 'Smile Care',
        site: readinessFixture(),
      }),
    ).toEqual([
      'Ảnh của bạn · mẫu để trống khung ảnh; ảnh bắt buộc phải có trước khi xuất bản [info]',
    ]);
  });
});

describe('imageNeedsOf', () => {
  it('looks at the frames the variants show only', () => {
    expect(imageNeedsOf(detailFixture('phong-tap-ca-nhan').composition)).toEqual({
      any: true,
      required: true,
    });
    expect(imageNeedsOf(dental.composition)).toEqual({ any: true, required: false });
    // A centered Hero, a form and a grid show no image at all.
    expect(imageNeedsOf(detailFixture('bat-dong-san-danh-sach-cho').composition)).toEqual({
      any: false,
      required: false,
    });
  });
});

describe('setupGap', () => {
  it('names what the site misses for the form, and nothing otherwise', () => {
    const empty = readinessFixture({
      confirmedRecipients: 0,
      recipientEmail: null,
      consentVersion: null,
      consentGaps: ['privacy', 'consent'],
    });
    expect(setupGap(true, 'Bếp Nhà Mây', empty)).toBe(
      'Bếp Nhà Mây chưa có nơi nhận lead và nội dung đồng ý.',
    );
    expect(setupGap(true, 'Bếp Nhà Mây', { ...empty, confirmedRecipients: 1 })).toBe(
      'Bếp Nhà Mây chưa có nội dung đồng ý.',
    );
    expect(setupGap(true, 'Bếp Nhà Mây', { ...readinessFixture(), confirmedRecipients: 0 })).toBe(
      'Bếp Nhà Mây chưa có nơi nhận lead.',
    );
    expect(setupGap(true, 'Smile Care', readinessFixture())).toBeNull();
    expect(setupGap(false, 'Bếp Nhà Mây', empty)).toBeNull();
  });
});
