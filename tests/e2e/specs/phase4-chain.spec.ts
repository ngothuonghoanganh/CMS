import { expect, test } from '@playwright/test';
import {
  billingSummaryOf,
  dateOf,
  fullDate,
  MINUTE_MS,
  setBillingClock,
} from '../support/billing-clock.js';
import { Editor } from '../support/editor.js';
import { addCardViaGateway, CARD_DECLINED, CARD_OK, paymentsPath } from '../support/payments.js';
import { fetchPublic } from '../support/public-site.js';
import { createPageViaApi, setUpLeadCaptureViaApi, setUpSite, uniqueId } from '../support/setup.js';
import { sendLead } from '../support/visitor.js';
import { siteOrigin } from '../urls.js';

/*
 * The end of Phase 4 (docs/ARCHITECTURE.md §5, "Hoàn thành Phase 4"): one journey through the
 * whole life of a plan, with the fake gateway and the billing test clock:
 *   1. sign-up, the Agency trial on board 28;
 *   2. Cơ bản during the trial: a second site is refused, board 25 needs a plan;
 *   3. a card, the upgrade to Doanh nghiệp, the paid invoice and its receipt;
 *   4. a renewal with a declined card, past due, then read-only after the grace: publishing is
 *      refused while the live page and its form keep working;
 *   5. a valid card pays the invoice again: the plan works, editing and publishing too;
 *   6. a scheduled downgrade with its impacts, "Hủy gói", "Giữ lại gói".
 */

const INVOICE_NUMBER = /HD-\d{4}-\d{6}/;

test.afterEach(async ({ request }) => {
  await setBillingClock(request, null);
});

test('Phase 4: trial, plan limits, payment, failed renewal, read-only, recovery, downgrade and cancel', async ({
  page,
  browser,
  request,
  context,
}) => {
  test.setTimeout(420_000);
  const { site } = await setUpSite(page.request);
  const workspaceId = site.workspaceId;
  const billing = `/workspaces/${workspaceId}/billing`;

  // A published page with a lead form, which steps 4 and 5 need.
  await setUpLeadCaptureViaApi(page.request, site.id);
  const slug = `uu-dai-${uniqueId()}`;
  const created = await createPageViaApi(page.request, site.id, {
    title: 'Ưu đãi niềng răng',
    slug,
    start: {
      kind: 'goal',
      goal: 'lead',
      brief: { offer: 'Niềng răng trong suốt', audience: '', phone: '0901 234 567' },
      style: 'calm',
    },
  });
  const editor = new Editor(page);

  await test.step('1. the workspace is on a 14-day Agency trial', async () => {
    await page.goto(billing);
    await expect(page.getByRole('heading', { level: 2, name: 'Gói Agency' })).toBeVisible();
    await expect(page.getByText('Dùng thử · còn 14 ngày')).toBeVisible();
    const usage = page.getByRole('list', { name: 'Mức sử dụng' });
    await expect(usage.getByRole('listitem').filter({ hasText: 'Site' }).first()).toContainText(
      '1 / 5',
    );
  });

  await test.step('2. Cơ bản during the trial blocks a second site and automation', async () => {
    await page.getByRole('button', { name: 'Đổi gói' }).click();
    const dialog = page.getByRole('dialog', { name: 'Đổi gói' });
    await dialog.getByRole('radio', { name: /^Gói Cơ bản/ }).check();
    await dialog.getByRole('button', { name: 'Đổi miễn phí' }).click();
    await expect(page.getByText('Đã đổi sang Gói Cơ bản', { exact: true })).toBeVisible();

    await page.goto('/sites/new');
    await page.getByLabel('Tên site').fill('Site thứ hai');
    await page.getByLabel('Tên miền con').fill(`hai${uniqueId()}`);
    await expect(
      page.getByRole('status').filter({ hasText: 'Tên miền con này dùng được.' }),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Tạo site' }).click();
    const refused = page.getByRole('alert').filter({ hasText: 'Theo gói' });
    await expect(refused.getByRole('link', { name: 'Nâng cấp' })).toBeVisible();

    await page.goto(`/sites/${site.id}/automations`);
    await expect(page.getByRole('main').getByText('CẦN GÓI CÓ AUTOMATION')).toBeVisible();
  });

  await test.step('3. a card, the upgrade to Doanh nghiệp, the invoice and its receipt', async () => {
    await addCardViaGateway(page, workspaceId, CARD_OK);
    await page.goto(billing);
    await page.getByRole('button', { name: 'Đổi gói' }).click();
    const dialog = page.getByRole('dialog', { name: 'Đổi gói' });
    await dialog.getByRole('radio', { name: /^Gói Doanh nghiệp/ }).check();
    await dialog.getByRole('button', { name: 'Theo tháng' }).click();
    await dialog.getByRole('button', { name: 'Thanh toán ngay 1.490.000 ₫' }).click();
    await expect(page.getByText('Đã đổi sang Gói Doanh nghiệp', { exact: true })).toBeVisible();

    await page.goto(paymentsPath(workspaceId));
    const history = page.getByRole('table', { name: 'Lịch sử giao dịch' });
    const row = history.getByRole('row').filter({ hasText: INVOICE_NUMBER });
    await expect(row).toHaveCount(1);
    await expect(row).toContainText('Đã thanh toán');
    const [receipt] = await Promise.all([
      context.waitForEvent('page'),
      row.getByRole('link', { name: /^Tải hóa đơn HD-/ }).click(),
    ]);
    await expect(
      receipt.getByRole('heading', { level: 1, name: 'Biên nhận thanh toán' }),
    ).toBeVisible();
    await receipt.close();

    // Version 1 goes live now, with a change waiting for step 5.
    await editor.goto(site.id, created.page.id);
    await editor.publish(1, 'Bản đầu');
    await editor.setHeroHeading('Ưu đãi niềng răng tháng 12');
  });

  const pageUrl = `${siteOrigin(site.subdomain)}/${slug}`;

  await test.step('4. a declined renewal is past due, then read-only; the live page still works', async () => {
    await addCardViaGateway(page, workspaceId, CARD_DECLINED);
    const paid = await billingSummaryOf(page.request, workspaceId);
    await setBillingClock(request, new Date(dateOf(paid.periodEnd).getTime() + MINUTE_MS));
    const failed = await billingSummaryOf(page.request, workspaceId);
    expect(failed.state).toBe('past_due');
    expect(failed.access).toBe('full');

    await page.goto(billing);
    const banner = page.getByRole('alert').filter({ hasText: /Thanh toán kỳ \d{2}\/\d{2} chưa/ });
    await expect(banner).toContainText('Ngân hàng từ chối thẻ');
    await expect(banner).toContainText('Hệ thống tự thử lại ngày');
    await expect(page.getByText('Quá hạn').first()).toBeVisible();

    // The grace is over (the retries ran on the way).
    const graceEndsAt = dateOf(failed.graceEndsAt);
    await setBillingClock(request, new Date(graceEndsAt.getTime() + MINUTE_MS));
    const readOnly = await billingSummaryOf(page.request, workspaceId);
    expect(readOnly.access).toBe('read_only');

    // Publishing is refused with the plan's message; the draft stays.
    await editor.goto(site.id, created.page.id);
    const dialog = await editor.openPublishDialog();
    const ignore = dialog.getByRole('button', { name: 'Bỏ qua lần này' });
    while ((await ignore.count()) > 0) {
      await ignore.first().click();
    }
    await dialog.getByRole('button', { name: 'Xuất bản v2', exact: true }).click();
    await expect(dialog.getByRole('link', { name: 'Xem gói & thanh toán' })).toBeVisible();
    await expect(page.getByRole('dialog', { name: 'v2 đã live' })).toHaveCount(0);
    await page.keyboard.press('Escape');

    // The live page opens, with version 1, and its form takes a lead.
    const live = await fetchPublic(request, site.subdomain, `/${slug}`);
    expect(live.status).toBe(200);
    await sendLead(browser, pageUrl, { name: 'Phạm Mỹ Duyên', phone: '0977 645 010' });
    await expect(async () => {
      await page.goto(`/sites/${site.id}/leads`);
      await expect(page.getByText('Phạm Mỹ Duyên').first()).toBeVisible();
    }).toPass({ timeout: 15_000 });
  });

  await test.step('5. a valid card pays the invoice again; editing and publishing work', async () => {
    await addCardViaGateway(page, workspaceId, CARD_OK);
    const alert = page.getByRole('alert').filter({ hasText: 'không thành công' });
    await alert.getByRole('button', { name: 'Thanh toán lại' }).click();
    await expect(page.getByText('Đã thanh toán 1.490.000 ₫').first()).toBeVisible();
    await expect(page.getByRole('alert').filter({ hasText: 'không thành công' })).toHaveCount(0);

    const recovered = await billingSummaryOf(page.request, workspaceId);
    expect(recovered.state).toBe('active');
    expect(recovered.access).toBe('full');
    await page.goto(billing);
    await expect(page.getByText('Đang hoạt động').first()).toBeVisible();
    await expect(page.getByText('Workspace đang ở chế độ chỉ đọc')).toHaveCount(0);

    await editor.goto(site.id, created.page.id);
    await editor.setHeroHeading('Ưu đãi niềng răng tháng 1');
    await editor.publish(2, 'Sau khi thanh toán lại');
    const live = await fetchPublic(request, site.subdomain, `/${slug}`);
    expect(live.status).toBe(200);
    expect(live.html).toContain('Ưu đãi niềng răng tháng 1');
  });

  await test.step('6. a scheduled downgrade lists its impacts; cancel, then keep the plan', async () => {
    const current = await billingSummaryOf(page.request, workspaceId);
    const periodEnd = dateOf(current.periodEnd);
    await page.goto(billing);
    await page.getByRole('button', { name: 'Đổi gói' }).click();
    const dialog = page.getByRole('dialog', { name: 'Đổi gói' });
    await dialog.getByRole('radio', { name: /^Gói Cơ bản/ }).check();
    await expect(
      dialog.getByRole('list', { name: 'Điều gì thay đổi' }).getByRole('listitem').first(),
    ).toBeVisible();
    await dialog.getByRole('button', { name: 'Lên lịch hạ gói' }).click();
    await expect(page.getByText('Đã lên lịch đổi gói', { exact: true })).toBeVisible();
    await expect(page.getByText(/^Chuyển sang Gói Cơ bản · theo tháng từ /)).toContainText(
      fullDate(periodEnd),
    );

    await page.getByRole('button', { name: 'Hủy gói' }).click();
    await page
      .getByRole('alertdialog', { name: 'Hủy Gói Doanh nghiệp?' })
      .getByRole('button', { name: 'Hủy gói' })
      .click();
    await expect(page.getByText(`Gói sẽ dừng vào ${fullDate(periodEnd)}.`)).toBeVisible();

    await page.getByRole('button', { name: 'Giữ lại gói' }).click();
    await expect(page.getByText('Đã giữ lại Gói Doanh nghiệp', { exact: true })).toBeVisible();
    await expect(page.getByText(/Gói sẽ dừng vào/)).toHaveCount(0);
    await expect(page.getByRole('heading', { level: 2, name: 'Gói Doanh nghiệp' })).toBeVisible();
  });
});
