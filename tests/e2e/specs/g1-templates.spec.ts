import { expect, type Page, test } from '@playwright/test';
import { expectAccessible, expectNoSidewaysScroll, SCAN_VIEWPORTS } from '../support/axe.js';
import {
  createSiteViaApi,
  newSubdomain,
  setUpLeadCaptureViaApi,
  setUpSite,
  uniqueId,
} from '../support/setup.js';

/*
 * G1 (ADR-030): the library of system templates (board 17), one template previewed with the
 * sections' own components (board 18), and a draft made from it that opens in the editor. Who may
 * do what, versions and isolation are the API's integration tests.
 */

const TEMPLATE = 'Ưu đãi dịch vụ nha khoa';
const HERO_HEADING = 'Tẩy trắng răng giảm 30% cho khách hàng mới';

async function openLibrary(page: Page, workspaceId: string, search = ''): Promise<void> {
  await page.goto(`/workspaces/${workspaceId}/templates${search}`);
  await expect(page.getByRole('heading', { level: 1, name: 'Templates' })).toBeVisible();
}

test.describe('G1 · System templates', () => {
  test('creates a page from a system template and opens it in the editor', async ({ page }) => {
    const { site } = await setUpSite(page.request);
    const recipient = await setUpLeadCaptureViaApi(page.request, site.id);

    // "Templates" is in the WORKSPACE group of the sidebar, for every role.
    await page.goto(`/sites/${site.id}`);
    await expect(page.getByRole('heading', { level: 1, name: 'Trang' })).toBeVisible();
    const sidebar = page.getByRole('navigation', { name: 'Điều hướng chính' });
    await sidebar.getByRole('link', { name: 'Templates', exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`/workspaces/${site.workspaceId}/templates$`));
    await expect(page.getByRole('heading', { level: 1, name: 'Templates' })).toBeVisible();
    await expect(sidebar.getByRole('link', { name: 'Templates', exact: true })).toHaveAttribute(
      'aria-current',
      'page',
    );
    await expect(page.getByRole('combobox', { name: 'Tạo trang cho' })).toHaveValue(site.id);

    // The search ignores accents; the filters narrow it down with chips.
    const results = page.getByRole('region', { name: 'Kết quả' });
    await page.getByRole('searchbox', { name: 'Tìm template' }).fill('nha khoa');
    await expect(results.getByRole('heading', { level: 2 })).toHaveText([
      TEMPLATE,
      'Giới thiệu phòng khám',
    ]);
    await page
      .getByRole('complementary', { name: 'Bộ lọc' })
      .getByRole('checkbox', { name: /Có form thu lead/ })
      .check();
    await expect(results.getByRole('heading', { level: 2 })).toHaveText([TEMPLATE]);
    await expect(results.getByRole('button', { name: 'Bỏ lọc Có form thu lead' })).toBeVisible();

    await results.getByRole('link', { name: `Xem trước ${TEMPLATE}` }).click();
    await expect(page).toHaveURL(
      new RegExp(`/workspaces/${site.workspaceId}/templates/nha-khoa-uu-dai\\?site=${site.id}$`),
    );
    await expect(page.getByRole('heading', { level: 1, name: TEMPLATE })).toBeVisible();
    const preview = page.getByRole('region', { name: `Bản xem trước trên máy tính: ${TEMPLATE}` });
    await expect(preview.getByText(HERO_HEADING)).toBeVisible();
    await expect(page.getByRole('heading', { level: 2, name: 'Gồm 8 section' })).toBeVisible();
    const needs = page.getByRole('region', { name: 'Cần có trước khi xuất bản' });
    await expect(needs.getByRole('listitem').first()).toContainText(
      `${site.name} đã có ${recipient}`,
    );
    await expect(needs.getByRole('listitem').nth(1)).toContainText('đang dùng phiên bản 1');

    await page.getByRole('button', { name: 'Điện thoại' }).click();
    await expect(
      page.getByRole('region', { name: `Bản xem trước trên điện thoại: ${TEMPLATE}` }),
    ).toBeVisible();

    await page.getByRole('button', { name: 'Tạo trang từ mẫu' }).click();
    const dialog = page.getByRole('dialog', { name: 'Tạo trang từ mẫu' });
    const title = `Ưu đãi tẩy trắng răng ${uniqueId()}`;
    await dialog.getByRole('textbox', { name: /Tên trang/ }).fill(title);
    await expect(dialog.getByText('Đường dẫn này dùng được.')).toBeVisible();
    // The site has its recipients and consent: nothing to set up first.
    await expect(dialog.getByRole('note')).toHaveCount(0);
    await dialog.getByRole('button', { name: 'Tạo bản nháp và mở editor' }).click();

    await expect(page).toHaveURL(new RegExp(`/sites/${site.id}/pages/[a-f0-9]{24}/edit$`));
    const canvas = page.getByRole('region', { name: 'Khung xem trước bản nháp' });
    await expect(canvas.getByText(HERO_HEADING)).toBeVisible();

    // The draft is on the site's list of pages.
    await page.goto(`/sites/${site.id}`);
    await expect(page.getByRole('link', { name: title, exact: true })).toBeVisible();
  });

  test('notes what a site still needs for the form, and creates the draft anyway', async ({
    page,
  }) => {
    const { site } = await setUpSite(page.request);
    const kitchen = await createSiteViaApi(page.request, site.workspaceId, {
      name: 'Bếp Nhà Mây',
      subdomain: newSubdomain(),
    });
    await openLibrary(page, site.workspaceId, `?site=${kitchen.id}`);
    await page.getByRole('button', { name: `Dùng mẫu ${TEMPLATE}` }).click();
    const dialog = page.getByRole('dialog', { name: 'Tạo trang từ mẫu' });
    await expect(dialog.getByRole('combobox', { name: 'Site' })).toHaveValue(kitchen.id);
    await expect(dialog.getByRole('note')).toContainText(
      'Bếp Nhà Mây chưa có nơi nhận lead và nội dung đồng ý.',
    );
    await expect(dialog.getByText('Đường dẫn này dùng được.')).toBeVisible();
    await dialog.getByRole('button', { name: 'Tạo bản nháp và mở editor' }).click();
    await expect(page).toHaveURL(new RegExp(`/sites/${kitchen.id}/pages/[a-f0-9]{24}/edit$`));
  });

  for (const viewport of SCAN_VIEWPORTS) {
    test(`the library, a template and its create dialog are accessible at ${viewport.width} px`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      const { site } = await setUpSite(page.request);

      await openLibrary(page, site.workspaceId);
      await page
        .getByRole('complementary', { name: 'Bộ lọc' })
        .getByRole('checkbox', { name: /Bất động sản/ })
        .check();
      await expect(page.getByRole('button', { name: 'Bỏ lọc Bất động sản' })).toBeVisible();
      await expectAccessible(page, 'Templates');
      await expectNoSidewaysScroll(page, 'Templates');

      await page.goto(`/workspaces/${site.workspaceId}/templates/nha-khoa-uu-dai`);
      await expect(page.getByRole('heading', { level: 1, name: TEMPLATE })).toBeVisible();
      await expectAccessible(page, 'Chi tiết template');
      await expectNoSidewaysScroll(page, 'Chi tiết template');

      await page.getByRole('button', { name: 'Tạo trang từ mẫu' }).click();
      const dialog = page.getByRole('dialog', { name: 'Tạo trang từ mẫu' });
      await expect(dialog.getByRole('note')).toBeVisible();
      await expect(dialog.getByText('Đường dẫn này dùng được.')).toBeVisible();
      await expectAccessible(page, 'Tạo trang từ mẫu');
    });
  }

  test('the templates of someone else are not found', async ({ page, browser }) => {
    const { site } = await setUpSite(page.request);
    const other = await browser.newContext();
    try {
      await setUpSite(other.request);
      const otherPage = await other.newPage();
      for (const path of ['templates', 'templates/nha-khoa-uu-dai']) {
        await otherPage.goto(`/workspaces/${site.workspaceId}/${path}`);
        await expect(otherPage.getByRole('heading', { level: 1 })).toHaveText(
          'Không tìm thấy trang',
        );
      }
    } finally {
      await other.close();
    }
    // An unknown template of one's own workspace is not found either.
    await page.goto(`/workspaces/${site.workspaceId}/templates/khong-co-mau`);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Không tìm thấy trang');
  });
});
