import { expect, type Page, test } from '@playwright/test';
import { expectAccessible, expectNoSidewaysScroll, SCAN_VIEWPORTS } from '../support/axe.js';
import { publishViaApi } from '../support/board.js';
import { setDnsRecords } from '../support/dns.js';
import {
  createPageViaApi,
  promoPage,
  setUpLeadCaptureViaApi,
  setUpSite,
  uniqueId,
} from '../support/setup.js';
import { siteOrigin, urls } from '../urls.js';

/*
 * C3 (ADR-022): a custom domain connected from its DNS records, made the primary address; the
 * page opens there and the default address redirects to it. Domains end in `.e2e.test`, which
 * Chromium sends to this machine, and their DNS answers come from the run's zone file.
 */

const port = new URL(urls.renderer).port;

/** Adds the domain on board 14 and returns the value of its TXT record, read from the table. */
async function addDomain(page: Page, siteId: string, hostname: string): Promise<string> {
  await page.goto(`/sites/${siteId}/domain`);
  await page.getByRole('link', { name: 'Kết nối tên miền riêng' }).first().click();
  await page.getByRole('textbox', { name: 'Tên miền' }).fill(hostname);
  await page.getByRole('button', { name: 'Tiếp tục' }).click();
  const txtRow = page.getByRole('row', { name: /^TXT/ });
  await expect(txtRow).toBeVisible();
  const value = (await txtRow.getByText(/^payload-verify=/).textContent()) ?? '';
  expect(value).toMatch(/^payload-verify=[0-9a-f]{32}$/);
  return value;
}

/**
 * Presses "Kiểm tra ngay" until the domain is active. The API asks DNS at most every 5 seconds
 * per domain, so a press right after adding it shows the previous check; the customer presses again.
 */
async function checkUntilActive(page: Page, hostname: string): Promise<void> {
  const status = page.getByRole('status');
  await expect(async () => {
    if (!((await status.textContent()) ?? '').includes('đã hoạt động')) {
      await page.getByRole('button', { name: 'Kiểm tra ngay' }).click();
    }
    await expect(status).toContainText(`${hostname} đã hoạt động`, { timeout: 2000 });
  }).toPass({ intervals: [1000], timeout: 20_000 });
}

test.describe('C3 · custom domains', () => {
  test('connect a domain, make it primary: the page opens there, the default address redirects', async ({
    page,
  }) => {
    const { site } = await setUpSite(page.request);
    await setUpLeadCaptureViaApi(page.request, site.id);
    const slug = `uu-dai-${uniqueId()}`;
    const created = await createPageViaApi(page.request, site.id, promoPage(slug, 'Giảm 30%'));
    await publishViaApi(page.request, created.page.id, 'Bản đầu tiên');
    const hostname = `go.${uniqueId()}.e2e.test`;

    const txt = await addDomain(page, site.id, hostname);
    await expect(page.getByRole('status')).toContainText('Đang chờ bản ghi DNS có hiệu lực');
    await expect(page.getByRole('row', { name: /^CNAME/ })).toContainText('cname.payload.site');

    // The customer adds both records at their provider, then checks.
    setDnsRecords(hostname, { CNAME: ['cname.payload.site'] });
    setDnsRecords(`_payload.${hostname}`, { TXT: [txt] });
    await checkUntilActive(page, hostname);
    await page
      .getByRole('radio', { name: new RegExp(`Đặt ${hostname} làm địa chỉ chính`) })
      .check();
    await page.getByRole('button', { name: 'Xong' }).click();

    await expect(page).toHaveURL(new RegExp(`/sites/${site.id}/domain$`));
    const addresses = page.getByRole('region', { name: '2 địa chỉ' }).getByRole('listitem');
    const row = addresses.filter({ has: page.getByText(hostname, { exact: true }) });
    await expect(row).toContainText('ĐỊA CHỈ CHÍNH');
    await expect(row).toContainText('Hoạt động');
    await expect(addresses.filter({ hasText: 'MẶC ĐỊNH' })).toContainText(
      `Đang chuyển hướng → ${hostname}`,
    );

    // Visitors: the custom domain serves the page; the default address sends them there.
    const visitor = await page.context().newPage();
    const custom = `http://${hostname}:${port}/${slug}`;
    const served = await visitor.goto(custom);
    expect(served?.status()).toBe(200);
    await expect(visitor.getByRole('heading', { level: 1 })).toContainText('Giảm 30%');
    await visitor.goto(`${siteOrigin(site.subdomain)}/${slug}?utm_source=fb`);
    expect(visitor.url()).toBe(`${custom}?utm_source=fb`);
    await expect(visitor.locator('link[rel="canonical"]')).toHaveAttribute('href', custom);
  });

  test('a domain another site has is shown as taken, without saying whose', async ({
    page,
    browser,
  }) => {
    const first = await setUpSite(page.request);
    const hostname = `shop.${uniqueId()}.e2e.test`;
    const txt = await addDomain(page, first.site.id, hostname);
    setDnsRecords(hostname, { CNAME: ['cname.payload.site'] });
    setDnsRecords(`_payload.${hostname}`, { TXT: [txt] });
    await checkUntilActive(page, hostname);

    const other = await browser.newContext();
    try {
      const otherPage = await other.newPage();
      const second = await setUpSite(otherPage.request);
      await addDomain(otherPage, second.site.id, hostname);
      await expect(otherPage.getByRole('status')).toContainText(
        'Tên miền này đang được một site khác dùng',
      );
      await expect(otherPage.getByRole('main')).not.toContainText(first.site.name);
    } finally {
      await other.close();
    }
  });

  for (const viewport of SCAN_VIEWPORTS) {
    test(`"Tên miền" and "Kết nối tên miền riêng" are accessible at ${viewport.width} px`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      const { site } = await setUpSite(page.request);
      await page.goto(`/sites/${site.id}/domain`);
      await expect(page.getByRole('heading', { level: 1, name: 'Tên miền' })).toBeVisible();
      await expectAccessible(page, 'Tên miền');
      await expectNoSidewaysScroll(page, 'Tên miền');
      await addDomain(page, site.id, `a11y.${uniqueId()}.e2e.test`);
      await expectAccessible(page, 'Kết nối tên miền riêng');
      await expectNoSidewaysScroll(page, 'Kết nối tên miền riêng');
    });
  }
});
