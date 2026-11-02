import { expect, type Page, test } from '@playwright/test';
import { endpoints, siteSchema } from '@plp/contracts';
import { Editor } from '../support/editor.js';
import { fetchPublic } from '../support/public-site.js';
import {
  call,
  createPageViaApi,
  createSiteViaApi,
  setUpLeadCaptureViaApi,
  setUpSite,
  uniqueId,
} from '../support/setup.js';
import { sendLead } from '../support/visitor.js';
import { siteOrigin, urls } from '../urls.js';

const TITLE = 'Tư vấn niềng răng';

/** A "Thu lead" page of the site, published as v1 from the editor; returns its id and slug. */
async function publishLeadPage(
  page: Page,
  siteId: string,
): Promise<{ pageId: string; slug: string }> {
  const slug = `tu-van-${uniqueId()}`;
  const created = await createPageViaApi(page.request, siteId, {
    title: TITLE,
    slug,
    start: {
      kind: 'goal',
      goal: 'lead',
      brief: { offer: 'Niềng răng trong suốt', audience: '', phone: '0901 234 567' },
      style: 'calm',
    },
  });
  const editor = new Editor(page);
  await editor.goto(siteId, created.page.id);
  await editor.publish(1, 'Có form đăng ký');
  return { pageId: created.page.id, slug };
}

test.describe('E4 · deleting a page and a site (ADR-027)', () => {
  test('a live page is unpublished, then deleted; its lead stays, under "Trang đã xóa"', async ({
    page,
    browser,
    request,
  }) => {
    const { site } = await setUpSite(page.request);
    await setUpLeadCaptureViaApi(page.request, site.id);
    const { slug } = await publishLeadPage(page, site.id);
    await sendLead(browser, `${siteOrigin(site.subdomain)}/${slug}`, {
      name: 'Nguyễn Thu Hà',
      phone: '0901 234 567',
    });

    await page.goto(`/sites/${site.id}`);
    const menu = page.getByRole('button', { name: `Tùy chọn khác cho ${TITLE}` });
    await menu.click();
    // A live page goes off the web first.
    const deleteItem = page.getByRole('menuitem', { name: 'Xóa trang' });
    await expect(deleteItem).toHaveAttribute('aria-disabled', 'true');
    await expect(deleteItem).toContainText('Gỡ xuất bản trước khi xóa');
    await page.getByRole('menuitem', { name: 'Gỡ xuất bản', exact: true }).click();
    const unpublish = page.getByRole('alertdialog');
    await unpublish.getByRole('textbox').fill('Hết chương trình');
    await unpublish.getByRole('button', { name: 'Gỡ xuất bản' }).click();
    await expect(unpublish).toBeHidden();
    await expect(
      page.getByRole('row', { name: new RegExp(TITLE) }).getByText('Đã gỡ', { exact: true }),
    ).toBeVisible();

    await menu.click();
    await page.getByRole('menuitem', { name: 'Xóa trang' }).click();
    const confirm = page.getByRole('alertdialog', { name: `Xóa trang “${TITLE}”?` });
    await expect(confirm.getByRole('region', { name: 'Bị xóa' })).toContainText(
      'Lịch sử phiên bản',
    );
    await expect(confirm.getByRole('region', { name: 'Vẫn giữ' })).toContainText('Lead đã nhận');
    await confirm.getByRole('button', { name: 'Xóa trang' }).click();

    await expect(page.getByText(`Đã xóa trang “${TITLE}”`, { exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Chưa có trang nào' })).toBeVisible();
    const activity = page.getByRole('region', { name: 'Hoạt động xuất bản gần đây' });
    await expect(activity.getByRole('listitem').nth(0)).toContainText(
      `Ngọc Anh xóa trang “${TITLE}”`,
    );
    // The page's activity is kept, and no link leads to the page any more.
    await expect(activity.getByRole('link', { name: /Xem lịch sử phiên bản/ })).toHaveCount(0);
    expect((await fetchPublic(request, site.subdomain, `/${slug}`)).status).toBe(404);

    // The lead stays, with the page named for what happened to it.
    await page.goto(`/sites/${site.id}/leads?range=all`);
    const lead = page.getByRole('row', { name: /Nguyễn Thu Hà/ });
    await expect(lead).toContainText('Trang đã xóa');
    await lead.getByRole('link', { name: 'Nguyễn Thu Hà' }).click();
    const detail = page.getByRole('complementary', { name: 'Nguyễn Thu Hà' });
    await expect(detail).toContainText('Trang đã xóa · v1');
    await expect(detail).toContainText('Nội dung đồng ý bản 1');
  });

  test('a page that never went live is deleted from its own header, back to the page list', async ({
    page,
  }) => {
    const { site } = await setUpSite(page.request);
    const created = await createPageViaApi(page.request, site.id, {
      title: 'Bản nháp thử',
      slug: `nhap-${uniqueId()}`,
      start: { kind: 'blank' },
    });

    await page.goto(`/sites/${site.id}/pages/${created.page.id}/history`);
    await page.getByRole('button', { name: 'Tùy chọn khác' }).click();
    await page.getByRole('menuitem', { name: 'Xóa trang' }).click();
    await page
      .getByRole('alertdialog', { name: 'Xóa trang “Bản nháp thử”?' })
      .getByRole('button', { name: 'Xóa trang' })
      .click();

    await expect(page).toHaveURL(new RegExp(`/sites/${site.id}$`));
    await expect(page.getByRole('heading', { name: 'Chưa có trang nào' })).toBeVisible();
    await page.goto(`/sites/${site.id}/pages/${created.page.id}/history`);
    await expect(page.getByRole('heading', { name: 'Không tìm thấy trang' })).toBeVisible();
  });

  test('the owner deletes a site with its name typed again; its address is free again', async ({
    page,
    browser,
    request,
  }) => {
    const { site } = await setUpSite(page.request, 'Nha khoa Quận Nhất');
    await setUpLeadCaptureViaApi(page.request, site.id);
    const { slug } = await publishLeadPage(page, site.id);
    await sendLead(browser, `${siteOrigin(site.subdomain)}/${slug}`, {
      name: 'Trần Quốc Bảo',
      phone: '0938 512 840',
    });

    await page.goto(`/sites/${site.id}/settings`);
    const card = page.getByRole('region', { name: 'Xóa site' });
    await expect(card.getByRole('list', { name: 'Sẽ bị xóa' })).toContainText(
      '1 trang, 1 đang live',
    );
    await expect(card.getByRole('list', { name: 'Sẽ bị xóa' })).toContainText('1 lead');
    await expect(card.getByRole('link', { name: 'Mở hộp thư lead' })).toHaveAttribute(
      'href',
      `/sites/${site.id}/leads?range=all`,
    );
    await card.getByRole('button', { name: 'Xóa site' }).click();
    const dialog = page.getByRole('dialog', { name: 'Xóa site Nha khoa Quận Nhất?' });
    const confirm = dialog.getByRole('button', { name: 'Xóa site' });
    await expect(confirm).toBeDisabled();
    await dialog
      .getByRole('textbox', { name: 'Nhập tên site để xác nhận' })
      .fill('Nha khoa Quan Nhat');
    await expect(confirm).toBeDisabled();
    await dialog
      .getByRole('textbox', { name: 'Nhập tên site để xác nhận' })
      .fill('Nha khoa Quận Nhất');
    await confirm.click();

    await expect(page).toHaveURL(new RegExp(`/workspaces/${site.workspaceId}(/|$)`));
    // Nothing of the site answers any more, in the admin or on the web.
    await page.goto(`/sites/${site.id}`);
    await expect(page.getByRole('heading', { name: 'Không tìm thấy trang' })).toBeVisible();
    expect((await fetchPublic(request, site.subdomain, `/${slug}`)).status).toBe(404);
    const missing = await page.request.get(`${urls.admin}/api${endpoints.getSite.path(site.id)}`);
    expect(missing.status()).toBe(404);

    // Its subdomain is free for a new site.
    const again = await createSiteViaApi(page.request, site.workspaceId, {
      name: 'Nha khoa Quận Nhất',
      subdomain: site.subdomain,
    });
    expect(siteSchema.parse(again).subdomain).toBe(site.subdomain);
    await call(page.request, 'GET', endpoints.getSite.path(again.id), siteSchema);
  });
});
