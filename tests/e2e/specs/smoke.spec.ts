import { expect, test } from '@playwright/test';
import { healthResponseSchema } from '@plp/contracts';
import { fetchPublic } from '../support/public-site.js';
import { newSubdomain } from '../support/setup.js';
import { urls } from '../urls.js';

test('the admin reaches the API and database through its /api proxy', async ({ request }) => {
  const response = await request.get(`${urls.admin}/api/health`);
  expect(response.status()).toBe(200);
  expect(healthResponseSchema.parse(await response.json())).toEqual({ status: 'ok', mongo: 'up' });
});

test('a signed-out visitor of the admin lands on the Vietnamese login page', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.locator('html')).toHaveAttribute('lang', 'vi');
  await expect(page.getByRole('heading', { level: 1, name: 'Đăng nhập' })).toBeVisible();
});

test('the renderer answers 404 when no release exists', async ({ request }) => {
  const response = await request.get(`${urls.renderer}/uu-dai-thang-11`);
  expect(response.status()).toBe(404);
});

test('an unknown site answers 404 with the message in the HTML itself', async ({ request }) => {
  const response = await fetchPublic(request, newSubdomain(), '/uu-dai-thang-11');
  expect(response.status).toBe(404);
  expect(response.html).toContain('Trang bạn tìm không tồn tại hoặc chưa được xuất bản.');
});
