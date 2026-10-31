import { expect, test } from '@playwright/test';
import { endpoints, previewLinkResponseSchema } from '@plp/contracts';
import { seedBoard } from '../support/board.js';
import { call } from '../support/setup.js';
import { siteOrigin, urls } from '../urls.js';

/*
 * What the third test round changed around the admin and the renderer, end to end: no cached
 * screen after logging out, the admin's response headers, the CSV export's headers, the page
 * list at 900 px, and the renderer's answer while the API is down.
 */

test.describe('Third round · admin and renderer', () => {
  test('after "Đăng xuất", Back shows the login page, never the open lead', async ({ page }) => {
    const board = await seedBoard(page.request);
    const name = 'Nguyễn Thu Hà';
    // Dashboard → Leads → the lead, as people get there: the browser history holds each screen.
    await page.goto(`/sites/${board.site.id}`);
    await page
      .getByRole('navigation', { name: 'Điều hướng chính' })
      .getByRole('link', { name: /^Leads/ })
      .click();
    await page.getByRole('link', { name }).click();
    const detail = page.getByRole('complementary', { name });
    await expect(detail.getByText('0901 234 567')).toBeVisible();

    await page.getByRole('button', { name: 'Ngọc Anh Owner' }).click();
    await page.getByRole('menuitem', { name: 'Đăng xuất' }).click();
    await expect(page).toHaveURL(/\/login$/);

    // Every admin page goes out with no-store and the session is gone: Back asks the server
    // again, which wants a login. Neither a cached screen nor the lead's data shows.
    await page.goBack();
    await expect(page).toHaveURL(new RegExp(`/login\\?next=%2Fsites%2F${board.site.id}`));
    await expect(page.getByRole('button', { name: 'Đăng nhập' })).toBeVisible();
    await expect(page.getByText(name)).toHaveCount(0);
    await expect(page.getByText('0901 234 567')).toHaveCount(0);
  });

  test('admin pages are never cached nor framed; the CSV export is never sniffed', async ({
    page,
  }) => {
    const board = await seedBoard(page.request);
    const response = await page.goto(`/sites/${board.site.id}`);
    const headers = response?.headers() ?? {};
    expect(headers['cache-control']).toContain('no-store');
    expect(headers['content-security-policy']).toContain("frame-ancestors 'none'");
    expect(headers['x-frame-options']).toBe('DENY');

    await page.goto(`/sites/${board.site.id}/leads?range=all`);
    const exported = page.waitForResponse(
      (answer) => answer.url().endsWith('/leads/export') && answer.request().method() === 'POST',
    );
    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Xuất Excel / CSV' }).click();
    const csv = await exported;
    expect(csv.status()).toBe(200);
    expect(csv.headers()['content-type']).toContain('text/csv');
    expect(csv.headers()['x-content-type-options']).toBe('nosniff');
    expect(csv.headers()['cache-control']).toContain('no-store');
    expect((await download).suggestedFilename()).toMatch(/\.csv$/);
  });

  test('at 900 px every row of the page list shows "Sửa" without sideways scrolling', async ({
    page,
  }) => {
    const board = await seedBoard(page.request);
    await page.setViewportSize({ width: 900, height: 1000 });
    await page.goto(`/sites/${board.site.id}`);
    const rows = page.getByRole('row').filter({ has: page.getByRole('link', { name: 'Sửa' }) });
    await expect(rows).toHaveCount(6);
    const table = page.getByRole('table');
    const overflow = await table.evaluate((element) => {
      const scroller = element.parentElement;
      return scroller === null ? 0 : scroller.scrollWidth - scroller.clientWidth;
    });
    expect(overflow).toBeLessThanOrEqual(0);
    const tableBox = await table.boundingBox();
    for (const edit of await page.getByRole('link', { name: 'Sửa' }).all()) {
      const box = await edit.boundingBox();
      expect(box).not.toBeNull();
      expect((box?.x ?? 0) + (box?.width ?? 0)).toBeLessThanOrEqual(
        (tableBox?.x ?? 0) + (tableBox?.width ?? 0),
      );
    }
    const page900 = await page.evaluate(() => ({
      scroll: document.documentElement.scrollWidth,
      client: document.documentElement.clientWidth,
    }));
    expect(page900.scroll).toBeLessThanOrEqual(page900.client);
  });

  test('while the API is down the renderer answers 503 with Retry-After', async ({
    page,
    request,
  }) => {
    const board = await seedBoard(page.request);
    const preview = await call(
      page.request,
      'POST',
      endpoints.createPreviewLink.path(board.pages.promo.id),
      previewLinkResponseSchema,
      { kind: 'draft' },
    );
    const origin = siteOrigin(board.site.subdomain, urls.rendererWithoutApi);
    for (const path of ['/', '/uu-dai-thang-11?utm_source=facebook']) {
      const response = await request.get(`${origin}${path}`, { maxRedirects: 0 });
      expect(response.status(), path).toBe(503);
      expect(response.headers()['retry-after']).toBe('60');
      expect(response.headers()['cache-control']).toBe('no-store');
      expect(await response.text()).toContain('Trang tạm thời chưa mở được');
    }
    // A preview stays out of search engines even then (ADR-010).
    const unavailablePreview = await request.get(`${origin}${new URL(preview.url).pathname}`, {
      maxRedirects: 0,
    });
    expect(unavailablePreview.status()).toBe(503);
    expect(unavailablePreview.headers()['retry-after']).toBe('60');
    expect(await unavailablePreview.text()).toContain(
      '<meta name="robots" content="noindex, nofollow">',
    );
    for (const file of ['/sitemap.xml', '/robots.txt']) {
      const response = await request.get(`${origin}${file}`);
      expect(response.status(), file).toBe(503);
      expect(response.headers()['retry-after']).toBe('60');
    }
  });
});
