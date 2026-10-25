import { expect, type Page, test } from '@playwright/test';
import { LEAD_PHONE_MESSAGE } from '@plp/contracts';
import { Editor } from '../support/editor.js';
import {
  configurePrivacyViaApi,
  confirmRecipientViaApi,
  createPageViaApi,
  PRIVACY,
  setUpSite,
  uniqueId,
} from '../support/setup.js';
import { siteOrigin } from '../urls.js';

const FILLED_CONSENT = `Tôi đồng ý để ${PRIVACY.controllerName} xử lý họ tên và số điện thoại của tôi nhằm liên hệ tư vấn dịch vụ.`;

/** The live form of a "Thu lead" page, as a visitor sees it. */
function liveForm(visitor: Page) {
  return visitor.getByRole('form', { name: 'Đăng ký tư vấn miễn phí' });
}

test.describe('B2 · lead form', () => {
  test('a "Thu lead" page needs consent settings, then visitors send leads with and without JavaScript', async ({
    page,
    browser,
  }) => {
    const { site } = await setUpSite(page.request);
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
    await expect(editor.rows.filter({ hasText: 'Form đăng ký' })).toHaveCount(1);
    await expect(editor.canvas.getByText(/Ô đồng ý lấy từ mục/)).toBeVisible();

    // Without consent settings the form blocks publishing; "Sửa ngay" opens them.
    const dialog = await editor.openPublishDialog();
    const consentCheck = dialog
      .getByRole('listitem')
      .filter({ hasText: 'Form đăng ký chưa có nội dung đồng ý' });
    await expect(consentCheck).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Xuất bản v1' })).toBeDisabled();
    await consentCheck.getByRole('button', { name: 'Sửa ngay' }).click();
    await expect(page).toHaveURL(new RegExp(`/sites/${site.id}/privacy$`));

    await configurePrivacyViaApi(page.request, site.id);
    // A form also needs a confirmed address for its leads (ADR-018, see b4).
    await confirmRecipientViaApi(page.request, site.id);
    await editor.goto(site.id, created.page.id);
    await expect(editor.canvas.getByText(FILLED_CONSENT)).toBeVisible();
    await editor.publish(1, 'Có form đăng ký');

    // A visitor with JavaScript: checks in place, then the confirmation in the section.
    const visitor = await browser.newPage();
    await visitor.goto(`${siteOrigin(site.subdomain)}/${slug}`);
    const form = liveForm(visitor);
    const consent = form.getByRole('checkbox', { name: FILLED_CONSENT });
    await expect(consent).not.toBeChecked();
    await expect(form.getByRole('link', { name: 'Chính sách quyền riêng tư' })).toHaveAttribute(
      'href',
      PRIVACY.policyUrl,
    );
    await form.getByRole('textbox', { name: 'Họ và tên' }).fill('Nguyễn Thu Hà');
    const phone = form.getByRole('textbox', { name: 'Số điện thoại' });
    await phone.fill('090123456');
    await form.getByRole('button', { name: 'Gửi đăng ký' }).click();
    await expect(form.getByText(LEAD_PHONE_MESSAGE)).toBeVisible();
    await expect(phone).toBeFocused();
    await phone.fill('0901 234 567');
    await form.getByRole('button', { name: 'Gửi đăng ký' }).click();
    await expect(form.getByText('Bạn cần đồng ý để gửi đăng ký')).toBeVisible();
    await expect(consent).toBeFocused();
    await consent.check();
    const relayed = visitor.waitForResponse(
      (response) => response.url().endsWith('/_lead') && response.request().method() === 'POST',
    );
    await form.getByRole('button', { name: 'Gửi đăng ký' }).click();
    expect((await relayed).status()).toBe(200);
    const sent = visitor.getByRole('status').filter({ hasText: 'Đã nhận đăng ký của bạn' });
    await expect(sent).toBeVisible();
    await expect(sent.getByRole('heading', { name: 'Đã nhận đăng ký của bạn' })).toBeFocused();
    await visitor.close();

    // A visitor without JavaScript: the plain form posts, and lands on the result page.
    const noScript = await browser.newContext({ javaScriptEnabled: false });
    const plain = await noScript.newPage();
    await plain.goto(`${siteOrigin(site.subdomain)}/${slug}`);
    const plainForm = liveForm(plain);
    await plainForm.getByRole('textbox', { name: 'Họ và tên' }).fill('Trần Quốc Bảo');
    await plainForm.getByRole('textbox', { name: 'Số điện thoại' }).fill('0938 512 840');
    await plainForm.getByRole('button', { name: 'Gửi đăng ký' }).click();
    await expect(plain.getByRole('heading', { name: 'Chưa gửi được đăng ký' })).toBeVisible();
    await expect(plain.getByText('Bạn cần đồng ý để gửi đăng ký')).toBeVisible();
    await plain.getByRole('link', { name: 'Quay lại form' }).click();

    await liveForm(plain).getByRole('textbox', { name: 'Họ và tên' }).fill('Trần Quốc Bảo');
    await liveForm(plain).getByRole('textbox', { name: 'Số điện thoại' }).fill('0938 512 840');
    await liveForm(plain).getByRole('checkbox', { name: FILLED_CONSENT }).check();
    const result = plain.waitForResponse((response) =>
      response.url().includes('/_lead?status=received'),
    );
    await liveForm(plain).getByRole('button', { name: 'Gửi đăng ký' }).click();
    const landed = await result;
    expect(landed.status()).toBe(200);
    expect(landed.headers()['x-robots-tag']).toBe('noindex, nofollow');
    expect(landed.headers()['cache-control']).toBe('no-store');
    await expect(plain.getByRole('heading', { name: 'Đã nhận đăng ký của bạn' })).toBeVisible();
    await expect(plain.getByRole('link', { name: 'Quay lại trang' })).toHaveAttribute(
      'href',
      `/${slug}`,
    );
    await noScript.close();
  });

  test('"Thêm section" offers the form under "Form & liên hệ"', async ({ page }) => {
    const { site } = await setUpSite(page.request);
    const created = await createPageViaApi(page.request, site.id, {
      title: 'Dịch vụ niềng răng',
      slug: `dich-vu-${uniqueId()}`,
      start: {
        kind: 'goal',
        goal: 'product',
        brief: { offer: '', audience: '', phone: '' },
        style: 'calm',
      },
    });
    const editor = new Editor(page);
    await editor.goto(site.id, created.page.id);
    await expect(editor.rows.filter({ hasText: 'Form đăng ký' })).toHaveCount(0);

    await editor.structure.getByRole('button', { name: 'Thêm section', exact: true }).click();
    const add = page.getByRole('dialog', { name: 'Thêm section' });
    await add.getByRole('button', { name: /^Form & liên hệ/ }).click();
    await add.getByRole('button', { name: /^Form đăng ký/ }).click();
    await add.getByRole('button', { name: /^Thêm “/ }).click();
    await expect(add).toBeHidden();
    await expect(editor.rows.filter({ hasText: 'Form đăng ký' })).toHaveCount(1);
    await expect(editor.canvas.getByText('Đăng ký tư vấn miễn phí')).toBeVisible();
    await editor.expectSaved();
  });
});
