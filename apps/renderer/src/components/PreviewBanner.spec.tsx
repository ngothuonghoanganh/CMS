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
    expect(html).toContain('Trang này chưa được xuất bản và không hiển thị với khách truy cập.');
  });

  it('names the version of a release preview', () => {
    const html = renderToStaticMarkup(
      <PreviewBanner preview={{ kind: 'release', version: 3, expiresAt: EXPIRES_AT }} />,
    );
    expect(html).toContain('Phiên bản v3');
    expect(html).not.toContain('Bản nháp');
  });
});
