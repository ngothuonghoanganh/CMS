import { expect } from '@playwright/test';

import { loginToCanonicalBuilder, test } from './fixtures/canonical-environment';

test('authenticated root bootstraps to the canonical workspace overview', async ({
  page,
  canonicalEnvironment,
}) => {
  await loginToCanonicalBuilder(page, canonicalEnvironment);
  await page.goto('/');
  await expect(page).toHaveURL(`/workspaces/${canonicalEnvironment.workspaceId}`);
  await expect(page.getByRole('heading', { name: 'Good morning' })).toBeVisible();
});

test('legacy root collection bookmarks convert to canonical routes', async ({
  page,
  canonicalEnvironment,
}) => {
  await loginToCanonicalBuilder(page, canonicalEnvironment);
  await page.goto(
    `/?view=collections&siteId=${encodeURIComponent(canonicalEnvironment.siteId)}`,
  );
  await expect(page).toHaveURL(
    `/workspaces/${canonicalEnvironment.workspaceId}/sites/${canonicalEnvironment.siteId}/collections`,
  );
  await expect(
    page.getByRole('heading', { name: 'Collections', exact: true }).first(),
  ).toBeVisible();
});

test('legacy navigation bookmarks redirect to the Design System surface', async ({
  page,
  canonicalEnvironment,
}) => {
  await loginToCanonicalBuilder(page, canonicalEnvironment);
  const workspacePath = `/workspaces/${canonicalEnvironment.workspaceId}`;
  const sitePath = `${workspacePath}/sites/${canonicalEnvironment.siteId}`;

  await page.goto(`${workspacePath}/navigation`);
  await expect(page).toHaveURL(`${workspacePath}/design-system`);

  await page.goto(`${sitePath}/navigation`);
  await expect(page).toHaveURL(`${sitePath}/design-system`);
});

test('login response goes directly to the canonical workspace route', async ({
  page,
}) => {
  const email = process.env.AUTH_EMAIL ?? 'admin@example.com';
  const password = process.env.AUTH_PASSWORD ?? 'change-me-in-development';
  await page.goto('/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/workspaces\/[^/]+$/);
  expect(new URL(page.url()).pathname).not.toBe('/');
});
