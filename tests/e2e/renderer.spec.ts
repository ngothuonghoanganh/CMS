import { expect, test } from '@playwright/test';

test('renderer shell loads', async ({ browser }) => {
  const page = await browser.newPage({ baseURL: 'http://127.0.0.1:3002' });
  const navigationRequests: string[] = [];
  page.on('request', (request) => {
    if (request.isNavigationRequest()) navigationRequests.push(request.url());
  });

  await page.goto('/');
  await expect(
    page.getByRole('heading', { name: 'Public renderer shell' }),
  ).toBeVisible();
  await expect(page.getByRole('status')).toContainText('v1');

  const requestsAtReady = navigationRequests.length;
  await page.waitForTimeout(750);
  expect(navigationRequests.slice(requestsAtReady)).toEqual([]);
});
