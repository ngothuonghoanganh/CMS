import {
  createPreviewLinkRequestSchema,
  DEFAULT_PAGE_MOTION,
  endpoints,
  type PageMotion,
  previewLinkResponseSchema,
} from '@plp/contracts';
import {
  type Browser,
  type BrowserContextOptions,
  expect,
  type Locator,
  test,
} from '@playwright/test';
import {
  getPageViaApi,
  movePointerViaApi,
  type PageRef,
  publishViaApi,
  saveDraftViaApi,
} from '../support/board.js';
import { call, createPageViaApi, setUpSite, uniqueId } from '../support/setup.js';
import { siteOrigin } from '../urls.js';

/*
 * M1 (ADR-032): a page with a motion style moves on its live page and its preview. Sections on
 * screen when the page opens show as they are; the others wait until the visitor scrolls to them,
 * enter once, then are left as they always were. Without JavaScript, or on a device that asks for
 * less motion, every section shows at once.
 */

/** A short window, so the end of the page starts below it. */
const VIEWPORT = { width: 1280, height: 640 };

async function setMotion(
  request: Parameters<typeof saveDraftViaApi>[0],
  ref: PageRef,
  motion: PageMotion,
) {
  await saveDraftViaApi(request, ref, (draft) => ({
    composition: { ...draft.composition, motion },
  }));
}

/** Opacity of every part of a section, as the browser draws it now. */
function opacities(section: Locator): Promise<string[]> {
  return section
    .locator('[data-m]')
    .evaluateAll((parts) => parts.map((part) => getComputedStyle(part).opacity));
}

async function visit(browser: Browser, url: string, options: BrowserContextOptions = {}) {
  const context = await browser.newContext({ viewport: VIEWPORT, ...options });
  const page = await context.newPage();
  await page.goto(url);
  return { context, page };
}

test.describe('M1 · motion on live pages', () => {
  test('sections enter once as the visitor scrolls; publish, rollback and preview carry the style', async ({
    page,
    browser,
  }) => {
    const { site } = await setUpSite(page.request);
    const slug = `dich-vu-${uniqueId()}`;
    // A service page: navigation, Hero, benefits, steps, testimonials, questions, a call to action.
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
    await setMotion(page.request, created.page, { ...DEFAULT_PAGE_MOTION, style: 'smooth' });
    const v1 = await publishViaApi(page.request, created.page);
    expect(v1.release.changeSummary.map((change) => change.label)).toContain(
      'Chuyển động: Mượt mà',
    );

    const url = `${siteOrigin(site.subdomain)}/${slug}`;
    const { context, page: visitor } = await visit(browser, url);
    const root = visitor.locator('[data-motion-root]');
    await expect(root).toHaveCount(1);
    const sections = visitor.locator('[data-section-type]');
    const first = sections.nth(1);
    const last = visitor.locator('[data-section-type="cta_band"]');

    // The navigation bar and the Hero show at once, always.
    await expect(sections.first()).not.toHaveAttribute('data-motion-enter');
    await expect(first).not.toHaveAttribute('data-motion-enter');
    // The call to action at the end waits, drawn but not shown, until the visitor gets there.
    await expect(last).toHaveAttribute('data-motion', 'wait');
    expect(new Set(await opacities(last))).toEqual(new Set(['0']));

    await last.scrollIntoViewIfNeeded();
    await expect(last).not.toHaveAttribute('data-motion', 'wait');
    // Once it has entered, nothing of the motion is left on it.
    await expect(last).not.toHaveAttribute('data-motion', { timeout: 5000 });
    expect(new Set(await opacities(last))).toEqual(new Set(['1']));
    await expect(last.getByRole('heading', { level: 2 })).toBeVisible();
    await context.close();

    // A device that asks for less motion, and a browser without JavaScript, show everything.
    for (const options of [{ reducedMotion: 'reduce' as const }, { javaScriptEnabled: false }]) {
      const still = await visit(browser, url, options);
      const end = still.page.locator('[data-section-type="cta_band"]');
      await expect(end).not.toHaveAttribute('data-motion');
      expect(new Set(await opacities(end))).toEqual(new Set(['1']));
      await still.context.close();
    }

    // Saving is not publishing: the live page keeps its style until the next release.
    await setMotion(page.request, created.page, DEFAULT_PAGE_MOTION);
    const preview = await call(
      page.request,
      'POST',
      endpoints.createPreviewLink.path(site.id, created.page.id),
      previewLinkResponseSchema,
      createPreviewLinkRequestSchema.parse({ kind: 'draft' }),
    );
    const draftPreview = await visit(browser, preview.url);
    await expect(
      draftPreview.page.getByText('Bản xem trước', { exact: false }).first(),
    ).toBeVisible();
    await expect(draftPreview.page.locator('[data-motion-root]')).toHaveCount(0);
    await draftPreview.context.close();

    const live = await visit(browser, url);
    await expect(live.page.locator('[data-motion-root]')).toHaveCount(1);
    const v2 = await publishViaApi(page.request, created.page);
    expect(v2.release.changeSummary.map((change) => change.label)).toEqual([
      'Chuyển động: Không hiệu ứng',
    ]);
    await live.page.reload();
    await expect(live.page.locator('[data-motion-root]')).toHaveCount(0);

    // Rolling back brings the style of the release back with it.
    await movePointerViaApi(
      page.request,
      created.page,
      v1.release.id,
      'Khách thích bản có hiệu ứng',
    );
    await expect(async () => {
      await live.page.reload();
      await expect(live.page.locator('[data-motion-root]')).toHaveCount(1, { timeout: 1000 });
    }).toPass();
    // The draft was not touched by the rollback.
    const { draft } = await getPageViaApi(page.request, created.page);
    expect(draft.composition.motion).toBeUndefined();
    await live.context.close();
  });
});
