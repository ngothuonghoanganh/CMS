import { expect, test } from '@playwright/test';
import { Editor } from '../support/editor.js';
import { createPageViaApi, setUpLeadCaptureViaApi, setUpSite, uniqueId } from '../support/setup.js';
import { sendLead } from '../support/visitor.js';
import { siteOrigin } from '../urls.js';

test.describe('A1 · automations', () => {
  test('the owner starts a recipe, enables it, and a new lead is given out with a task', async ({
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

    // Phase 3, step 4: a recipe becomes a draft, the switch enables it.
    await page.goto(`/sites/${site.id}`);
    await page
      .getByRole('navigation', { name: 'Điều hướng chính' })
      .getByRole('link', { name: 'Automation' })
      .click();
    await expect(page.getByRole('heading', { level: 1, name: 'Automation' })).toBeVisible();
    await page.getByRole('button', { name: /Giao lead mới cho người trực/ }).click();
    const list = page.getByRole('region', { name: 'Automation của site' });
    const row = list.getByRole('row').filter({ hasText: 'Giao lead mới cho người trực' });
    await expect(row).toContainText('Bản nháp');
    await row.getByRole('switch', { name: 'Bật Giao lead mới cho người trực' }).check();
    await expect(row).toContainText('Đang bật');

    await sendLead(browser, `${siteOrigin(site.subdomain)}/${slug}`, {
      name: 'Phạm Mỹ Duyên',
      phone: '0977 645 010',
    });

    // The queue runs at once: the profile has an owner, a task and the automation's entry.
    await expect(async () => {
      await page.goto(`/sites/${site.id}/contacts`);
      await expect(
        page.getByRole('region', { name: 'Danh sách khách hàng' }).getByRole('row').nth(1),
      ).not.toContainText('Chưa giao');
    }).toPass({ timeout: 20_000 });
    await page.getByRole('link', { name: 'Phạm Mỹ Duyên' }).click();
    await expect(page.getByRole('region', { name: 'Công việc' })).toContainText(
      'Gọi lại trong 15 phút',
    );
    await expect(
      page
        .getByRole('region', { name: 'Dòng thời gian' })
        .getByText('Automation “Giao lead mới cho người trực”'),
    ).toBeVisible();

    await page.goto(`/sites/${site.id}/automations`);
    await expect(row).toContainText('Thành công');
    await expect(row).toContainText('1 lượt · 0 lỗi');
  });
});
