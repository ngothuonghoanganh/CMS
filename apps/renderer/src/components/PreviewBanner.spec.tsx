import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { PreviewBanner } from './PreviewBanner';

const EXPIRES_AT = '2026-10-31T08:00:00.000Z';

describe('PreviewBanner', () => {
  it('announces a draft preview with its expiry and the unpublished notice', () => {
    const html = renderToStaticMarkup(
      <PreviewBanner preview={{ kind: 'draft', version: null, expiresAt: EXPIRES_AT }} />,
    );
    expect(html).toMatch(/^<div role="status"/);
    expect(html).toContain('Bản xem trước');
    expect(html).toContain('Bản nháp');
    expect(html).toContain(`Hết hạn <time dateTime="${EXPIRES_AT}">31/10/2026 15:00</time>`);
    expect(html).toContain('Bản nháp này chưa được xuất bản và không hiển thị với khách truy cập.');
  });

  it('names the version of a release preview and never calls it unpublished', () => {
    // The previewed release may be the live one (History "Xem bản này" on the live card).
    const html = renderToStaticMarkup(
      <PreviewBanner preview={{ kind: 'release', version: 3, expiresAt: EXPIRES_AT }} />,
    );
    expect(html).toContain('Phiên bản v3');
    expect(html).toContain('Đây là phiên bản v3 đã xuất bản; trang live có thể khác.');
    expect(html).not.toContain('Bản nháp');
    expect(html).not.toContain('chưa được xuất bản');
    expect(html).not.toContain('không hiển thị với khách truy cập');
  });

  it('describes a release preview without a version number as published', () => {
    const html = renderToStaticMarkup(
      <PreviewBanner preview={{ kind: 'release', version: null, expiresAt: EXPIRES_AT }} />,
    );
    expect(html).toContain('Phiên bản đã xuất bản');
    expect(html).toContain('Đây là một phiên bản đã xuất bản; trang live có thể khác.');
    expect(html).not.toContain('chưa được xuất bản');
  });
});
