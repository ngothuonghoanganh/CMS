import { expect, type Locator, type Page, test } from '@playwright/test';
import { Editor } from '../support/editor.js';
import { createPageViaApi, setUpLeadCaptureViaApi, setUpSite, uniqueId } from '../support/setup.js';
import { FILLED_CONSENT, VISITOR_UA } from '../support/visitor.js';
import { siteOrigin } from '../urls.js';

/** The page script's view of the page it runs on (ADR-019). */
function viewSent(page: Page) {
  return page.waitForResponse(
    (response) => response.url().endsWith('/_e') && response.request().method() === 'POST',
  );
}

/** The value of one tile of the KPI row. */
function kpi(page: Page, label: string) {
  return page
    .getByRole('term')
    .filter({ hasText: label })
    .locator('xpath=following-sibling::dd[1]');
}

interface Edges {
  left: number;
  right: number;
}

/** The labels under the chart that show (each day, each day's leads) as their left and right edges. */
function axisLabels(chart: Locator): Promise<{ days: Edges[]; leads: Edges[] }> {
  return chart.evaluate((element) => {
    const edges = (node: Element): Edges => {
      const box = node.getBoundingClientRect();
      return { left: box.left, right: box.right };
    };
    const shown = (node: Element) => node.checkVisibility({ visibilityProperty: true });
    const spans = [...element.querySelectorAll('span')];
    return {
      // A day's label holds its weekday and its date, either of which a narrow chart may drop.
      days: spans
        .filter((span) => /^\d{2}\/\d{2}$/.test(span.textContent))
        .flatMap((date) =>
          date.parentElement !== null && shown(date.parentElement)
            ? [edges(date.parentElement)]
            : [],
        ),
      leads: spans.filter((span) => /^\d+ lead$/.test(span.textContent) && shown(span)).map(edges),
    };
  });
}

/** Labels of one row: inside the plot, at least 4px apart. */
function expectApartInside(labels: Edges[], plot: Edges, where: string) {
  const sorted = labels.toSorted((a, b) => a.left - b.left);
  const outside = sorted.filter((box) => box.left < plot.left - 1 || box.right > plot.right + 1);
  expect(outside, `${where}: labels outside the plot ${JSON.stringify(plot)}`).toEqual([]);
  const gaps = sorted.slice(1).map((box, index) => box.left - (sorted[index]?.right ?? 0));
  expect(Math.min(...gaps), `${where}: the closest labels`).toBeGreaterThanOrEqual(4);
}

test.describe('B6 · Hiệu quả', () => {
  test('a visitor’s views and lead show on "Hiệu quả", and a member’s own visit does not count', async ({
    page,
    browser,
  }) => {
    const { site } = await setUpSite(page.request);
    await setUpLeadCaptureViaApi(page.request, site.id);
    const slug = `tu-van-${uniqueId()}`;
    const created = await createPageViaApi(page.request, site.id, {
      title: 'Tư vấn niềng răng',
      slug,
      start: {
        kind: 'goal',
        goal: 'lead',
        brief: { offer: 'Niềng răng trong suốt', audience: '', phone: '0901 234 567' },
        style: 'calm',
      },
    });
    const editor = new Editor(page);
    await editor.goto(site.id, created.page.id);
    await editor.publish(1, 'Có form đăng ký');

    // A visitor from a Facebook ad opens the page, reloads it, and sends the form.
    const visitorContext = await browser.newContext({ userAgent: VISITOR_UA });
    const visitor = await visitorContext.newPage();
    const first = viewSent(visitor);
    await visitor.goto(`${siteOrigin(site.subdomain)}/${slug}?utm_source=facebook&utm_medium=cpc`);
    expect((await first).status()).toBe(204);
    const second = viewSent(visitor);
    await visitor.reload();
    expect((await second).status()).toBe(204);
    const form = visitor.getByRole('form', { name: 'Đăng ký tư vấn miễn phí' });
    await form.getByRole('textbox', { name: 'Họ và tên' }).fill('Nguyễn Thu Hà');
    await form.getByRole('textbox', { name: 'Số điện thoại' }).fill('0901 234 567');
    await form.getByRole('checkbox', { name: FILLED_CONSENT }).check();
    // A person takes more than 3 seconds to fill the form; faster is taken for a bot (ADR-016).
    await visitor.waitForTimeout(3100);
    await form.getByRole('button', { name: 'Gửi đăng ký' }).click();
    await expect(
      visitor.getByRole('status').filter({ hasText: 'Đã nhận đăng ký của bạn' }),
    ).toBeVisible();
    await visitorContext.close();

    await page.goto(`/sites/${site.id}`);
    await page
      .getByRole('navigation', { name: 'Điều hướng chính' })
      .getByRole('link', { name: 'Hiệu quả' })
      .click();
    await expect(page.getByRole('heading', { level: 1, name: 'Hiệu quả' })).toBeVisible();
    await expect(kpi(page, 'Lượt xem')).toHaveText('2');
    await expect(kpi(page, 'Khách duy nhất')).toHaveText('1');
    await expect(kpi(page, 'Lead')).toHaveText('1');
    await expect(kpi(page, 'Tỷ lệ chuyển đổi')).toHaveText('100,0%');
    const sources = page.getByRole('region', { name: 'Theo nguồn truy cập' });
    await expect(sources.getByRole('row').filter({ hasText: 'facebook / cpc' })).toContainText(
      'facebook / cpc11100,0%',
    );

    // A member opens the page from the admin: the flag is remembered and nothing is sent.
    await page.goto(`/sites/${site.id}`);
    await page.getByRole('button', { name: 'Tùy chọn khác cho Tư vấn niềng răng' }).click();
    const popupOpened = page.waitForEvent('popup');
    await page.getByRole('menuitem', { name: 'Xem trang live' }).click();
    const member = await popupOpened;
    let memberViews = 0;
    member.on('request', (request) => {
      if (request.url().endsWith('/_e')) {
        memberViews += 1;
      }
    });
    await expect.poll(() => member.url()).not.toContain('plp_internal');
    await member.reload();
    await expect(member.getByRole('form', { name: 'Đăng ký tư vấn miễn phí' })).toBeVisible();
    await member.waitForTimeout(500);
    expect(memberViews).toBe(0);
    await member.close();

    await page.goto(`/sites/${site.id}/analytics`);
    await expect(kpi(page, 'Lượt xem')).toHaveText('2');
  });

  test('the chart’s day labels stay apart and inside the plot, from a phone to a desktop', async ({
    page,
  }) => {
    const { site } = await setUpSite(page.request);
    const chart = page.getByRole('region', { name: 'Khách duy nhất mỗi ngày' });
    const ranges = [
      { name: '7 ngày', days: 7 },
      { name: '30 ngày', days: 30 },
      { name: '90 ngày', days: 90 },
    ];
    // The chart is the window less 82px without the sidebar, less 379px with it (900px and up).
    // Besides a phone (375), a narrow window with the sidebar (900) and the boards (1440), these
    // put the chart just past each width where its labels change: 403px (485), 563px (645) and
    // 566px (945) where 90 days crowd most, and 668px (750) where every label is back. Label
    // widths depend on the dates, so a crowded layout fails on most days, not every one.
    for (const width of [375, 485, 600, 645, 750, 900, 945, 1440]) {
      await page.setViewportSize({ width, height: 1000 });
      await page.goto(`/sites/${site.id}/analytics`);
      for (const range of ranges) {
        await page
          .getByRole('group', { name: 'Khoảng thời gian' })
          .getByRole('button', { name: range.name })
          .click();
        await expect(chart.getByRole('button', { name: /khách ·/ })).toHaveCount(range.days);
        const plot = await chart
          .getByRole('group', { name: /^Khách duy nhất mỗi ngày/ })
          .boundingBox();
        expect(plot).not.toBeNull();
        const edges = { left: plot?.x ?? 0, right: (plot?.x ?? 0) + (plot?.width ?? 0) };
        const labels = await axisLabels(chart);
        const where = `${String(width)}px, ${range.name}`;
        expect(labels.days.length, where).toBeGreaterThanOrEqual(3);
        expectApartInside(labels.days, edges, where);
        expectApartInside(labels.leads, edges, `${where}, leads`);
      }
    }
  });
});
