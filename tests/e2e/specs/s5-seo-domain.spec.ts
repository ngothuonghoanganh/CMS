import { type APIRequestContext, expect, test } from '@playwright/test';
import { resolveResponseSchema, type ThemePresetId } from '@plp/contracts';
import { Editor } from '../support/editor.js';
import { fetchPublic } from '../support/public-site.js';
import {
  createPageViaApi,
  promoPage,
  setUpLeadCaptureViaApi,
  setUpSite,
} from '../support/setup.js';
import { siteOrigin, urls } from '../urls.js';

const SEO_TITLE = 'Niềng răng giảm 30% | Smile Care';
const SEO_DESCRIPTION = 'Ưu đãi niềng răng trong suốt tháng 11, tư vấn miễn phí.';

// Background of the "Tối" scheme the promotion page's footer uses, in the server-rendered HTML.
const MINT_FOOTER = '--plp-bg:#0B2E2A';
const SUNSET_FOOTER = '--plp-bg:#2B1510';

/** Theme of the live page straight from the API, behind any renderer cache. */
async function liveTheme(
  request: APIRequestContext,
  subdomain: string,
  slug: string,
): Promise<ThemePresetId> {
  const response = await request.get(
    `${urls.api}/public/sites/${subdomain}/resolve?path=${encodeURIComponent(slug)}`,
  );
  expect(response.status()).toBe(200);
  const resolved = resolveResponseSchema.parse(await response.json());
  if (resolved.kind !== 'page') {
    throw new Error(`Expected a page at "${slug}", got a redirect`);
  }
  return resolved.data.site.themePresetId;
}

test.describe('S5 · SEO, redirects, sitemap, robots and the default domain', () => {
  test('a new slug redirects the old URL after publishing; head, sitemap and robots follow', async ({
    page,
    request,
  }) => {
    const { site } = await setUpSite(page.request);
    // The promotion page has a lead form, which needs the site's consent settings (ADR-016).
    await setUpLeadCaptureViaApi(page.request, site.id);
    const origin = siteOrigin(site.subdomain);
    const created = await createPageViaApi(page.request, site.id, promoPage('uu-dai', 'Ưu đãi'));
    // A page that is never published stays out of the sitemap.
    await createPageViaApi(page.request, site.id, {
      title: 'Bản nháp chưa xuất bản',
      slug: 'ban-nhap',
      start: { kind: 'blank' },
    });
    const editor = new Editor(page);
    await editor.goto(site.id, created.page.id);
    await editor.setHeroHeading('Niềng răng trong suốt giảm 30%');
    await editor.publish(1);

    // SEO belongs to the draft: the form autosaves, and live changes only on publish.
    await editor.topBar.getByRole('link', { name: 'Cài đặt trang và SEO' }).click();
    const seo = page.getByRole('region', { name: 'Thiết lập SEO' });
    await seo.getByRole('textbox', { name: 'Đường dẫn trang' }).fill('uu-dai-thang-11');
    await expect(seo.getByText(/link cũ \/uu-dai sẽ tự chuyển/)).toBeVisible();
    await seo.getByRole('textbox', { name: 'Tiêu đề trên công cụ tìm kiếm' }).fill(SEO_TITLE);
    await seo.getByRole('textbox', { name: 'Mô tả ngắn' }).fill(SEO_DESCRIPTION);
    await expect(seo.getByRole('status')).toHaveText('Đã lưu bản nháp');
    const beforePublish = await fetchPublic(request, site.subdomain, '/uu-dai');
    expect(beforePublish.status).toBe(200);
    expect(beforePublish.html).not.toContain(SEO_TITLE);
    expect((await fetchPublic(request, site.subdomain, '/uu-dai-thang-11')).status).toBe(404);

    await page.getByRole('link', { name: 'Mở editor' }).click();
    await expect(editor.canvas).toBeVisible();
    await editor.publish(2, 'Đổi đường dẫn');

    // The old slug answers a permanent redirect to the new one, keeping an ad's campaign tags.
    const old = await fetchPublic(request, site.subdomain, '/uu-dai');
    expect(old.status).toBe(308);
    expect(old.location).toBe('/uu-dai-thang-11');
    const tagged = await fetchPublic(
      request,
      site.subdomain,
      '/uu-dai?utm_source=zalo&utm_medium=cpc&gclid=abc123',
    );
    expect(tagged.status).toBe(308);
    expect(tagged.location).toBe('/uu-dai-thang-11?utm_source=zalo&utm_medium=cpc&gclid=abc123');
    const visitor = await page.context().newPage();
    await visitor.goto(`${origin}/uu-dai`);
    await expect(visitor).toHaveURL(`${origin}/uu-dai-thang-11`);
    await expect(visitor).toHaveTitle(SEO_TITLE);
    await visitor.close();

    const live = await fetchPublic(request, site.subdomain, '/uu-dai-thang-11');
    expect(live.status).toBe(200);
    expect(live.html).toContain(`<title>${SEO_TITLE}</title>`);
    expect(live.html).toContain(`<meta name="description" content="${SEO_DESCRIPTION}"/>`);
    expect(live.html).toContain(`<link rel="canonical" href="${origin}/uu-dai-thang-11"/>`);
    expect(live.html).toContain(`<meta property="og:title" content="${SEO_TITLE}"/>`);
    expect(live.html).not.toMatch(/<meta name="robots" content="noindex/);

    const sitemap = await fetchPublic(request, site.subdomain, '/sitemap.xml');
    expect(sitemap.status).toBe(200);
    expect(sitemap.html).toContain(`<loc>${origin}/uu-dai-thang-11</loc>`);
    expect(sitemap.html).not.toContain(`<loc>${origin}/uu-dai</loc>`);
    expect(sitemap.html).not.toContain('/ban-nhap');
    const robots = await fetchPublic(request, site.subdomain, '/robots.txt');
    expect(robots.status).toBe(200);
    expect(robots.html).toContain(`Sitemap: ${origin}/sitemap.xml`);

    // Turning indexing off removes the page from the sitemap once published.
    await editor.topBar.getByRole('link', { name: 'Cài đặt trang và SEO' }).click();
    await seo
      .getByRole('switch', { name: 'Cho phép hiện trên Google và công cụ tìm kiếm' })
      .click();
    await expect(seo.getByRole('status')).toHaveText('Đã lưu bản nháp');
    await page.getByRole('link', { name: 'Mở editor' }).click();
    await editor.publish(3, 'Ẩn khỏi Google');
    expect((await fetchPublic(request, site.subdomain, '/sitemap.xml')).html).not.toContain(
      '<loc>',
    );
    expect((await fetchPublic(request, site.subdomain, '/uu-dai-thang-11')).html).toMatch(
      /<meta name="robots" content="noindex/,
    );
  });

  test('a new site theme reaches a live page only when the page is published again', async ({
    page,
    request,
  }) => {
    const { site } = await setUpSite(page.request);
    // The promotion page has a lead form, which needs the site's consent settings (ADR-016).
    await setUpLeadCaptureViaApi(page.request, site.id);
    const created = await createPageViaApi(page.request, site.id, promoPage('uu-dai', 'Ưu đãi'));
    const editor = new Editor(page);
    await editor.goto(site.id, created.page.id);
    await editor.publish(1);
    const published = await fetchPublic(request, site.subdomain, '/uu-dai');
    expect(published.status).toBe(200);
    expect(published.html).toContain(MINT_FOOTER);

    // The owner switches the theme in the site settings.
    await page.goto(`/sites/${site.id}/settings`);
    await page.getByRole('radio', { name: 'Hoàng hôn' }).click();
    await page.getByRole('button', { name: 'Lưu cài đặt' }).click();
    await expect(
      page
        .getByRole('status')
        .filter({ hasText: 'Trang nào đang live sẽ giữ giao diện cũ cho tới khi bạn xuất bản' }),
    ).toBeVisible();

    // Saving is not publishing (ADR-015): the very next request still gets the published look,
    // and so does the API behind the renderer's cache.
    const saved = await fetchPublic(request, site.subdomain, '/uu-dai');
    expect(saved.html).toContain(MINT_FOOTER);
    expect(saved.html).not.toContain(SUNSET_FOOTER);
    expect(await liveTheme(request, site.subdomain, 'uu-dai')).toBe('mint');

    // The dashboard reminds that the live page keeps the old look; the page is still "Live".
    await page.goto(`/sites/${site.id}`);
    const row = page.getByRole('row').filter({ hasText: 'Ưu đãi niềng răng tháng 11' });
    await expect(row.getByText('Giao diện site đã đổi · xuất bản lại để áp dụng')).toBeVisible();

    // Publishing the unchanged draft applies the new theme.
    await editor.goto(site.id, created.page.id);
    await expect(editor.topBar.getByText('Live v1 · Giao diện site đã đổi')).toBeVisible();
    // The draft notice says so too; only the visible notice counts, as a hidden copy of the
    // screen can exist while it loads.
    await expect(
      page.getByText(/Giao diện site đã đổi sau khi xuất bản v1/).filter({ visible: true }),
    ).toBeVisible();
    const dialog = await editor.openPublishDialog();
    await expect(
      dialog.getByRole('list', { name: 'Các thay đổi' }).getByRole('listitem'),
    ).toHaveText(['Giao diện site: giao diện']);
    const done = await editor.publishFromDialog(dialog, 2);
    await done.getByRole('button', { name: 'Tiếp tục chỉnh sửa' }).click();
    await expect(editor.topBar.getByText('Live v2', { exact: true })).toBeVisible();

    const republished = await fetchPublic(request, site.subdomain, '/uu-dai');
    expect(republished.status).toBe(200);
    expect(republished.html).toContain(SUNSET_FOOTER);
    expect(republished.html).not.toContain(MINT_FOOTER);
    expect(await liveTheme(request, site.subdomain, 'uu-dai')).toBe('sunset');

    // The history says what v2 changed.
    await editor.topBar.getByRole('link', { name: 'Lịch sử phiên bản' }).click();
    const v2 = page
      .getByRole('listitem')
      .filter({ has: page.getByRole('heading', { name: 'v2', exact: true }) });
    await expect(v2).toContainText('ĐANG LIVE');
    await expect(v2).toContainText('Giao diện site: giao diện');
  });

  test('the image picker fits a phone screen', async ({ page }) => {
    const { site } = await setUpSite(page.request);
    await page.setViewportSize({ width: 360, height: 780 });
    await page.goto(`/sites/${site.id}/settings`);
    await page
      .getByRole('group', { name: 'Logo' })
      .getByRole('button', { name: 'Chọn ảnh' })
      .click();
    const dialog = page.getByRole('dialog', { name: 'Chọn ảnh' });
    await expect(dialog.getByText('Tải ảnh mới')).toBeVisible();
    // Nothing in the dialog reaches past its right edge, and nothing scrolls sideways.
    const overflow = await dialog.evaluate((element) => {
      const edge = element.getBoundingClientRect().right;
      const past = [...element.querySelectorAll('*')].filter(
        (child) => child.getBoundingClientRect().right > edge + 0.5,
      );
      const sideways = [element, ...element.querySelectorAll('*')].filter(
        (node) =>
          node.scrollWidth > node.clientWidth + 1 && getComputedStyle(node).overflowX !== 'visible',
      );
      return { past: past.length, sideways: sideways.length };
    });
    expect(overflow).toEqual({ past: 0, sideways: 0 });
  });

  test('the domain screen shows the default domain only', async ({ page }) => {
    const { site } = await setUpSite(page.request);
    const host = `${site.subdomain}.localhost:3101`;
    await page.goto(`/sites/${site.id}`);
    await page
      .getByRole('navigation', { name: 'Điều hướng chính' })
      .getByRole('link', { name: 'Tên miền' })
      .click();
    await expect(page).toHaveURL(new RegExp(`/sites/${site.id}/domain$`));

    const card = page.getByRole('region', { name: 'Tên miền đang dùng' });
    await expect(card.getByText(host, { exact: true })).toBeVisible();
    await expect(card.getByText('MẶC ĐỊNH · MIỄN PHÍ')).toBeVisible();
    await expect(card.getByText('Luôn hoạt động')).toBeVisible();
    await expect(page.getByText('Kết nối tên miền riêng sẽ có ở phiên bản sau.')).toBeVisible();
    // Custom domains are out of MVP A (ARCHITECTURE §2.1).
    await expect(page.getByRole('button', { name: /Thêm tên miền/ })).toHaveCount(0);
  });
});
