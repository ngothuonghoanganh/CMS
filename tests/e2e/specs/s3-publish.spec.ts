import { expect, test, type Page } from '@playwright/test';
import { Editor } from '../support/editor.js';
import { fetchPublic, firstHeading } from '../support/public-site.js';
import {
  createPageViaApi,
  promoPage,
  setUpLeadCaptureViaApi,
  setUpSite,
} from '../support/setup.js';
import { siteOrigin } from '../urls.js';

/** A signed-in owner on the editor of a fresh, never published promotion page at /uu-dai. */
async function openNewPage(page: Page) {
  const { site } = await setUpSite(page.request);
  // The promotion page has a lead form, which needs the site's consent settings (ADR-016).
  await setUpLeadCaptureViaApi(page.request, site.id);
  const created = await createPageViaApi(
    page.request,
    site.id,
    promoPage('uu-dai', 'Niềng răng trong suốt giảm 30%'),
  );
  const editor = new Editor(page);
  await editor.goto(site.id, created.page.id);
  return { site, pageId: created.page.id, editor };
}

test.describe('S3 · preview and publish', () => {
  test('fix a blocking error, ignore warnings, publish v1; later edits stay in the draft', async ({
    page,
    request,
  }) => {
    const { site, editor } = await openNewPage(page);
    expect((await fetchPublic(request, site.subdomain, '/uu-dai')).status).toBe(404);

    // A required field left empty blocks publishing, in the dialog as well as on the server.
    await editor.heroRow.click();
    await editor.heroHeadingField.fill('');
    await editor.heroHeadingField.blur();
    await editor.expectSaved();
    let dialog = await editor.openPublishDialog();
    await expect(
      dialog.getByRole('heading', { name: 'Kiểm tra trước khi xuất bản' }),
    ).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Xuất bản v1' })).toBeDisabled();
    await expect(dialog.getByText('Sửa 1 lỗi để xuất bản')).toBeVisible();

    // "Sửa ngay" closes the dialog and puts the cursor in the field to fix.
    await dialog.getByRole('button', { name: 'Sửa ngay' }).click();
    await expect(dialog).toBeHidden();
    await expect(editor.heroHeadingField).toBeFocused();
    await page.keyboard.type('Niềng răng trong suốt — v1');
    await page.keyboard.press('Tab');
    await expect(editor.heroCanvasHeading).toHaveText('Niềng răng trong suốt — v1');
    await editor.expectSaved();

    // Warnings are skipped one by one, and a skip can be taken back.
    dialog = await editor.openPublishDialog();
    await expect(dialog.getByRole('button', { name: 'Sửa ngay' })).toHaveCount(0);
    const publishV1 = dialog.getByRole('button', { name: 'Xuất bản v1' });
    await expect(publishV1).toBeDisabled();
    await expect(dialog.getByText(/^Sửa hoặc bỏ qua \d+ cảnh báo$/)).toBeVisible();
    const skip = dialog.getByRole('button', { name: 'Bỏ qua lần này' });
    const warnings = await skip.count();
    expect(warnings).toBeGreaterThan(0);
    await skip.first().click();
    await expect(dialog.getByRole('button', { name: 'Hoàn tác' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await expect(skip).toHaveCount(warnings - 1);
    await dialog.getByRole('button', { name: 'Hoàn tác' }).click();
    await expect(skip).toHaveCount(warnings);

    const done = await editor.publishFromDialog(dialog, 1, 'Bản đầu tiên');
    await expect(
      done.getByText('Khách truy cập đang thấy phiên bản mới.', { exact: false }),
    ).toBeVisible();
    const address = `${site.subdomain}.localhost:3101/uu-dai`;
    await expect(done.getByRole('img', { name: `Mã QR của ${address}` })).toBeVisible();
    // A member's own visit is not counted (ADR-019); the QR code keeps the address to share.
    await expect(done.getByRole('link', { name: /Mở trang live/ })).toHaveAttribute(
      'href',
      `${siteOrigin(site.subdomain)}/uu-dai?plp_internal=1`,
    );

    // The very next request to the public URL already serves v1.
    const live = await fetchPublic(request, site.subdomain, '/uu-dai');
    expect(live.status).toBe(200);
    expect(firstHeading(live.html)).toBe('Niềng răng trong suốt — v1');
    const visitor = await page.context().newPage();
    await visitor.goto(`${siteOrigin(site.subdomain)}/uu-dai`);
    await expect(visitor.getByRole('heading', { level: 1 })).toHaveText(
      'Niềng răng trong suốt — v1',
    );
    await expect(visitor.getByRole('link', { name: 'Nhận ưu đãi' }).first()).toHaveAttribute(
      'href',
      'tel:0901234567',
    );
    await visitor.close();

    await done.getByRole('button', { name: 'Tiếp tục chỉnh sửa' }).click();
    await expect(editor.topBar.getByText('Live v1', { exact: false })).toBeVisible();

    // Saving the draft does not change the live page.
    await editor.setHeroHeading('Niềng răng trong suốt — bản nháp mới');
    await expect(editor.topBar.getByText('Live v1 · 1 thay đổi chưa xuất bản')).toBeVisible();
    expect(firstHeading((await fetchPublic(request, site.subdomain, '/uu-dai')).html)).toBe(
      'Niềng răng trong suốt — v1',
    );

    // The dashboard tells live-with-changes apart.
    await page.goto(`/sites/${site.id}`);
    const row = page.getByRole('row', { name: /Ưu đãi niềng răng tháng 11/ });
    await expect(row.getByText('Live · Có thay đổi')).toBeVisible();
    await expect(row.getByText('1 thay đổi chưa xuất bản')).toBeVisible();
    await expect(row.getByText(/^v1 · /)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Có thay đổi · 1' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Live · 1' })).toBeVisible();
  });

  test('a preview link shows the draft with a banner, never indexed, never public', async ({
    page,
    request,
  }) => {
    const { site, editor } = await openNewPage(page);
    await editor.setHeroHeading('Bản nháp để khách duyệt');

    const popupOpened = page.waitForEvent('popup');
    await editor.topBar.getByRole('button', { name: 'Xem trước' }).click();
    const preview = await popupOpened;
    await expect(preview.getByText('Bản xem trước', { exact: false }).first()).toBeVisible();
    await expect(preview.getByRole('heading', { level: 1 })).toHaveText('Bản nháp để khách duyệt');
    expect(preview.url()).toMatch(new RegExp(`^${siteOrigin(site.subdomain)}/_preview/`));

    const response = await request.get(preview.url());
    expect(response.status()).toBe(200);
    expect(response.headers()['x-robots-tag']).toBe('noindex, nofollow');
    expect(response.headers()['cache-control']).toContain('no-store');
    expect(response.headers()['referrer-policy']).toBe('no-referrer');
    expect(await response.text()).toMatch(/<meta name="robots" content="noindex, ?nofollow"/);

    // The draft is never served at the public address, and a forged token is a 404.
    expect((await fetchPublic(request, site.subdomain, '/uu-dai')).status).toBe(404);
    const forged = await request.get(`${preview.url().slice(0, -4)}abcd`);
    expect(forged.status()).toBe(404);
    await preview.close();
  });
});
