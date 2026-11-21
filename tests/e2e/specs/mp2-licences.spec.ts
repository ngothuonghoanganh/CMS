import { readFileSync } from 'node:fs';
import { expect, type Page, test } from '@playwright/test';
import { endpoints, meResponseSchema } from '@plp/contracts';
import { expectAccessible, expectNoSidewaysScroll, SCAN_VIEWPORTS } from '../support/axe.js';
import { Editor } from '../support/editor.js';
import {
  bundledCatalog,
  seedLicence,
  V2_HEADING,
  V2_NOTE,
  VERSIONED_ITEM_ID,
  VERSIONED_ITEM_NAME,
  writeE2eCatalog,
} from '../support/marketplace-catalog.js';
import { joinAs } from '../support/members.js';
import { fetchPublic, firstHeading } from '../support/public-site.js';
import {
  call,
  createSiteViaApi,
  newSubdomain,
  setUpLeadCaptureViaApi,
  setUpSite,
  uniqueId,
} from '../support/setup.js';

/*
 * MP2 (ADR-036): receiving the free item, board 32, the library and the editor with an item the
 * workspace owns, and a new version. Buying is MP3. Who may claim, the versions of a licence and
 * the isolation of workspaces are the API's integration tests; this is the person's path.
 */

const FREE = 'Khóa học tiếng Anh trẻ em';
const FREE_ID = 'mp-khoa-hoc-tieng-anh-tre-em';
const GYM = 'Khai trương phòng tập';
const PAID = [GYM, 'Mở bán dự án căn hộ', 'Spa ưu đãi ngày lễ'];
const E2E_DATABASE = 'plp_e2e';

/** Opens the free item's board 31 and receives it, ticking the terms first. */
async function claimFreeItem(page: Page, workspace: string): Promise<void> {
  await page.goto(`${workspace}/marketplace/${FREE_ID}`);
  const priceBox = page.getByRole('complementary', { name: 'Giá' });
  await priceBox.getByRole('button', { name: 'Nhận mẫu' }).click();
  const dialog = page.getByRole('dialog', { name: 'Nhận mẫu' });
  const confirm = dialog.getByRole('button', { name: 'Nhận mẫu' });
  await expect(confirm).toBeDisabled();
  await dialog.getByRole('checkbox', { name: 'Tôi đồng ý với điều khoản giấy phép' }).check();
  await expect(confirm).toBeEnabled();
  await confirm.click();
  await expect(dialog).toBeHidden();
  await expect(priceBox.getByText('Workspace đã sở hữu · v1')).toBeVisible();
}

/** "Tạo trang" of an owned item from the library: names the page and opens its editor. */
async function createPageFromLibrary(
  page: Page,
  workspace: string,
  siteId: string,
  name: string,
  slug: string,
): Promise<void> {
  await page.goto(`${workspace}/templates?source=marketplace&site=${siteId}`);
  await page.getByRole('button', { name: `Dùng mẫu ${FREE}` }).click();
  const dialog = page.getByRole('dialog', { name: 'Tạo trang từ mẫu' });
  await expect(dialog.getByRole('combobox', { name: 'Site' })).toHaveValue(siteId);
  await dialog.getByRole('textbox', { name: /Tên trang/ }).fill(name);
  await dialog.getByRole('textbox', { name: /Đường dẫn/ }).fill(slug);
  await expect(dialog.getByText('Đường dẫn này dùng được.')).toBeVisible();
  await dialog.getByRole('button', { name: 'Tạo bản nháp và mở editor' }).click();
  await expect(page).toHaveURL(new RegExp(`/sites/${siteId}/pages/[a-f0-9]{24}/edit$`));
}

/** The library's card of a marketplace item: a system template can share its name. */
function marketCard(page: Page, name: string) {
  return page.getByRole('article', { name, exact: true }).filter({ hasText: 'MARKETPLACE' });
}

test.describe('MP2 · Licences of marketplace items', () => {
  test('receives the free item and uses it in every site, from the library to a live page', async ({
    page,
    request,
  }) => {
    const { site } = await setUpSite(page.request);
    await setUpLeadCaptureViaApi(page.request, site.id);
    const kitchen = await createSiteViaApi(page.request, site.workspaceId, {
      name: 'Bếp Nhà Mây',
      subdomain: newSubdomain(),
    });
    const workspace = `/workspaces/${site.workspaceId}`;

    // Board 30 → the free item on board 31.
    await page.goto(`${workspace}/marketplace`);
    await page.getByRole('combobox', { name: 'Giá' }).selectOption('free');
    const cards = page.getByRole('article');
    await expect(cards.getByRole('heading', { level: 2 })).toHaveText([FREE]);
    await expect(page.getByRole('link', { name: 'Đã sở hữu · 0' })).toBeVisible();
    await cards.getByRole('link', { name: FREE }).click();
    await expect(page).toHaveURL(new RegExp(`${workspace}/marketplace/${FREE_ID}$`));

    // "Nhận mẫu" needs the terms ticked; nothing is taken or paid.
    const priceBox = page.getByRole('complementary', { name: 'Giá' });
    await expect(priceBox).toContainText('Miễn phí');
    await priceBox.getByRole('button', { name: 'Nhận mẫu' }).click();
    const dialog = page.getByRole('dialog', { name: 'Nhận mẫu' });
    const confirm = dialog.getByRole('button', { name: 'Nhận mẫu' });
    const terms = dialog.getByRole('checkbox', { name: 'Tôi đồng ý với điều khoản giấy phép' });
    await expect(terms).not.toBeChecked();
    await expect(confirm).toBeDisabled();
    await terms.check();
    await expect(confirm).toBeEnabled();
    await confirm.click();
    await expect(dialog).toBeHidden();
    await expect(priceBox.getByText('Workspace đã sở hữu · v1')).toBeVisible();
    await expect(priceBox.getByRole('button', { name: 'Nhận mẫu' })).toHaveCount(0);
    await expect(priceBox.getByRole('link', { name: 'Tạo trang từ mẫu' })).toHaveAttribute(
      'href',
      `${workspace}/templates/${FREE_ID}`,
    );

    // Board 30 now opens board 32.
    await page.goto(`${workspace}/marketplace`);
    await page.getByRole('link', { name: 'Đã sở hữu · 1' }).click();
    await expect(page).toHaveURL(new RegExp(`${workspace}/marketplace/owned$`));
    await expect(page.getByRole('heading', { level: 1, name: 'Sản phẩm đã mua' })).toBeVisible();
    const rows = page.getByRole('region', { name: 'Template đã sở hữu' }).getByRole('listitem');
    await expect(rows).toHaveCount(1);
    await expect(rows.first()).toContainText(FREE);
    await expect(rows.first()).toContainText('Payload · Miễn phí');
    await expect(rows.first()).toContainText('Mọi site trong workspace');
    await expect(rows.first()).toContainText('v1');
    await expect(rows.first()).not.toContainText('CÓ BẢN');

    // The library: the tab, the chip, and the unowned items with only "Xem trên Marketplace".
    await page.goto(`${workspace}/templates?site=${site.id}`);
    await page
      .getByRole('navigation', { name: 'Nguồn mẫu' })
      .getByRole('link', { name: 'Đã sở hữu từ Marketplace · 1' })
      .click();
    const owned = page.getByRole('article');
    await expect(owned).toHaveCount(1);
    await expect(owned.first()).toContainText(FREE);
    await expect(owned.first()).toContainText('MARKETPLACE · ĐÃ SỞ HỮU');

    await page.goto(`${workspace}/templates?site=${site.id}`);
    await expect(marketCard(page, FREE)).toContainText('MARKETPLACE · ĐÃ SỞ HỮU');
    for (const name of PAID) {
      const card = marketCard(page, name);
      await expect(card).toContainText('MARKETPLACE · TRẢ PHÍ');
      await expect(card.getByRole('link')).toHaveText([`Xem trên Marketplace ${name}`]);
      await expect(card.getByRole('link')).toHaveAttribute(
        'href',
        new RegExp(`${workspace}/marketplace/mp-`),
      );
      await expect(card.getByRole('button')).toHaveCount(0);
    }
    const hidePaid = page.getByRole('checkbox', { name: /^Ẩn mẫu trả phí/ });
    await hidePaid.check();
    for (const name of PAID) {
      await expect(marketCard(page, name)).toHaveCount(0);
    }
    await expect(marketCard(page, FREE)).toBeVisible();
    await hidePaid.uncheck();
    await expect(marketCard(page, GYM)).toBeVisible();

    // A page from the owned item in the first site: edit a sample text, publish, read it live.
    const slug = `tieng-anh-${uniqueId()}`;
    await createPageFromLibrary(page, workspace, site.id, 'Tiếng Anh cho bé', slug);
    const editor = new Editor(page);
    await expect(editor.canvas).toBeVisible();
    const heading = `Học tiếng Anh vui cùng bé ${uniqueId()}`;
    await editor.setHeroHeading(heading);
    await editor.publish(1);
    const live = await fetchPublic(request, site.subdomain, `/${slug}`);
    expect(live.status).toBe(200);
    expect(firstHeading(live.html)).toBe(heading);

    // The licence covers every site: a second site makes a page from it without claiming again.
    await createPageFromLibrary(
      page,
      workspace,
      kitchen.id,
      'Tiếng Anh ở bếp',
      `tieng-anh-${uniqueId()}`,
    );
    await expect(new Editor(page).canvas).toBeVisible();
    await expect(page.getByRole('heading', { level: 1, name: 'Tiếng Anh ở bếp' })).toBeVisible();

    // The editor's "Áp dụng mẫu…" lists the owned item and no unowned one.
    const second = new Editor(page);
    await second.topBar.getByRole('button', { name: 'Thao tác khác với trang' }).click();
    await page.getByRole('menuitem', { name: 'Áp dụng mẫu…' }).click();
    const apply = page.getByRole('dialog', { name: 'Áp dụng mẫu' });
    const options = apply.getByRole('combobox', { name: 'Mẫu' }).getByRole('option');
    await expect(options.filter({ hasText: `${FREE} · v1` })).toHaveCount(1);
    for (const name of PAID) {
      await expect(options.filter({ hasText: new RegExp(`^${name}( · v\\d+)?$`) })).toHaveCount(0);
    }
  });

  test('an Editor receives the item, a Support member sees who can, another workspace finds nothing', async ({
    page,
    browser,
    request,
  }) => {
    const { site } = await setUpSite(page.request);
    const workspace = `/workspaces/${site.workspaceId}`;
    const editor = await joinAs(page.request, browser, request, site.workspaceId, 'editor', [
      site.id,
    ]);
    const support = await joinAs(page.request, browser, request, site.workspaceId, 'support', [
      site.id,
    ]);
    const other = await browser.newContext();
    try {
      await support.goto(`${workspace}/marketplace/${FREE_ID}`);
      const box = support.getByRole('complementary', { name: 'Giá' });
      await expect(box).toContainText(
        'Chỉ Chủ sở hữu, Quản trị và Biên tập nhận được mẫu miễn phí cho workspace.',
      );
      await expect(box.getByRole('button')).toHaveCount(0);

      await claimFreeItem(editor, workspace);
      await editor.goto(`${workspace}/marketplace/owned`);
      await expect(editor.getByRole('region', { name: 'Template đã sở hữu' })).toContainText(FREE);

      // Another account's workspace has no licence and no right to this workspace's board 18.
      await setUpSite(other.request);
      const otherPage = await other.newPage();
      for (const path of [`templates/${FREE_ID}`, 'marketplace/owned']) {
        await otherPage.goto(`${workspace}/${path}`);
        await expect(otherPage.getByRole('heading', { level: 1 })).toHaveText(
          'Không tìm thấy trang',
        );
      }
      // Its own workspace holds nothing: board 18 of the item is not found there either.
      const me = await call(other.request, 'GET', endpoints.me.path(), meResponseSchema);
      const ownWorkspace = me.memberships[0]?.workspace.id;
      expect(ownWorkspace).toBeDefined();
      await otherPage.goto(`/workspaces/${ownWorkspace}/templates/${FREE_ID}`);
      await expect(otherPage.getByRole('heading', { level: 1 })).toHaveText('Không tìm thấy trang');
    } finally {
      await other.close();
      await editor.context().close();
      await support.context().close();
    }
  });

  test('updates an item whose version changed, and new pages follow the new version', async ({
    page,
  }) => {
    const { site } = await setUpSite(page.request);
    const workspace = `/workspaces/${site.workspaceId}`;
    const me = await call(page.request, 'GET', endpoints.me.path(), meResponseSchema);
    await seedLicence(E2E_DATABASE, site.workspaceId, me.user.id);

    await page.goto(`${workspace}/marketplace/owned`);
    const row = page
      .getByRole('region', { name: 'Template đã sở hữu' })
      .getByRole('listitem')
      .filter({ hasText: VERSIONED_ITEM_NAME });
    await expect(row).toContainText('Payload · Đã mua');
    await expect(row).toContainText('Đã ngừng bán');
    await expect(row).toContainText('v1');
    await expect(row).toContainText('CÓ BẢN v2');
    await expect(page.getByRole('link', { name: 'Đã sở hữu · 1' })).toHaveCount(0);

    // Board 31 of a withdrawn item shows to its holder, with the new version announced.
    await page.goto(`${workspace}/marketplace/${VERSIONED_ITEM_ID}`);
    const box = page.getByRole('complementary', { name: 'Giá' });
    await expect(box).toContainText('Workspace đã sở hữu · v1');
    await expect(box).toContainText('Có phiên bản mới v2.');
    await expect(box).toContainText('Mẫu đã ngừng bán. Workspace vẫn dùng và cập nhật được.');
    await box.getByRole('link', { name: 'Cập nhật' }).click();
    await expect(page).toHaveURL(new RegExp(`${workspace}/marketplace/owned$`));

    await page.getByRole('button', { name: `Cập nhật ${VERSIONED_ITEM_NAME}` }).click();
    const dialog = page.getByRole('dialog', { name: `Cập nhật “${VERSIONED_ITEM_NAME}” lên v2?` });
    await expect(dialog.getByRole('list', { name: 'Có gì mới' })).toContainText(V2_NOTE);
    await expect(dialog).toContainText('Chưa có trang nào tạo từ mẫu này.');
    await dialog.getByRole('button', { name: 'Cập nhật mẫu' }).click();
    await expect(dialog).toBeHidden();
    await expect(row).not.toContainText('CÓ BẢN');
    await expect(row).toContainText('v2');

    // The page made from it now has v2's heading.
    await row.getByRole('button', { name: `Tạo trang từ ${VERSIONED_ITEM_NAME}` }).click();
    const create = page.getByRole('dialog', { name: 'Tạo trang từ mẫu' });
    await create.getByRole('button', { name: 'Tạo bản nháp và mở editor' }).click();
    await expect(page).toHaveURL(new RegExp(`/sites/${site.id}/pages/[a-f0-9]{24}/edit$`));
    await expect(new Editor(page).canvas.getByText(V2_HEADING).first()).toBeVisible();
  });

  test('the E2E catalog lists exactly the bundled items and adds only withdrawn ones', () => {
    const bundled = bundledCatalog();
    const generated = JSON.parse(readFileSync(writeE2eCatalog(), 'utf8')) as typeof bundled;
    const listed = (items: typeof bundled.items) =>
      items.filter((item) => item.status === 'listed');
    expect(listed(generated.items)).toEqual(listed(bundled.items));
    expect(generated.items.slice(0, bundled.items.length)).toEqual(bundled.items);
    expect(generated.items.slice(bundled.items.length).map((item) => item.status)).toEqual([
      'withdrawn',
    ]);
    expect({ ...generated, items: [] }).toEqual({ ...bundled, items: [] });
  });

  for (const viewport of SCAN_VIEWPORTS) {
    test(`board 32 and an owned item are accessible at ${viewport.width} px`, async ({ page }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      const { site } = await setUpSite(page.request);
      const workspace = `/workspaces/${site.workspaceId}`;
      const me = await call(page.request, 'GET', endpoints.me.path(), meResponseSchema);
      await seedLicence(E2E_DATABASE, site.workspaceId, me.user.id);
      await page.goto(`${workspace}/marketplace/owned`);
      await expect(page.getByRole('heading', { level: 1, name: 'Sản phẩm đã mua' })).toBeVisible();
      await expectAccessible(page, 'Board 32');
      await expectNoSidewaysScroll(page, 'Board 32');
      await page.goto(`${workspace}/marketplace/${FREE_ID}`);
      await expect(page.getByRole('heading', { level: 1, name: FREE })).toBeVisible();
      await expectAccessible(page, 'Board 31 free item');
      await page.goto(`${workspace}/templates?site=${site.id}`);
      await expect(marketCard(page, GYM)).toBeVisible();
      await expectAccessible(page, 'Library with marketplace cards');
      await expectNoSidewaysScroll(page, 'Library with marketplace cards');
    });
  }
});
