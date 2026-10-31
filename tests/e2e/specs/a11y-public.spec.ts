import { type Cookie, expect, test } from '@playwright/test';
import {
  colorSchemeIds,
  createPreviewLinkRequestSchema,
  endpoints,
  previewLinkResponseSchema,
  type Site,
  themePresetIds,
} from '@plp/contracts';
import { expectAccessible, SCAN_VIEWPORTS } from '../support/axe.js';
import {
  createSchemePageViaApi,
  publishViaApi,
  setThemeViaApi,
  uploadImageViaApi,
} from '../support/board.js';
import { call, setUpLeadCaptureViaApi, setUpSite } from '../support/setup.js';
import { FILLED_CONSENT } from '../support/visitor.js';
import { siteOrigin } from '../urls.js';

/*
 * WCAG 2.2 AA scans (axe-core) of what visitors see: a live page in each color scheme of each
 * theme (every section and variant), a preview, the result pages of a form sent without
 * JavaScript, and the not-found pages.
 */

let site: Site;
let schemePages: Array<{ scheme: string; pageId: string }>;
let session: Cookie[];

test.beforeAll(async ({ browser }) => {
  const context = await browser.newContext();
  ({ site } = await setUpSite(context.request));
  await setUpLeadCaptureViaApi(context.request, site.id);
  const photo = await uploadImageViaApi(context.request, site.id, 'Bác sĩ tư vấn cho khách hàng');
  schemePages = [];
  for (const scheme of colorSchemeIds) {
    const pageId = await createSchemePageViaApi(context.request, site.id, scheme, photo);
    await publishViaApi(context.request, pageId, 'Bản đầu tiên');
    schemePages.push({ scheme, pageId });
  }
  session = (await context.storageState()).cookies;
  await context.close();
});

test.describe('Accessibility · public pages', () => {
  test.beforeEach(async ({ context }) => {
    await context.addCookies(session);
  });

  for (const theme of themePresetIds) {
    test(`live pages in every color scheme of the theme "${theme}"`, async ({ page, browser }) => {
      await setThemeViaApi(page.request, site.id, theme);
      for (const { pageId } of schemePages) {
        await publishViaApi(page.request, pageId, `Giao diện ${theme}`);
      }
      const context = await browser.newContext();
      const visitor = await context.newPage();
      for (const viewport of SCAN_VIEWPORTS) {
        await visitor.setViewportSize({ width: viewport.width, height: viewport.height });
        for (const { scheme } of schemePages) {
          const screen = `${theme} · ${scheme} · ${viewport.width} px`;
          await visitor.goto(`${siteOrigin(site.subdomain)}/bang-mau-${scheme}`);
          const form = visitor.getByRole('form', { name: 'Đăng ký tư vấn miễn phí' });
          await expect(form.getByRole('checkbox', { name: FILLED_CONSENT })).toBeVisible();
          // The answer of the first question open, as a visitor reads it.
          await visitor.locator('summary').first().click();
          await expectAccessible(visitor, screen);
          // The form with its errors, after a send with nothing filled in.
          await form.getByRole('button', { name: 'Gửi đăng ký' }).click();
          await expect(form.getByRole('textbox', { name: 'Họ và tên' })).toBeFocused();
          await expectAccessible(visitor, `${screen} · lỗi form`);
        }
      }
      await context.close();
    });
  }

  test('a preview, the no-JavaScript form results and the not-found pages', async ({
    page,
    browser,
  }) => {
    const [first] = schemePages;
    if (first === undefined) {
      throw new Error('No page to preview');
    }
    const preview = await call(
      page.request,
      'POST',
      endpoints.createPreviewLink.path(first.pageId),
      previewLinkResponseSchema,
      createPreviewLinkRequestSchema.parse({ kind: 'draft' }),
    );
    for (const viewport of SCAN_VIEWPORTS) {
      const size = { width: viewport.width, height: viewport.height };
      const context = await browser.newContext({ viewport: size });
      const visitor = await context.newPage();
      await visitor.goto(preview.url);
      await expect(visitor.getByText('Bản xem trước', { exact: false }).first()).toBeVisible();
      await expectAccessible(visitor, `Bản xem trước · ${viewport.width} px`);

      await visitor.goto(`${siteOrigin(site.subdomain)}/khong-co-trang-nay`);
      await expectAccessible(visitor, `404 của site · ${viewport.width} px`);
      await visitor.goto(`http://khongcositenay${Date.now().toString(36)}.localhost:3101/`);
      await expectAccessible(visitor, `404 không có site · ${viewport.width} px`);
      await visitor.goto(`${siteOrigin(site.subdomain)}/_preview/khong-hop-le`);
      await expectAccessible(visitor, `404 của bản xem trước · ${viewport.width} px`);
      await context.close();

      // The result pages of a form sent without JavaScript. axe runs in the page, so the form is
      // sent the way a browser without script sends it: a native submit, past the page script.
      const visit = await browser.newContext({ viewport: size });
      const plain = await visit.newPage();
      await plain.goto(`${siteOrigin(site.subdomain)}/bang-mau-${first.scheme}`);
      const form = plain.getByRole('form', { name: 'Đăng ký tư vấn miễn phí' });
      await form.getByRole('textbox', { name: 'Họ và tên' }).fill('Trần Quốc Bảo');
      await form.getByRole('textbox', { name: 'Số điện thoại' }).fill('0938 512 840');
      await form.evaluate((element) => {
        if (element instanceof HTMLFormElement) {
          element.submit();
        }
      });
      await expect(plain.getByRole('heading', { name: 'Chưa gửi được đăng ký' })).toBeVisible();
      await expectAccessible(plain, `/_lead lỗi · ${viewport.width} px`);
      await plain.goto(`${siteOrigin(site.subdomain)}/_lead?status=received&back=/`);
      await expect(plain.getByRole('heading', { name: 'Đã nhận đăng ký của bạn' })).toBeVisible();
      await expectAccessible(plain, `/_lead đã nhận · ${viewport.width} px`);
      await visit.close();
    }
  });
});
