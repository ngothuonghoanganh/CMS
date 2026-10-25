import { expect, test } from '@playwright/test';
import { Editor } from '../support/editor.js';
import { fetchPublic, firstHeading } from '../support/public-site.js';
import {
  createPageViaApi,
  promoPage,
  setUpLeadCaptureViaApi,
  setUpSite,
} from '../support/setup.js';

const TITLE = 'Ưu đãi niềng răng tháng 11';
const V1 = 'Niềng răng trong suốt — v1';
const V2 = 'Niềng răng trong suốt — v2';

test.describe('S4 · history, rollback, undo and unpublish', () => {
  test('roll back to v1 with a reason, undo, read it on the dashboard, then unpublish', async ({
    page,
    request,
  }) => {
    const { site } = await setUpSite(page.request);
    // The promotion page has a lead form, which needs the site's consent settings (ADR-016).
    await setUpLeadCaptureViaApi(page.request, site.id);
    const created = await createPageViaApi(page.request, site.id, promoPage('uu-dai', 'Ưu đãi'));
    const editor = new Editor(page);
    await editor.goto(site.id, created.page.id);
    const liveHeading = async () =>
      firstHeading((await fetchPublic(request, site.subdomain, '/uu-dai')).html);

    await editor.setHeroHeading(V1);
    await editor.publish(1, 'Bản đầu tiên');
    await editor.setHeroHeading(V2);
    await editor.publish(2, 'Bản 2 tăng giá');
    expect(await liveHeading()).toBe(V2);

    // History: v2 is live; v1 is restored after a confirmation that needs a reason.
    await editor.topBar.getByRole('link', { name: 'Lịch sử phiên bản' }).click();
    await expect(page.getByRole('heading', { name: 'Phiên bản đã xuất bản' })).toBeVisible();
    const release = (version: string) =>
      page
        .getByRole('listitem')
        .filter({ has: page.getByRole('heading', { name: version, exact: true }) });
    await expect(release('v2')).toContainText('ĐANG LIVE');
    await expect(release('v2')).toContainText('Bản 2 tăng giá');
    await expect(release('v1')).toContainText('Bản đầu tiên');

    await release('v1').getByRole('button', { name: 'Khôi phục bản này' }).click();
    const panel = page.getByRole('region', { name: 'Khôi phục v1 thành bản live?' });
    await expect(
      panel.getByRole('heading', { name: 'Khôi phục v1 thành bản live?' }),
    ).toBeFocused();
    await expect(panel).toContainText('Live bây giờ');
    await expect(panel).toContainText('Sẽ live');
    const confirm = panel.getByRole('button', { name: 'Khôi phục v1' });
    await expect(confirm).toBeDisabled();
    await panel.getByRole('textbox', { name: /^Lý do/ }).fill('Bản 2 sai giá');
    await confirm.click();

    const banner = page.getByRole('status').filter({ hasText: 'v1 đang live' });
    await expect(banner).toBeVisible();
    expect(await liveHeading()).toBe(V1);
    // The rollback is an entry of its own, with its reason.
    const restored = release('v1').filter({ hasText: 'KHÔI PHỤC' });
    await expect(restored).toContainText('Chuyển trang live từ v2 sang v1');
    await expect(restored).toContainText('Lý do: Bản 2 sai giá');

    // Undo moves the pointer back to v2.
    await banner.getByRole('button', { name: 'Hoàn tác khôi phục' }).click();
    await expect(banner).toBeHidden();
    expect(await liveHeading()).toBe(V2);

    // Every pointer move is a sentence on the dashboard, newest first.
    await page.goto(`/sites/${site.id}`);
    const activity = page.getByRole('region', { name: 'Hoạt động xuất bản gần đây' });
    const lines = activity.getByRole('listitem');
    await expect(lines.nth(0)).toContainText(`Ngọc Anh hoàn tác khôi phục “${TITLE}”`);
    await expect(lines.nth(1)).toContainText(`Ngọc Anh khôi phục “${TITLE}” từ v2 về v1`);
    await expect(lines.nth(2)).toContainText(`Ngọc Anh xuất bản v2 của “${TITLE}”`);
    await expect(lines.nth(3)).toContainText(`Ngọc Anh xuất bản v1 của “${TITLE}”`);

    // Unpublish from the row menu, with a reason: the public URL answers 404 again.
    const menu = page.getByRole('button', { name: `Tùy chọn khác cho ${TITLE}` });
    await menu.click();
    await page.getByRole('menuitem', { name: 'Gỡ xuất bản' }).click();
    const unpublish = page.getByRole('alertdialog');
    await unpublish.getByRole('textbox').fill('Hết chương trình');
    await unpublish.getByRole('button', { name: 'Gỡ xuất bản' }).click();
    await expect(unpublish).toBeHidden();
    await expect(menu).toBeFocused();

    const row = page.getByRole('row', { name: new RegExp(TITLE) });
    await expect(row.getByText('Đã gỡ', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Đã gỡ · 1' })).toBeVisible();
    await expect(lines.nth(0)).toContainText(`Ngọc Anh gỡ xuất bản “${TITLE}”`);
    const gone = await fetchPublic(request, site.subdomain, '/uu-dai');
    expect(gone.status).toBe(404);
    expect(gone.html).toContain('Trang bạn tìm không tồn tại');
  });
});
