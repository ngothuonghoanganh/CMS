import { expect, type Locator, type Page, test } from '@playwright/test';
import { expectNoSidewaysScroll } from '../support/axe.js';
import { Editor } from '../support/editor.js';
import { clinicImage } from '../support/fixtures.js';
import {
  createPageViaApi,
  PRIVACY,
  setUpLeadCaptureViaApi,
  setUpSite,
  uniqueId,
} from '../support/setup.js';
import { siteOrigin } from '../urls.js';

const POLICY = 'Chính sách quyền riêng tư';

function escaped(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** "Thêm section": opens a category, picks a card and adds it, before the footer. */
async function addSection(page: Page, editor: Editor, category: string, card: string) {
  await editor.structure.getByRole('button', { name: 'Thêm section', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Thêm section' });
  await dialog
    .getByRole('navigation', { name: 'Nhóm section' })
    .getByRole('button', { name: new RegExp(`^${escaped(category)}`) })
    .click();
  await dialog.getByRole('button', { name: new RegExp(`^${escaped(card)}`) }).click();
  await dialog.getByRole('button', { name: `Thêm “${card}”` }).click();
  await expect(dialog).toBeHidden();
}

/** Uploads the clinic image with a description into the image field inside `scope`. */
async function uploadInto(page: Page, scope: Locator, alt: string) {
  await scope.getByRole('button', { name: 'Chọn ảnh' }).click();
  const picker = page.getByRole('dialog', { name: 'Chọn ảnh' });
  await picker.getByLabel('Tệp ảnh').setInputFiles(clinicImage);
  await picker
    .getByRole('textbox', { name: 'Mô tả ảnh cho người dùng trình đọc màn hình' })
    .fill(alt);
  await picker.getByRole('button', { name: 'Tải lên và chọn' }).click();
  await expect(picker).toBeHidden();
}

test.describe('E5 · new sections', () => {
  test('add a process, partner logos, before and after and a quick contact, publish, see them live', async ({
    page,
    browser,
  }) => {
    const { site } = await setUpSite(page.request);
    const slug = `dich-vu-${uniqueId()}`;
    // A service page ends with a call-to-action band, not a form: no consent settings needed.
    const created = await createPageViaApi(page.request, site.id, {
      title: 'Tẩy trắng răng',
      slug,
      start: {
        kind: 'goal',
        goal: 'product',
        brief: { offer: 'Tẩy trắng răng an toàn', audience: '', phone: '0901 234 567' },
        style: 'calm',
      },
    });
    const editor = new Editor(page);
    await editor.goto(site.id, created.page.id);
    await expect(editor.rows).toHaveCount(7);

    // Quy trình 3 bước: numbered steps, nothing to choose but the text.
    await addSection(page, editor, 'Lợi ích & tính năng', 'Quy trình 3 bước');
    await expect(editor.canvas.getByText('Bắt đầu chỉ với 3 bước')).toBeVisible();

    // Logo đối tác: three logos, each named by its partner.
    await addSection(page, editor, 'Bằng chứng xã hội', 'Logo đối tác');
    const logos = page.getByRole('complementary', { name: 'Logo đối tác' });
    await logos.getByRole('button', { name: 'Xóa đối tác 4' }).click();
    const partners = ['Bệnh viện Hòa Bình', 'Trường Đại học Y', 'Phòng khám An Tâm'];
    for (const [index, partner] of partners.entries()) {
      // An untitled logo is numbered; once described, it is named after its partner.
      await logos.getByRole('button', { name: new RegExp(`^Đối tác ${index + 1}`) }).click();
      const item = logos.getByRole('listitem').nth(index);
      await uploadInto(page, item, partner);
      await expect(item.getByRole('button', { name: new RegExp(`^${partner}`) })).toBeVisible();
      await expect(item.getByRole('textbox', { name: 'Tên đối tác' })).toHaveValue(partner);
      await expect(editor.canvas.getByRole('img', { name: partner })).toBeVisible();
    }

    // Trước & sau: both photos, each with its description.
    await addSection(page, editor, 'Bằng chứng xã hội', 'Trước & sau');
    const pair = page.getByRole('complementary', { name: 'Trước & sau' });
    await uploadInto(page, pair.getByRole('group', { name: 'Ảnh trước' }), 'Răng ố vàng');
    await uploadInto(page, pair.getByRole('group', { name: 'Ảnh sau' }), 'Răng trắng sáng');

    // Gọi / Zalo nhanh: each button takes a number, and nothing else.
    await addSection(page, editor, 'Form & liên hệ', 'Gọi / Zalo nhanh');
    const quick = page.getByRole('complementary', { name: 'Gọi / Zalo nhanh' });
    const call = quick.getByRole('group', { name: 'Nút gọi điện' });
    await expect(call.getByRole('combobox', { name: 'Khi bấm, đưa tới' })).toHaveCount(0);
    await call.getByRole('textbox', { name: 'Số điện thoại' }).fill('0901 234 567');
    await call.getByRole('textbox', { name: 'Số điện thoại' }).press('Tab');
    const zalo = quick.getByRole('group', { name: 'Nút Zalo' });
    await zalo.getByRole('textbox', { name: 'Số Zalo' }).fill('0901 234 567');
    await zalo.getByRole('textbox', { name: 'Số Zalo' }).press('Tab');
    await expect(editor.rows).toHaveCount(11);
    await editor.expectSaved();

    // Only sample text is left: warnings, skipped one by one.
    await editor.publish(1, 'Thêm quy trình, đối tác, trước & sau, gọi nhanh');

    const visitor = await browser.newPage();
    await visitor.goto(`${siteOrigin(site.subdomain)}/${slug}`);
    const steps = visitor.locator('[data-section-type="benefits"][data-variant="steps"]').last();
    await expect(steps.getByRole('listitem')).toHaveCount(3);
    await expect(steps.getByRole('heading', { level: 3 }).first()).toHaveText('Để lại thông tin');
    for (const partner of partners) {
      await expect(visitor.getByRole('img', { name: partner })).toBeVisible();
    }
    const figures = visitor.locator('[data-section-type="before_after"]').getByRole('figure');
    await expect(figures).toHaveCount(2);
    await expect(figures.nth(0)).toContainText('Trước khi bắt đầu');
    await expect(figures.nth(0).getByRole('img', { name: 'Răng ố vàng' })).toBeVisible();
    await expect(figures.nth(1).getByRole('img', { name: 'Răng trắng sáng' })).toBeVisible();
    await expect(visitor.getByRole('link', { name: 'Gọi ngay' })).toHaveAttribute(
      'href',
      'tel:0901234567',
    );
    await expect(visitor.getByRole('link', { name: 'Nhắn Zalo' })).toHaveAttribute(
      'href',
      'https://zalo.me/0901234567',
    );
    // No form on this page: its footer links no privacy policy of its own accord.
    await expect(visitor.getByRole('contentinfo')).not.toContainText(POLICY);

    // On a phone the logos wrap and the photos stack, "before" first, without sideways scrolling.
    await visitor.setViewportSize({ width: 375, height: 812 });
    await expectNoSidewaysScroll(visitor, 'E5 · trang có section mới · 375 px');
    const before = await figures.nth(0).boundingBox();
    const after = await figures.nth(1).boundingBox();
    expect(before && after && before.y + before.height <= after.y).toBe(true);
    await visitor.close();
  });

  test('a page with a form links the privacy policy in its footer, once', async ({
    page,
    browser,
  }) => {
    const { site } = await setUpSite(page.request);
    await setUpLeadCaptureViaApi(page.request, site.id);
    const slug = `tu-van-${uniqueId()}`;
    const created = await createPageViaApi(page.request, site.id, {
      title: 'Tư vấn niềng răng',
      slug,
      start: {
        kind: 'goal',
        goal: 'lead',
        brief: { offer: 'Niềng răng trong suốt', audience: '', phone: '0901 234 567' },
        style: 'calm',
      },
    });
    const editor = new Editor(page);
    await editor.goto(site.id, created.page.id);
    // The canvas shows the site's current settings, which the next publish freezes, like the form.
    await expect(editor.canvas.locator('footer')).toContainText(POLICY);
    await editor.publish(1);

    const visitor = await browser.newPage();
    const url = `${siteOrigin(site.subdomain)}/${slug}`;
    await visitor.goto(url);
    const footer = visitor.getByRole('contentinfo');
    const policy = footer.getByRole('link', { name: POLICY });
    await expect(policy).toHaveAttribute('href', PRIVACY.policyUrl);
    await expect(policy).toHaveAttribute('target', '_blank');

    // The owner links the same policy from the footer: it is listed once, as the owner wrote it.
    await editor.structure
      .getByRole('button', { name: /^Chân trang/ })
      .filter({ hasNotText: 'Kéo' })
      .first()
      .click();
    const panel = page.getByRole('complementary', { name: 'Chân trang' });
    await panel.getByRole('button', { name: 'Thêm liên kết' }).click();
    await panel.getByRole('textbox', { name: /^Chữ trên nút/ }).fill('Quyền riêng tư');
    await panel.getByRole('combobox', { name: 'Khi bấm, đưa tới' }).selectOption('url');
    await panel.getByRole('textbox', { name: 'Đường dẫn' }).fill(PRIVACY.policyUrl);
    await panel.getByRole('textbox', { name: 'Đường dẫn' }).press('Tab');
    await editor.expectSaved();
    await expect(editor.canvas.locator('footer')).not.toContainText(POLICY);
    await editor.publish(2);

    await visitor.goto(url);
    await expect(footer.locator(`a[href="${PRIVACY.policyUrl}"]`)).toHaveCount(1);
    await expect(footer.getByRole('link', { name: 'Quyền riêng tư' })).toHaveAttribute(
      'href',
      PRIVACY.policyUrl,
    );
    await expect(footer).not.toContainText(POLICY);
    await visitor.close();
  });
});
