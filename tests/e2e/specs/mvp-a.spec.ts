import { expect, test } from '@playwright/test';
import { Editor } from '../support/editor.js';
import { createSiteThroughForm, signUpThroughForm } from '../support/flows.js';
import { fetchPublic, firstHeading } from '../support/public-site.js';
import { newAccount, newSubdomain } from '../support/setup.js';
import { siteOrigin } from '../urls.js';

const V1 = 'Niềng răng trong suốt giảm 30%';
const DRAFT = 'Niềng răng trong suốt — bản nháp v2';

/** ARCHITECTURE §5: MVP A is done when this whole chain passes in one go. */
test('MVP A: sign up → site → page by goal → edit → preview → publish v1 → v2 → rollback → undo', async ({
  page,
  request,
}) => {
  // 1. Sign up, create a site, create a page by goal, edit it, preview it.
  await signUpThroughForm(page, newAccount());
  const subdomain = newSubdomain('mvpa');
  const origin = siteOrigin(subdomain);
  await createSiteThroughForm(page, { name: 'Nha khoa Smile Care', subdomain });
  await page.getByRole('link', { name: 'Tạo trang đầu tiên' }).click();
  await page.getByRole('radio', { name: 'Ưu đãi có thời hạn' }).check();
  await page.getByRole('button', { name: 'Tiếp tục' }).click();
  await page.getByLabel('Tên trang').fill('Ưu đãi niềng răng tháng 11');
  await page.getByLabel('Đường dẫn').fill('uu-dai');
  await expect(page.getByText('Đường dẫn này dùng được.')).toBeVisible();
  await page.getByLabel('Ưu đãi hoặc dịch vụ chính · tùy chọn').fill(V1);
  await page
    .getByLabel('Số điện thoại nhận khách (gọi điện hoặc Zalo) · tùy chọn')
    .fill('0901 234 567');
  await page.getByRole('button', { name: 'Tiếp tục' }).click();
  await page.getByRole('radio', { name: 'Nhẹ nhàng' }).check();
  await page.getByRole('button', { name: 'Tạo trang' }).click();

  const editor = new Editor(page);
  await expect(editor.heroCanvasHeading).toHaveText(V1);
  await editor.structure
    .getByRole('button', { name: /^Lợi ích/ })
    .filter({ hasNotText: 'Kéo' })
    .click();
  const benefits = page.getByRole('complementary', { name: 'Lợi ích' });
  await benefits.getByRole('textbox', { name: 'Tiêu đề' }).first().fill('Ưu đãi gồm những gì');
  await benefits.getByRole('textbox', { name: 'Tiêu đề' }).first().blur();
  await editor.expectSaved();

  const popupOpened = page.waitForEvent('popup');
  await editor.topBar.getByRole('button', { name: 'Xem trước' }).click();
  const preview = await popupOpened;
  await expect(preview.getByText('Bản xem trước', { exact: false }).first()).toBeVisible();
  await expect(preview.getByRole('heading', { level: 1 })).toHaveText(V1);
  await expect(preview.getByRole('heading', { name: 'Ưu đãi gồm những gì' })).toBeVisible();
  await preview.close();

  // 2. Publish v1: the public URL serves v1.
  await editor.publish(1, 'Bản đầu tiên');
  const v1 = await fetchPublic(request, subdomain, '/uu-dai');
  expect(v1.status).toBe(200);
  expect(firstHeading(v1.html)).toBe(V1);
  const visitor = await page.context().newPage();
  await visitor.goto(`${origin}/uu-dai`);
  await expect(visitor.getByRole('heading', { level: 1 })).toHaveText(V1);
  await expect(visitor.getByRole('heading', { name: 'Ưu đãi gồm những gì' })).toBeVisible();

  // 3. Edit the draft: the live page does not change.
  await editor.setHeroHeading(DRAFT);
  await expect(editor.topBar.getByText('Live v1 · 1 thay đổi chưa xuất bản')).toBeVisible();
  expect(firstHeading((await fetchPublic(request, subdomain, '/uu-dai')).html)).toBe(V1);
  await visitor.reload();
  await expect(visitor.getByRole('heading', { level: 1 })).toHaveText(V1);

  // 4. Publish v2, then roll back to v1 with a reason: live is v1.
  await editor.publish(2, 'Đổi tiêu đề');
  expect(firstHeading((await fetchPublic(request, subdomain, '/uu-dai')).html)).toBe(DRAFT);
  await editor.topBar.getByRole('link', { name: 'Lịch sử phiên bản' }).click();
  await page
    .getByRole('listitem')
    .filter({ has: page.getByRole('heading', { name: 'v1', exact: true }) })
    .getByRole('button', { name: 'Khôi phục bản này' })
    .click();
  const panel = page.getByRole('region', { name: 'Khôi phục v1 thành bản live?' });
  await panel.getByRole('textbox', { name: /^Lý do/ }).fill('Khách hàng muốn giữ tiêu đề cũ');
  await panel.getByRole('button', { name: 'Khôi phục v1' }).click();
  const banner = page.getByRole('status').filter({ hasText: 'v1 đang live' });
  await expect(banner).toBeVisible();
  expect(firstHeading((await fetchPublic(request, subdomain, '/uu-dai')).html)).toBe(V1);
  await visitor.reload();
  await expect(visitor.getByRole('heading', { level: 1 })).toHaveText(V1);

  // 5. Undo the rollback: live is v2 again.
  await banner.getByRole('button', { name: 'Hoàn tác khôi phục' }).click();
  await expect(banner).toBeHidden();
  expect(firstHeading((await fetchPublic(request, subdomain, '/uu-dai')).html)).toBe(DRAFT);
  await visitor.reload();
  await expect(visitor.getByRole('heading', { level: 1 })).toHaveText(DRAFT);
  await visitor.close();
});
