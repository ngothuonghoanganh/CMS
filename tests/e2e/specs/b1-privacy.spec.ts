import { expect, test } from '@playwright/test';
import { SUGGESTED_REQUIRED_CONSENT_TEXT } from '@plp/contracts';
import { setUpSite } from '../support/setup.js';
import { urls } from '../urls.js';

const BUSINESS = 'Công ty TNHH Nha khoa Smile Care';

test.describe('B1 · Dữ liệu cá nhân & đồng ý', () => {
  test('the owner sets who collects the data, the policy link and versioned consent texts', async ({
    page,
  }) => {
    const { site } = await setUpSite(page.request);
    await page.goto(`${urls.admin}/sites/${site.id}`);
    await page
      .getByRole('navigation', { name: 'Điều hướng chính' })
      .getByRole('link', { name: 'Dữ liệu & đồng ý' })
      .click();
    await expect(
      page.getByRole('heading', { level: 1, name: 'Dữ liệu cá nhân & đồng ý' }),
    ).toBeVisible();
    await expect(page.getByText(/không phải tư vấn pháp lý/)).toBeVisible();

    // Who collects the data, the policy link and the retention period.
    const settings = page.getByRole('form', { name: 'Cài đặt dữ liệu cá nhân' });
    const policy = settings.getByRole('textbox', { name: /Link chính sách/ });
    await settings.getByRole('textbox', { name: /Tên doanh nghiệp/ }).fill(BUSINESS);
    await settings.getByRole('textbox', { name: /Email nhận yêu cầu/ }).fill('dulieu@smilecare.vn');
    await policy.fill('smilecare.vn/chinh-sach');
    // Pressing the button keeps focus in the field: its blur check cannot push the button away
    // before the click lands, and the submit checks every field.
    await settings.getByRole('button', { name: 'Lưu cài đặt' }).click();
    await expect(
      settings.getByText('Đường dẫn phải bắt đầu bằng http:// hoặc https://'),
    ).toBeVisible();
    await expect(policy).toBeFocused();
    await policy.fill('https://smilecare.vn/chinh-sach');
    await settings.getByRole('combobox', { name: /Tự động xóa lead/ }).selectOption({
      label: '24 tháng',
    });
    await settings.getByRole('button', { name: 'Lưu cài đặt' }).click();
    await expect(page.getByText('Đã lưu cài đặt dữ liệu cá nhân', { exact: true })).toBeVisible();
    await expect(settings.getByText(/Trang có form đang live giữ nội dung đồng ý/)).toBeVisible();

    await page.reload();
    await expect(settings.getByRole('textbox', { name: /Tên doanh nghiệp/ })).toHaveValue(BUSINESS);
    await expect(policy).toHaveValue('https://smilecare.vn/chinh-sach');
    await expect(settings.getByRole('combobox', { name: /Tự động xóa lead/ })).toHaveValue('24');

    // The consent texts: suggested at first, saved as immutable versions.
    const consent = page.getByRole('region', { name: 'Nội dung đồng ý trên form' });
    const requiredText = consent.getByRole('textbox', { name: /Đồng ý bắt buộc/ });
    await expect(consent.getByText('Chưa có nội dung đồng ý')).toBeVisible();
    await expect(requiredText).toHaveValue(SUGGESTED_REQUIRED_CONSENT_TEXT);
    await expect(consent.getByRole('group', { name: 'Khách sẽ thấy' })).toContainText(
      `Tôi đồng ý để ${BUSINESS} xử lý họ tên`,
    );
    await consent.getByRole('button', { name: 'Lưu thành bản 1' }).click();
    await expect(consent.getByText(/^Bản 1 · đang dùng từ/)).toBeVisible();
    await expect(consent.getByRole('button', { name: 'Lưu thành bản 2' })).toBeDisabled();

    await requiredText.fill('Tôi đồng ý để {Tên doanh nghiệp} gọi lại tư vấn.');
    await consent.getByRole('switch', { name: /Thêm ô đồng ý nhận ưu đãi/ }).click();
    const preview = consent.getByRole('group', { name: 'Khách sẽ thấy' });
    await expect(preview).toContainText(`Tôi đồng ý để ${BUSINESS} gọi lại tư vấn.`);
    await expect(preview).not.toContainText('Nhận thông tin ưu đãi');
    await consent.getByRole('button', { name: 'Lưu thành bản 2' }).click();
    await expect(consent.getByText(/^Bản 2 · đang dùng từ/)).toBeVisible();

    await consent.getByRole('button', { name: 'Xem các bản đã lưu' }).click();
    const history = page.getByRole('dialog', { name: 'Các bản nội dung đồng ý' });
    const versions = history.getByRole('listitem');
    await expect(versions).toHaveCount(2);
    await expect(versions.nth(0)).toContainText('Bản 2');
    await expect(versions.nth(0)).toContainText('Không có ô nhận ưu đãi');
    await expect(versions.nth(1)).toContainText('Bản 1');
    await expect(versions.nth(1)).toContainText(SUGGESTED_REQUIRED_CONSENT_TEXT);
  });
});
