import { expect, test } from '@playwright/test';
import { Editor } from '../support/editor.js';
import { fetchPublic } from '../support/public-site.js';
import { createPageViaApi, promoPage, setUpSite } from '../support/setup.js';
import { siteOrigin } from '../urls.js';

const SEO_TITLE = 'Niềng răng giảm 30% | Smile Care';
const SEO_DESCRIPTION = 'Ưu đãi niềng răng trong suốt tháng 11, tư vấn miễn phí.';

test.describe('S5 · SEO, redirects, sitemap, robots and the default domain', () => {
  test('a new slug redirects the old URL after publishing; head, sitemap and robots follow', async ({
    page,
    request,
  }) => {
    const { site } = await setUpSite(page.request);
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

    // The old slug answers a permanent redirect to the new one.
    const old = await fetchPublic(request, site.subdomain, '/uu-dai');
    expect(old.status).toBe(308);
    expect(old.location).toBe('/uu-dai-thang-11');
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
