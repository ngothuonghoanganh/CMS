import { type BrowserContext, expect, type Page, test } from '@playwright/test';
import { analyticsReportSchema, endpoints, type Site } from '@plp/contracts';
import { getPageViaApi, publishViaApi, saveDraftViaApi } from '../support/board.js';
import { Editor } from '../support/editor.js';
import {
  call,
  createPageViaApi,
  promoPage,
  setUpLeadCaptureViaApi,
  setUpSite,
  uniqueId,
} from '../support/setup.js';
import { FILLED_CONSENT } from '../support/visitor.js';
import { siteOrigin } from '../urls.js';

/*
 * The visitor's paths and inline editing in every engine: this file runs in the Chromium, WebKit
 * and Firefox projects (playwright.config.ts); the rest of the suite runs in Chromium only.
 */

/** The live form of a "Thu lead" page. */
function liveForm(page: Page) {
  return page.getByRole('form', { name: 'Đăng ký tư vấn miễn phí' });
}

test.describe('Cross-browser · a visitor on a live page', () => {
  let site: Site;
  let pageUrl: string;
  /** The owner's session, for the API calls of setup and checks. */
  let owner: BrowserContext;

  test.beforeAll(async ({ browser }) => {
    owner = await browser.newContext();
    const request = owner.request;
    ({ site } = await setUpSite(request));
    await setUpLeadCaptureViaApi(request, site.id);
    const slug = `tu-van-${uniqueId()}`;
    const created = await createPageViaApi(request, site.id, {
      title: 'Tư vấn niềng răng',
      slug,
      start: {
        kind: 'goal',
        goal: 'lead',
        brief: { offer: 'Niềng răng trong suốt', audience: '', phone: '0901 234 567' },
        style: 'calm',
      },
    });
    // Customer reviews only on wide screens, benefits only on phones (ADR-007, rule 8).
    await saveDraftViaApi(request, created.page.id, (draft) => ({
      composition: {
        ...draft.composition,
        sections: draft.composition.sections.map((section) =>
          section.type === 'testimonials'
            ? { ...section, visibility: { desktop: true, mobile: false } }
            : section.type === 'benefits'
              ? { ...section, visibility: { desktop: false, mobile: true } }
              : section,
        ),
      },
    }));
    await publishViaApi(request, created.page.id, 'Bản đầu tiên');
    pageUrl = `${siteOrigin(site.subdomain)}/${slug}`;
  });

  test.afterAll(async () => {
    await owner.close();
  });

  test('the page, its FAQ and the sections of each device', async ({ page }) => {
    const testimonials = page.locator('[data-section-type="testimonials"]');
    const benefits = page.locator('[data-section-type="benefits"]');

    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto(pageUrl);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Niềng răng trong suốt');
    await expect(testimonials).toBeVisible();
    await expect(benefits).toBeHidden();

    // A question opens and closes its answer, with the mouse and the keyboard.
    const question = page.locator('details').first();
    const summary = question.locator('summary');
    await expect(question).not.toHaveAttribute('open');
    await summary.click();
    await expect(question).toHaveAttribute('open');
    await expect(question.locator('p')).toBeVisible();
    await summary.focus();
    await page.keyboard.press('Enter');
    await expect(question).not.toHaveAttribute('open');

    // The same page on a phone: the container queries swap the two sections.
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(testimonials).toBeHidden();
    await expect(benefits).toBeVisible();
    // Just under and at the breakpoint (768 px), as ADR-007 states it.
    await page.setViewportSize({ width: 767, height: 900 });
    await expect(testimonials).toBeHidden();
    await page.setViewportSize({ width: 768, height: 900 });
    await expect(testimonials).toBeVisible();
    await expect(benefits).toBeHidden();
  });

  test('the form checks in place, keeps focus on the error, and sends', async ({ page }) => {
    const startedAt = Date.now();
    // The form's script is a chunk of its own, downloaded after the page (React.lazy, ADR-019).
    // Until it runs, "Gửi đăng ký" posts the plain form; once it has, the checks answer in place.
    await page.goto(pageUrl, { waitUntil: 'networkidle' });
    const form = liveForm(page);
    const name = form.getByRole('textbox', { name: 'Họ và tên' });
    await form.getByRole('button', { name: 'Gửi đăng ký' }).click();
    await expect(form.getByText('Nhập họ và tên')).toBeVisible();
    expect(page.url()).toBe(pageUrl);
    await expect(name).toBeFocused();

    await name.fill('Nguyễn Thu Hà');
    await form.getByRole('textbox', { name: 'Số điện thoại' }).fill('0901 234 567');
    await form.getByRole('button', { name: 'Gửi đăng ký' }).click();
    const consent = form.getByRole('checkbox', { name: FILLED_CONSENT });
    await expect(form.getByText('Bạn cần đồng ý để gửi đăng ký')).toBeVisible();
    await expect(consent).toBeFocused();
    await consent.check();
    // A person takes more than 3 seconds to fill the form (ADR-016).
    await page.waitForTimeout(Math.max(0, 3_100 - (Date.now() - startedAt)));
    await form.getByRole('button', { name: 'Gửi đăng ký' }).click();
    const sent = page.getByRole('status').filter({ hasText: 'Đã nhận đăng ký của bạn' });
    await expect(sent).toBeVisible();
    await expect(sent.getByRole('heading', { name: 'Đã nhận đăng ký của bạn' })).toBeFocused();
  });

  test('a view of the page is counted', async ({ page }) => {
    const report = () =>
      call(
        owner.request,
        'GET',
        `${endpoints.analyticsReport.path(site.id)}?range=7d`,
        analyticsReportSchema,
      );
    const before = (await report()).totals.views;
    // Each project sends its engine's usual desktop user agent (playwright.config.ts devices),
    // never a headless one, which would not be counted (ADR-019).
    await page.goto(pageUrl);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect
      .poll(async () => (await report()).totals.views, { timeout: 10_000 })
      .toBe(before + 1);
  });

  test('without JavaScript the form posts and lands on the result page', async ({ browser }) => {
    const context = await browser.newContext({ javaScriptEnabled: false });
    const plain = await context.newPage();
    await plain.goto(pageUrl);
    const form = liveForm(plain);
    await form.getByRole('textbox', { name: 'Họ và tên' }).fill('Trần Quốc Bảo');
    await form.getByRole('textbox', { name: 'Số điện thoại' }).fill('0938 512 840');
    await form.getByRole('button', { name: 'Gửi đăng ký' }).click();
    await expect(plain.getByRole('heading', { name: 'Chưa gửi được đăng ký' })).toBeVisible();
    await plain.getByRole('link', { name: 'Quay lại form' }).click();
    await liveForm(plain).getByRole('textbox', { name: 'Họ và tên' }).fill('Trần Quốc Bảo');
    await liveForm(plain).getByRole('textbox', { name: 'Số điện thoại' }).fill('0938 512 840');
    await liveForm(plain).getByRole('checkbox', { name: FILLED_CONSENT }).check();
    await liveForm(plain).getByRole('button', { name: 'Gửi đăng ký' }).click();
    await expect(plain.getByRole('heading', { name: 'Đã nhận đăng ký của bạn' })).toBeVisible();
    expect(new URL(plain.url()).pathname).toBe('/_lead');
    await context.close();
  });
});

test.describe('Cross-browser · editing text on the canvas', () => {
  test('typing and pasting on the canvas edit the same text as the panel', async ({ page }) => {
    const { site } = await setUpSite(page.request);
    const created = await createPageViaApi(
      page.request,
      site.id,
      promoPage(`uu-dai-${uniqueId()}`, 'Niềng răng trong suốt giảm 30%'),
    );
    const editor = new Editor(page);
    await editor.goto(site.id, created.page.id);
    await editor.heroRow.click();

    // Typing: select the heading's text and type over it; Tab commits.
    await editor.heroCanvasHeading.click();
    await page.keyboard.press('ControlOrMeta+A');
    await page.keyboard.type('Niềng răng — gõ trên canvas');
    await page.keyboard.press('Tab');
    await expect(editor.heroHeadingField).toHaveValue('Niềng răng — gõ trên canvas');

    // Enter ends a one-line text instead of breaking it.
    await editor.heroCanvasHeading.click();
    // The heading wraps: End would stop at the end of the first line. → collapses the selection
    // at the end of the text.
    await page.keyboard.press('ControlOrMeta+A');
    await page.keyboard.press('ArrowRight');
    await page.keyboard.type(' 2026');
    await page.keyboard.press('Enter');
    await expect(editor.heroHeadingField).toHaveValue('Niềng răng — gõ trên canvas 2026');
    await expect(editor.heroCanvasHeading).not.toBeFocused();

    // Pasting: copy styled text from the page (bold, a link) and paste it over the heading. The
    // canvas keeps plain text only (no HTML in content, ADR-007).
    await page.evaluate(() => {
      const source = document.createElement('div');
      source.id = 'clipboard-source';
      source.innerHTML = '<b>Ưu đãi</b> <a href="https://example.com">tháng 11</a>';
      document.body.append(source);
    });
    await page.locator('#clipboard-source').selectText();
    await page.keyboard.press('ControlOrMeta+C');
    await editor.heroCanvasHeading.click();
    await page.keyboard.press('ControlOrMeta+A');
    await page.keyboard.press('ControlOrMeta+V');
    await expect(editor.heroCanvasHeading).toHaveText('Ưu đãi tháng 11');
    expect(
      await editor.heroCanvasHeading.evaluate((element) => element.querySelector('*') === null),
    ).toBe(true);
    await page.keyboard.press('Tab');
    await expect(editor.heroHeadingField).toHaveValue('Ưu đãi tháng 11');

    // Two paragraphs: one line in a heading, two lines in the description.
    await page.evaluate(() => {
      const source = document.getElementById('clipboard-source');
      if (source !== null) {
        source.innerHTML = '<p>Tư vấn miễn phí</p><p>Trả góp 0%</p>';
      }
    });
    await page.locator('#clipboard-source').selectText();
    await page.keyboard.press('ControlOrMeta+C');
    await editor.heroCanvasHeading.click();
    await page.keyboard.press('ControlOrMeta+A');
    await page.keyboard.press('ControlOrMeta+V');
    await page.keyboard.press('Tab');
    await expect(editor.heroHeadingField).toHaveValue('Tư vấn miễn phí Trả góp 0%');
    await expect(editor.heroCanvasHeading).toHaveText('Tư vấn miễn phí Trả góp 0%');
    const description = editor.canvas.getByRole('textbox', { name: 'Mô tả' }).first();
    await description.click();
    await page.keyboard.press('ControlOrMeta+A');
    await page.keyboard.press('ControlOrMeta+V');
    await page.keyboard.press('Tab');
    await expect(editor.heroPanel.getByRole('textbox', { name: 'Mô tả' })).toHaveValue(
      /^Tư vấn miễn phí\n{1,2}Trả góp 0%$/,
    );
    await editor.expectSaved();

    const saved = await getPageViaApi(page.request, created.page.id);
    const hero = saved.draft.composition.sections.find((section) => section.type === 'hero');
    expect(hero?.content['heading']).toBe('Tư vấn miễn phí Trả góp 0%');
  });
});
