import { expect, test } from '@playwright/test';
import { expectAccessible, expectNoSidewaysScroll, SCAN_VIEWPORTS } from '../support/axe.js';
import { joinAs } from '../support/members.js';
import { setUpSite } from '../support/setup.js';

/*
 * MP1 (ADR-036): browsing the marketplace, boards 30 and 31. Nothing can be received or bought
 * yet. The catalog, its checks and the answers are the API's integration tests.
 */

const GYM = 'Khai trương phòng tập';
const APARTMENTS = 'Mở bán dự án căn hộ';
const FREE = 'Khóa học tiếng Anh trẻ em';
const NAMES = [GYM, APARTMENTS, 'Spa ưu đãi ngày lễ', FREE];

test.describe('MP1 · Marketplace', () => {
  test('browses the catalog, filters it and reads one item', async ({ page }) => {
    const { site } = await setUpSite(page.request);
    const workspace = `/workspaces/${site.workspaceId}`;

    await page.goto(`/sites/${site.id}`);
    const sidebar = page.getByRole('navigation', { name: 'Điều hướng chính' });
    await sidebar.getByRole('link', { name: 'Marketplace', exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`${workspace}/marketplace$`));
    await expect(page.getByRole('heading', { level: 1, name: 'Marketplace' })).toBeVisible();
    await expect(sidebar.getByRole('link', { name: 'Marketplace', exact: true })).toHaveAttribute(
      'aria-current',
      'page',
    );
    await expect(sidebar.getByRole('link', { name: 'Marketplace' })).not.toContainText('Nâng cấp');
    // It opens board 32 once there is one (MP2): until then it is text, not a control's outline.
    await expect(page.getByText('Đã sở hữu · 0')).toBeVisible();
    await expect(page.getByText('Đã sở hữu · 0')).toHaveCSS('border-top-style', 'none');

    const cards = page.getByRole('article');
    await expect(cards.getByRole('heading', { level: 2 })).toHaveText(NAMES);
    await expect(page.getByRole('status')).toHaveText('4 mẫu');
    await expect(page.getByRole('article', { name: GYM })).toContainText('399.000đ');
    await expect(page.getByRole('article', { name: FREE })).toContainText('Miễn phí');
    await expect(page.getByRole('button', { name: /Mua mẫu|Nhận mẫu/ })).toHaveCount(0);

    // Search ignores accents.
    const search = page.getByRole('searchbox', { name: 'Tìm trên marketplace' });
    await search.fill('phong tap');
    await expect(cards.getByRole('heading', { level: 2 })).toHaveText([GYM]);
    await search.fill('zzzz');
    await expect(
      page.getByRole('heading', { level: 2, name: 'Marketplace chưa có mẫu khớp “zzzz”' }),
    ).toBeVisible();
    await expect(page.getByRole('link', { name: 'Xem mẫu hệ thống' })).toHaveAttribute(
      'href',
      `${workspace}/templates?source=system`,
    );
    await page.getByRole('button', { name: 'Xóa bộ lọc' }).click();
    await expect(cards).toHaveCount(4);

    // Price filter.
    const price = page.getByRole('combobox', { name: 'Giá' });
    await price.selectOption('free');
    await expect(cards.getByRole('heading', { level: 2 })).toHaveText([FREE]);
    await price.selectOption('paid');
    await expect(cards).toHaveCount(3);
    await price.selectOption('all');

    // Industry chip.
    const industries = page.getByRole('group', { name: 'Ngành' });
    const spa = industries.getByRole('button', { name: 'Spa & làm đẹp' });
    await spa.click();
    await expect(spa).toHaveAttribute('aria-pressed', 'true');
    await expect(cards.getByRole('heading', { level: 2 })).toHaveText(['Spa ưu đãi ngày lễ']);
    await industries.getByRole('button', { name: 'Tất cả' }).click();
    await expect(cards).toHaveCount(4);

    // Every item shares one date and one rank in MP1, so both sorts keep the catalog's order.
    const sort = page.getByRole('combobox', { name: 'Sắp xếp' });
    await sort.selectOption('popular');
    await expect(cards.getByRole('heading', { level: 2 })).toHaveText(NAMES);
    await sort.selectOption('recent');
    await expect(cards.getByRole('heading', { level: 2 })).toHaveText(NAMES);

    // One item. A mouse press focuses the card's link without the card's ring; Tab shows it.
    const gym = page.getByRole('article', { name: GYM });
    await gym.getByRole('link', { name: GYM }).hover();
    await page.mouse.down();
    await expect(gym.getByRole('link', { name: GYM })).toBeFocused();
    await expect(gym).toHaveCSS('outline-style', 'none');
    await page.keyboard.press('Tab');
    const next = page.getByRole('article', { name: APARTMENTS });
    await expect(next.getByRole('link', { name: APARTMENTS })).toBeFocused();
    await expect(next).toHaveCSS('outline-style', 'solid');
    await page.mouse.up();
    await expect(page).toHaveURL(new RegExp(`${workspace}/marketplace/mp-khai-truong-phong-tap$`));
    await expect(page.getByRole('heading', { level: 1, name: GYM })).toBeVisible();
    await expect(page.getByText('Sự kiện / webinar · Thể hình · 7 section · v1')).toBeVisible();
    await expect(
      page.getByRole('region', { name: `Bản xem trước trên máy tính: ${GYM}` }),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Điện thoại' }).click();
    await expect(
      page.getByRole('region', { name: `Bản xem trước trên điện thoại: ${GYM}` }),
    ).toBeVisible();

    const includes = page.getByRole('region', { name: 'Gồm những gì' });
    await expect(includes).toContainText('7 section');
    await expect(includes).toContainText('chữ mẫu tiếng Việt');
    await expect(includes).toContainText('form thu lead');
    await expect(includes).not.toContainText('ảnh');
    await expect(page.getByRole('region', { name: 'Giấy phép' })).toContainText(
      'Dùng cho mọi site trong workspace mua.',
    );
    await expect(page.getByRole('region', { name: 'Có gì mới ở v1 · 21/11/2026' })).toContainText(
      'Phiên bản đầu tiên.',
    );
    const priceBox = page.getByRole('complementary', { name: 'Giá' });
    await expect(priceBox).toContainText('399.000đ');
    await expect(priceBox).toContainText('Một lần · Đã gồm VAT');
    await expect(priceBox.getByRole('button')).toHaveCount(0);
    await expect(priceBox.getByRole('link')).toHaveCount(0);

    // The terms open in a dialog; closing it gives focus back to its button.
    const open = page.getByRole('button', { name: 'Điều khoản giấy phép' });
    await open.click();
    const dialog = page.getByRole('dialog', { name: 'Điều khoản giấy phép' });
    await expect(dialog.getByRole('listitem')).toHaveCount(6);
    await dialog.getByRole('button', { name: 'Đóng' }).click();
    await expect(dialog).toBeHidden();
    await expect(open).toBeFocused();
    await open.click();
    await page.keyboard.press('Escape');
    await expect(open).toBeFocused();

    // An item without a form shows no form line; the free one shows its price as free.
    await page.goto(`${workspace}/marketplace/mp-spa-uu-dai-ngay-le`);
    await expect(page.getByRole('region', { name: 'Gồm những gì' })).not.toContainText(
      'form thu lead',
    );
    await page.goto(`${workspace}/marketplace/mp-khoa-hoc-tieng-anh-tre-em`);
    await expect(page.getByRole('complementary', { name: 'Giá' })).toContainText('Miễn phí');

    // An id the catalog does not list is not found.
    await page.goto(`${workspace}/marketplace/mp-khong-co`);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Không tìm thấy trang');
  });

  test('an Editor sees the Marketplace too', async ({ page, browser, request }) => {
    const { site } = await setUpSite(page.request);
    const editor = await joinAs(page.request, browser, request, site.workspaceId, 'editor', [
      site.id,
    ]);
    try {
      await editor.goto(`/sites/${site.id}`);
      await editor
        .getByRole('navigation', { name: 'Điều hướng chính' })
        .getByRole('link', { name: 'Marketplace', exact: true })
        .click();
      await expect(editor.getByRole('heading', { level: 1, name: 'Marketplace' })).toBeVisible();
      await expect(editor.getByRole('article')).toHaveCount(4);
    } finally {
      await editor.context().close();
    }
  });

  test('a workspace of someone else is not found', async ({ page, browser }) => {
    const { site } = await setUpSite(page.request);
    const other = await browser.newContext();
    try {
      await setUpSite(other.request);
      const otherPage = await other.newPage();
      for (const path of ['marketplace', 'marketplace/mp-khai-truong-phong-tap']) {
        await otherPage.goto(`/workspaces/${site.workspaceId}/${path}`);
        await expect(otherPage.getByRole('heading', { level: 1 })).toHaveText(
          'Không tìm thấy trang',
        );
      }
    } finally {
      await other.close();
    }
  });

  for (const viewport of SCAN_VIEWPORTS) {
    test(`Marketplace and an item are accessible at ${viewport.width} px`, async ({ page }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      const { site } = await setUpSite(page.request);
      const workspace = `/workspaces/${site.workspaceId}`;
      await page.goto(`${workspace}/marketplace`);
      await expect(page.getByRole('heading', { level: 1, name: 'Marketplace' })).toBeVisible();
      await expectAccessible(page, 'Marketplace');
      await expectNoSidewaysScroll(page, 'Marketplace');
      // The empty result echoes the search: a pasted address, one long word, wraps in it.
      const pasted = `https://${'maukhongco'.repeat(20)}.example`;
      await page.getByRole('searchbox', { name: 'Tìm trên marketplace' }).fill(pasted);
      await expect(
        page.getByRole('heading', { level: 2, name: `Marketplace chưa có mẫu khớp “${pasted}”` }),
      ).toBeVisible();
      await expectNoSidewaysScroll(page, 'Marketplace with a long search');
      await page.goto(`${workspace}/marketplace/mp-khai-truong-phong-tap`);
      await expect(page.getByRole('heading', { level: 1, name: GYM })).toBeVisible();
      await expectAccessible(page, 'Marketplace item');
      await expectNoSidewaysScroll(page, 'Marketplace item');
    });
  }
});
