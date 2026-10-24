import { expect, test } from '@playwright/test';
import { healthResponseSchema } from '@plp/contracts';
import { urls } from '../urls.js';

test('the admin reaches the API and database through its /api proxy', async ({ request }) => {
  const response = await request.get(`${urls.admin}/api/health`);
  expect(response.status()).toBe(200);
  expect(healthResponseSchema.parse(await response.json())).toEqual({ status: 'ok', mongo: 'up' });
});

test('the admin home renders in Vietnamese', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('lang', 'vi');
  await expect(page.getByRole('heading', { level: 1, name: 'Payload' })).toBeVisible();
});

test('the renderer answers 404 when no release exists', async ({ request }) => {
  const response = await request.get(`${urls.renderer}/uu-dai-thang-11`);
  expect(response.status()).toBe(404);
});
