import { expect, test } from '@playwright/test';
import { Editor } from '../support/editor.js';
import { createPageViaApi, setUpSite, uniqueId } from '../support/setup.js';
import { siteOrigin } from '../urls.js';

/*
 * M3 (ADR-032): the editor's motion. "Cài đặt trang → Chuyển động" sets the page's style (board 37),
 * a section changes how it enters (board 38), the library compares the styles (board 39), and
 * "Chạy thử" plays the canvas. Every change is saved with the draft and goes live with a publish.
 */

test.describe('M3 · motion in the editor', () => {
  test('choose a style, change a section, play it, compare, publish', async ({ page, browser }) => {
    const { site } = await setUpSite(page.request);
    const slug = `chuyen-dong-${uniqueId()}`;
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

    // Nothing selected: the page settings, motion first. A new page does not move.
    const settings = page.getByRole('complementary', { name: 'Cài đặt trang' });
    const styles = settings.getByRole('group', { name: 'Phong cách chuyển động' });
    await expect(styles.getByRole('button', { name: /^Không hiệu ứng/ })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await styles.getByRole('button', { name: /^Mượt mà/ }).click();
    await settings.getByRole('button', { name: 'Rõ' }).click();
    await editor.expectSaved();
    await expect(
      editor.structure.getByRole('button', { name: 'Chuyển động · Mượt mà' }),
    ).toBeVisible();

    // Saved with the draft: a reload keeps it.
    await page.reload();
    await expect(styles.getByRole('button', { name: /^Mượt mà/ })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await expect(settings.getByRole('button', { name: 'Rõ' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    // Live from v1: what changes after it shows when publishing again.
    await editor.publish(1, 'Bật chuyển động');

    // A section of its own: it pops in, and its row says so.
    const navbarRow = editor.rows.first();
    await expect(navbarRow).toContainText('Luôn hiện ngay');
    const benefitsRow = editor.rows.filter({ hasText: 'Lợi ích' }).first();
    await benefitsRow.getByRole('button', { name: /^Lợi ích/ }).click();
    const panel = page.getByRole('complementary', { name: 'Lợi ích' });
    await panel
      .getByRole('group', { name: 'Cách xuất hiện' })
      .getByRole('button', { name: /^Bật lên/ })
      .click();
    await expect(benefitsRow).toContainText('Riêng · Bật lên');
    await panel.getByRole('button', { name: 'Dùng lại cài đặt trang (Trượt lên)' }).click();
    await expect(benefitsRow).not.toContainText('Riêng');
    // Cards sit in rows: they can enter row by row.
    const reviewsRow = editor.rows.filter({ hasText: 'Cảm nhận khách hàng' }).first();
    await reviewsRow.getByRole('button', { name: /^Cảm nhận khách hàng/ }).click();
    await page
      .getByRole('complementary', { name: 'Cảm nhận khách hàng' })
      .getByRole('group', { name: 'Thứ tự trong section' })
      .getByRole('button', { name: /Theo hàng/ })
      .click();
    await expect(reviewsRow).toContainText('Riêng · theo hàng');
    await editor.expectSaved();

    // "Chạy thử": the canvas plays as visitors would see it, then goes back to editing.
    await editor.canvas.getByRole('button', { name: 'Chạy thử hiệu ứng' }).click();
    await expect(page.getByText('Đã chạy thử xong', { exact: false })).toBeVisible({
      timeout: 20_000,
    });
    await page.getByRole('button', { name: 'Quay lại chỉnh sửa' }).click();
    await expect(page.getByText('Đã chạy thử xong', { exact: false })).toBeHidden();

    // The library: compare, choose, apply.
    await editor.structure.getByRole('button', { name: 'Chuyển động · Mượt mà' }).click();
    await settings.getByRole('button', { name: 'So sánh' }).click();
    const library = page.getByRole('dialog', { name: 'Phong cách chuyển động' });
    await library.getByRole('button', { name: 'Chọn Sang trọng' }).click();
    await expect(library.getByText('Đổi từ Mượt mà sang Sang trọng')).toBeVisible();
    await library.getByRole('button', { name: 'Áp dụng Sang trọng' }).click();
    await expect(library).toBeHidden();
    await expect(styles.getByRole('button', { name: /^Sang trọng/ })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await editor.expectSaved();

    // Publishing names the change, and the live page moves.
    const dialog = await editor.openPublishDialog();
    await expect(dialog.getByText('Chuyển động: Sang trọng')).toBeVisible();
    await expect(dialog.getByText('Sửa: Cảm nhận khách hàng')).toBeVisible();
    const done = await editor.publishFromDialog(dialog, 2, 'Phong cách sang trọng');
    await done.getByRole('button', { name: 'Tiếp tục chỉnh sửa' }).click();

    const visitor = await browser.newPage();
    await visitor.goto(`${siteOrigin(site.subdomain)}/${slug}`);
    await expect(visitor.locator('[data-motion-root]')).toHaveCount(1);
    await expect(visitor.locator('[data-section-type="cta_band"]')).toHaveAttribute(
      'data-motion-enter',
      'reveal',
    );
    await visitor.close();
  });
});
