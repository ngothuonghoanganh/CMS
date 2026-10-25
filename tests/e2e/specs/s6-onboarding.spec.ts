import { expect, test } from '@playwright/test';
import { Editor } from '../support/editor.js';
import { setUpSite, uniqueId } from '../support/setup.js';

test.describe('S6 · create a page by goal', () => {
  test('a goal and a brief open the editor on the generated page', async ({ page }) => {
    const { site } = await setUpSite(page.request);
    await page.goto(`/sites/${site.id}`);
    await page.getByRole('link', { name: 'Tạo trang đầu tiên' }).click();
    await expect(page).toHaveURL(new RegExp(`/sites/${site.id}/pages/new$`));
    const steps = page.getByRole('list', { name: 'Các bước tạo trang' });
    await expect(steps).toBeVisible();

    // Step 1: the goal decides the outline shown in "Trang sẽ gồm".
    const outline = page.getByRole('complementary', { name: 'Trang sẽ gồm' });
    await page.getByRole('radio', { name: 'Ưu đãi có thời hạn' }).check();
    await expect(outline.getByRole('listitem').first()).toBeVisible();
    await expect(outline).toContainText('Hero + thời hạn ưu đãi');
    await expect(outline).toContainText('Điều kiện áp dụng');
    await page.getByRole('button', { name: 'Tiếp tục' }).click();

    // Step 2: title, path and the brief.
    const slug = `uu-dai-${uniqueId()}`;
    await page.getByLabel('Tên trang').fill('Ưu đãi niềng răng tháng 11');
    await page.getByLabel('Đường dẫn').fill(slug);
    await expect(page.getByText('Đường dẫn này dùng được.')).toBeVisible();
    await page
      .getByLabel('Ưu đãi hoặc dịch vụ chính · tùy chọn')
      .fill('Niềng răng trong suốt giảm 30%');
    await page.getByLabel('Ai sẽ xem trang này? · tùy chọn').fill('Người đi làm 25–40 tuổi');
    await page
      .getByLabel('Số điện thoại nhận khách (gọi điện hoặc Zalo) · tùy chọn')
      .fill('0901 234 567');
    await page.getByRole('button', { name: 'Tiếp tục' }).click();

    // Step 3: the color rhythm of the page.
    await page.getByRole('radio', { name: 'Nhẹ nhàng' }).check();
    await page.getByRole('button', { name: 'Tạo trang' }).click();

    await expect(page).toHaveURL(/\/pages\/[a-f0-9]{24}\/edit$/);
    const editor = new Editor(page);
    await expect(editor.heroCanvasHeading).toHaveText('Niềng răng trong suốt giảm 30%');
    await expect(editor.rows).toHaveCount(7);
    await expect(
      page.getByRole('heading', { level: 1, name: 'Ưu đãi niềng răng tháng 11' }),
    ).toBeVisible();
    await expect(editor.topBar.getByText('Chưa xuất bản', { exact: true })).toBeVisible();

    // The promotion page collects contacts with the form: the Hero button leads to it (ADR-016),
    // and the brief's phone number becomes the navigation bar's call.
    await expect(editor.rows.filter({ hasText: 'Form đăng ký' })).toHaveCount(1);
    await editor.heroRow.click();
    const target = editor.heroPanel.getByRole('combobox', { name: 'Khi bấm, đưa tới' }).first();
    await expect(target).toHaveValue('section');
    await expect(
      editor.heroPanel.getByRole('combobox', { name: 'Section đích' }).locator('option:checked'),
    ).toHaveText(/Form đăng ký/);
    await editor.structure
      .getByRole('button', { name: /^Thanh điều hướng/ })
      .filter({ hasNotText: 'Kéo' })
      .first()
      .click();
    await expect(
      page
        .getByRole('complementary', { name: 'Thanh điều hướng' })
        .getByRole('textbox', { name: 'Số điện thoại' }),
    ).toHaveValue('0901 234 567');
  });

  test('"Bắt đầu trống" creates an empty page and opens it', async ({ page }) => {
    const { site } = await setUpSite(page.request);
    await page.goto(`/sites/${site.id}/pages/new`);
    await page.getByRole('button', { name: 'Bắt đầu trống' }).click();
    const blank = page.getByRole('dialog', { name: 'Bắt đầu trống' });
    await blank.getByLabel('Tên trang').fill('Giới thiệu phòng khám');
    await expect(blank.getByLabel('Đường dẫn')).toHaveValue('gioi-thieu-phong-kham');
    await expect(blank.getByText('Đường dẫn này dùng được.')).toBeVisible();
    await blank.getByRole('button', { name: 'Tạo trang trống' }).click();

    await expect(page).toHaveURL(/\/pages\/[a-f0-9]{24}\/edit$/);
    const editor = new Editor(page);
    await expect(editor.canvas.getByText('Trang chưa có section nào')).toBeVisible();
    await expect(editor.rows).toHaveCount(0);
    await expect(
      page.getByRole('heading', { level: 1, name: 'Giới thiệu phòng khám' }),
    ).toBeVisible();
  });
});
