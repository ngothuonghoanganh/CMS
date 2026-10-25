import { expect, type Page, test } from '@playwright/test';
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
});
