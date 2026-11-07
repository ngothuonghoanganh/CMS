import { type APIRequestContext, expect, test } from '@playwright/test';
import { Editor } from '../support/editor.js';
import { MAILPIT, waitForEmail } from '../support/mailpit.js';
import { createPageViaApi, setUpLeadCaptureViaApi, setUpSite, uniqueId } from '../support/setup.js';
import { sendLead } from '../support/visitor.js';
import { signedWith, WebhookReceiver } from '../support/webhook-receiver.js';
import { siteOrigin } from '../urls.js';

const receiver = new WebhookReceiver();
const HOOK = 'https://crm.smilecare.vn/api/leads';

test.beforeAll(async () => {
  await receiver.start();
});

test.afterAll(async () => {
  await receiver.stop();
});

async function emailsAbout(request: APIRequestContext, to: string, subject: string) {
  const response = await request.get(
    `${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:"${to}"`)}`,
  );
  const { messages } = (await response.json()) as { messages: Array<{ Subject: string }> };
  return messages.filter((message) => message.Subject.includes(subject)).length;
}

test.describe('Phase 3 · chăm sóc khách', () => {
  test('a lead becomes a profile, automations give it out, tell of the win, send it on, and forget it', async ({
    page,
    browser,
  }) => {
    test.setTimeout(120_000);
    const { account, site } = await setUpSite(page.request);
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
    await editor.goto(site.id, created.page.id);
    await editor.publish(1, 'Có form đăng ký');
    const pageUrl = `${siteOrigin(site.subdomain)}/${slug}`;

    // 1. A lead from the live page makes a profile.
    await sendLead(browser, pageUrl, { name: 'Phạm Mỹ Duyên', phone: '0977 645 010' });
    const people = page.getByRole('region', { name: 'Danh sách khách hàng' });
    await expect(async () => {
      await page.goto(`/sites/${site.id}/contacts`);
      await expect(people.getByRole('link', { name: 'Phạm Mỹ Duyên' })).toBeVisible();
    }).toPass({ timeout: 15_000 });

    // 2. "Giao lead mới" on; the same phone again joins the profile, which gets an owner and a task.
    await page.goto(`/sites/${site.id}/automations`);
    const list = page.getByRole('region', { name: 'Automation của site' });
    await page.getByRole('button', { name: /Giao lead mới cho người trực/ }).click();
    const assign = list.getByRole('row').filter({ hasText: 'Giao lead mới cho người trực' });
    await assign.getByRole('switch', { name: 'Bật Giao lead mới cho người trực' }).check();
    await expect(assign).toContainText('Đang bật');
    await sendLead(browser, pageUrl, { name: 'Phạm Mỹ Duyên', phone: '0977 645 010' });
    await expect(async () => {
      await page.goto(`/sites/${site.id}/contacts`);
      await expect(people.getByRole('link', { name: 'Phạm Mỹ Duyên' })).toHaveCount(1);
      await expect(people.getByRole('row').filter({ hasText: 'Phạm Mỹ Duyên' })).not.toContainText(
        'Chưa giao',
      );
    }).toPass({ timeout: 20_000 });
    await page.getByRole('link', { name: 'Phạm Mỹ Duyên' }).click();
    await expect(page.getByRole('region', { name: 'Công việc' })).toContainText(
      'Gọi lại trong 15 phút',
    );
    const profileUrl = page.url();
    await page.goto(`/sites/${site.id}/automations`);
    await assign.getByRole('link', { name: 'Giao lead mới cho người trực' }).click();
    await page.getByRole('link', { name: 'Lịch sử chạy' }).click();
    await expect(page).toHaveURL(/\/runs$/);
    const runs = page.getByRole('region', { name: 'Các lượt chạy' });
    await expect(runs.getByRole('button', { name: /Lead mới · Phạm Mỹ Duyên/ })).toContainText(
      'Thành công',
    );

    // 3. "Báo tin khi chốt được khách" with a webhook step: its secret shows once.
    await page.goto(`/sites/${site.id}/automations`);
    await page.getByRole('button', { name: /Báo tin khi chốt được khách/ }).click();
    const won = list.getByRole('row').filter({ hasText: 'Báo tin khi chốt được khách' });
    await won.getByRole('link', { name: 'Báo tin khi chốt được khách' }).click();
    await page.getByRole('button', { name: /Thêm điều kiện hoặc hành động/ }).click();
    await page.getByRole('menuitem', { name: 'Thì · Gọi webhook' }).click();
    const panel = page.getByRole('complementary', { name: 'Bảng bên phải' });
    await panel.getByRole('textbox', { name: /Địa chỉ nhận/ }).fill(HOOK);
    const secretText = panel.getByText(/^whsec_[0-9a-f]{64}$/);
    await expect(secretText).toBeVisible();
    const secret = (await secretText.textContent()) ?? '';
    await expect(page.getByText(/^Đã lưu/)).toBeVisible();
    await page.getByRole('button', { name: 'Bật automation' }).click();
    const dialog = page.getByRole('dialog', { name: 'Bật “Báo tin khi chốt được khách”?' });
    await dialog.getByRole('button', { name: 'Bật automation' }).click();
    await expect(page.getByRole('button', { name: 'Tạm dừng' })).toBeVisible();

    // The receiving system refuses the first call: the step fails at once (4xx).
    receiver.answerNext(410);
    await page.goto(`/sites/${site.id}/contacts/pipeline`);
    await page
      .getByRole('region', { name: /^Mới, / })
      .getByRole('button', { name: /Chuyển giai đoạn/ })
      .click();
    await page.getByRole('menuitem', { name: 'Đánh dấu thắng…' }).click();
    const winDialog = page.getByRole('dialog', { name: 'Đánh dấu thắng' });
    await winDialog.getByRole('textbox', { name: 'Giá trị thực tế' }).fill('36500000');
    await winDialog.getByRole('button', { name: 'Đánh dấu thắng' }).click();
    await expect(winDialog).toBeHidden();

    const notice = await waitForEmail(page.request, account.email, 'Đã chốt được Phạm Mỹ Duyên');
    expect(notice.Text).not.toContain('0977');

    // 4. History: failed at the webhook; "Thử lại bước này" runs only that step.
    await page.goto(`/sites/${site.id}/automations`);
    await won.getByRole('link', { name: 'Báo tin khi chốt được khách' }).click();
    await page.getByRole('link', { name: 'Lịch sử chạy' }).click();
    await expect(page).toHaveURL(/\/runs$/);
    const failedRun = runs.getByRole('button', { name: /Đổi giai đoạn · Phạm Mỹ Duyên/ });
    await expect(async () => {
      await page.reload();
      await expect(failedRun).toContainText('Thất bại');
    }).toPass({ timeout: 20_000 });
    await failedRun.click();
    await expect(page.getByText('Thất bại ở bước 3')).toBeVisible();
    await expect(page.getByText(`POST ${HOOK} → 410`)).toBeVisible();
    await page.getByRole('button', { name: 'Thử lại bước này' }).click();
    await expect(async () => {
      await page.reload();
      await expect(failedRun).toContainText('Thành công');
    }).toPass({ timeout: 20_000 });

    const calls = receiver.received.filter((call) => call.body.includes('Phạm Mỹ Duyên'));
    expect(calls).toHaveLength(2);
    const [first, second] = calls;
    expect(second?.target).toBe(HOOK);
    expect(second?.headers['x-plp-event']).toBe('opportunity_stage_changed');
    expect(second?.headers['idempotency-key']).toBe(first?.headers['idempotency-key']);
    expect(second !== undefined && signedWith(second, secret)).toBe(true);
    expect(JSON.parse(second?.body ?? '{}')).toMatchObject({
      version: 1,
      stage: 'won',
      lead: { name: 'Phạm Mỹ Duyên', phone: '+84977645010' },
    });
    // The email step had run: it does not run again.
    expect(await emailsAbout(page.request, account.email, 'Đã chốt được Phạm Mỹ Duyên')).toBe(1);

    // 5. Deleting the person's data: the profile goes, the runs keep no name.
    await page.goto(profileUrl);
    await page.getByRole('button', { name: 'Thao tác dữ liệu' }).click();
    await page.getByRole('menuitem', { name: 'Xóa dữ liệu của người này' }).click();
    const confirm = page.getByRole('alertdialog', {
      name: 'Xóa toàn bộ dữ liệu của Phạm Mỹ Duyên?',
    });
    await expect(confirm).toContainText('dữ liệu đã gửi qua webhook trước đó không bị xóa theo');
    await confirm.getByRole('button', { name: 'Xóa dữ liệu' }).click();
    await expect(page.getByText('Đã xóa dữ liệu của Phạm Mỹ Duyên', { exact: true })).toBeVisible();
    await expect(people.getByText('Phạm Mỹ Duyên')).toHaveCount(0);
    await page.goto(`/sites/${site.id}/contacts/pipeline`);
    await expect(page.getByText('Phạm Mỹ Duyên')).toHaveCount(0);

    await page.goto(`/sites/${site.id}/automations`);
    await won.getByRole('link', { name: 'Báo tin khi chốt được khách' }).click();
    await page.getByRole('link', { name: 'Lịch sử chạy' }).click();
    await expect(page).toHaveURL(/\/runs$/);
    await expect(runs.getByRole('button', { name: /Đổi giai đoạn · khách đã xóa/ })).toContainText(
      'Thành công',
    );
    await expect(runs.getByText(/Phạm Mỹ Duyên/)).toHaveCount(0);
  });
});
