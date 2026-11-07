import { expect, test } from '@playwright/test';
import { Editor } from '../support/editor.js';
import { createPageViaApi, setUpLeadCaptureViaApi, setUpSite, uniqueId } from '../support/setup.js';
import { sendLead } from '../support/visitor.js';
import { siteOrigin } from '../urls.js';

test.describe('A2 · automation editor', () => {
  test('the owner builds an automation step by step, tries it, enables it, and it tags a new lead', async ({
    page,
    browser,
  }) => {
    const { site } = await setUpSite(page.request);
    await setUpLeadCaptureViaApi(page.request, site.id);
    const slug = `uu-dai-${uniqueId()}`;
    const created = await createPageViaApi(page.request, site.id, {
      title: 'Ưu đãi niềng răng',
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
    await editor.publish(1, 'Có form đăng ký');
    const pageUrl = `${siteOrigin(site.subdomain)}/${slug}`;
    await sendLead(browser, pageUrl, { name: 'Phạm Mỹ Duyên', phone: '0977 645 010' });

    // Phase 3, step 5: a blank automation, one action, a test run, then "Bật".
    await page.goto(`/sites/${site.id}/automations`);
    await page.getByRole('button', { name: 'Tạo automation' }).click();
    await expect(page.getByRole('textbox', { name: 'Tên automation' })).toHaveValue(
      'Automation mới',
    );
    await expect(page.getByText('1 bước thiếu cấu hình')).toBeVisible();
    await page.getByRole('textbox', { name: 'Tên automation' }).fill('Gắn nhãn khách mới');
    await page.getByRole('button', { name: /Thêm điều kiện hoặc hành động/ }).click();
    await page.getByRole('menuitem', { name: 'Thì · Gắn nhãn' }).click();
    const panel = page.getByRole('complementary', { name: 'Bảng bên phải' });
    await panel.getByRole('combobox', { name: 'Nhãn' }).fill('Khách mới');
    await expect(page.getByText(/^Đã lưu/)).toBeVisible();
    await expect(page.getByText('1 bước thiếu cấu hình')).toBeHidden();

    await page.getByRole('button', { name: 'Chạy thử' }).click();
    const steps = page.getByRole('region', { name: 'Các bước' });
    await expect(steps.getByText('Sẽ gắn nhãn “Khách mới”')).toBeVisible();
    await expect(panel.getByRole('combobox', { name: 'Dùng dữ liệu của' })).toContainText(
      'Phạm Mỹ Duyên',
    );

    await page.getByRole('button', { name: 'Bật automation' }).click();
    const dialog = page.getByRole('dialog', { name: 'Bật “Gắn nhãn khách mới”?' });
    await expect(dialog).toContainText('1 lead cũ không bị ảnh hưởng.');
    await dialog.getByRole('button', { name: 'Bật automation' }).click();
    await expect(page.getByRole('button', { name: 'Tạm dừng' })).toBeVisible();

    await sendLead(browser, pageUrl, { name: 'Lê Hoàng Nam', phone: '0938 222 104' });
    await expect(async () => {
      await page.goto(`/sites/${site.id}/contacts`);
      await expect(
        page.getByRole('region', { name: 'Danh sách khách hàng' }).getByRole('row').filter({
          hasText: 'Lê Hoàng Nam',
        }),
      ).toContainText('Khách mới');
    }).toPass({ timeout: 20_000 });

    await page.goto(`/sites/${site.id}/automations`);
    const row = page
      .getByRole('region', { name: 'Automation của site' })
      .getByRole('row')
      .filter({ hasText: 'Gắn nhãn khách mới' });
    await expect(row).toContainText('Đang bật');
  });
});
