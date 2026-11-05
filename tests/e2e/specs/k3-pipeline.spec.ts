import { expect, test } from '@playwright/test';
import { Editor } from '../support/editor.js';
import { createPageViaApi, setUpLeadCaptureViaApi, setUpSite, uniqueId } from '../support/setup.js';
import { sendLead } from '../support/visitor.js';
import { siteOrigin } from '../urls.js';

test.describe('K3 · pipeline', () => {
  test('a lead opens an opportunity; the owner moves it on the board and the inbox, then wins it', async ({
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
    await sendLead(browser, `${siteOrigin(site.subdomain)}/${slug}`, {
      name: 'Nguyễn Thu Trang',
      phone: '0912 345 678',
    });

    // Phase 3, step 3: the profile's opportunity, on the list and on the board.
    await page.goto(`/sites/${site.id}/contacts`);
    const row = page
      .getByRole('region', { name: 'Danh sách khách hàng' })
      .getByRole('row')
      .filter({ hasText: 'Nguyễn Thu Trang' });
    await expect(row).toContainText('Mới');
    await page.getByRole('link', { name: 'Xem pipeline' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Cơ hội' })).toBeVisible();
    await expect(page.getByText(/^1 cơ hội đang mở/)).toBeVisible();
    const fresh = page.getByRole('region', { name: 'Mới, 1 cơ hội' });
    await expect(fresh).toContainText('Ưu đãi niềng răng');
    await expect(fresh).toContainText('Nguyễn Thu Trang');

    // With the card's button, as the keyboard does.
    await fresh.getByRole('button', { name: /Chuyển giai đoạn/ }).click();
    await page.getByRole('menuitem', { name: 'Hẹn lịch' }).click();
    const scheduled = page.getByRole('region', { name: 'Hẹn lịch, 1 cơ hội' });
    await expect(scheduled).toContainText('Nguyễn Thu Trang');

    // The lead's status is the stage: the inbox moves the same card.
    await page.goto(`/sites/${site.id}/leads`);
    await page.getByRole('link', { name: 'Nguyễn Thu Trang' }).click();
    const detail = page.getByRole('complementary', { name: 'Nguyễn Thu Trang' });
    const status = detail.getByRole('combobox', { name: 'Trạng thái lead' });
    await expect(status).toHaveValue('scheduled');
    await status.selectOption('visited');
    await expect(status).toHaveValue('visited');
    await expect(status).not.toHaveAttribute('aria-busy', 'true');

    // "Thắng" asks for the actual value and the day.
    await page.goto(`/sites/${site.id}/contacts/pipeline`);
    const visited = page.getByRole('region', { name: 'Đã đến, 1 cơ hội' });
    await visited.getByRole('button', { name: /Chuyển giai đoạn/ }).click();
    await page.getByRole('menuitem', { name: 'Đánh dấu thắng…' }).click();
    const won = page.getByRole('dialog', { name: 'Đánh dấu thắng' });
    await won.getByRole('textbox', { name: 'Giá trị thực tế' }).fill('36500000');
    await won.getByRole('button', { name: 'Đánh dấu thắng' }).click();
    await expect(won).toBeHidden();
    const winners = page.getByRole('region', { name: 'Thắng, 1 cơ hội' });
    await expect(winners).toContainText('36.500.000 ₫');
    await expect(page.getByText(/tháng này thắng 1, thua 0/)).toBeVisible();

    // The profile tells the story.
    await winners.getByRole('link', { name: /Ưu đãi niềng răng/ }).click();
    const timeline = page.getByRole('region', { name: 'Dòng thời gian' });
    await expect(timeline.getByText('Cơ hội chuyển sang Thắng')).toBeVisible();
    await expect(timeline.getByText('Cơ hội chuyển sang Hẹn lịch')).toBeVisible();
    await expect(page.getByRole('region', { name: 'Cơ hội' })).toContainText('Thắng');
  });
});
