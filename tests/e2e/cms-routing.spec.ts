import { expect } from '@playwright/test';

import { loginToCanonicalBuilder, test } from './fixtures/canonical-environment';

test('major CMS modules are independently deep-linkable and refresh-safe', async ({
  page,
  canonicalEnvironment,
}) => {
  await loginToCanonicalBuilder(page);

  const workspacePath = `/workspaces/${canonicalEnvironment.workspaceId}`;
  const sitePath = `${workspacePath}/sites/${canonicalEnvironment.siteId}`;
  const routes = [
    workspacePath,
    `${workspacePath}/sites`,
    `${sitePath}/pages`,
    `${sitePath}/collections`,
    `${sitePath}/navigation`,
    `${sitePath}/design-system`,
    `${workspacePath}/assets`,
    `${workspacePath}/templates`,
    `${workspacePath}/submissions`,
    `${workspacePath}/workflows`,
    `${workspacePath}/integrations`,
    `${workspacePath}/analytics`,
    `${workspacePath}/domains`,
    `${sitePath}/seo`,
    `${workspacePath}/billing`,
    `${workspacePath}/users`,
    `${workspacePath}/roles`,
    `${workspacePath}/audit`,
    `${workspacePath}/extensions`,
    `${workspacePath}/organization`,
  ];

  for (const route of routes) {
    await page.goto(route);
    await expect(page).toHaveURL(new RegExp(`${route}$`));
    await expect(page.locator('main h1').first()).toBeVisible();
  }

  const nestedPageRoute = `${sitePath}/pages/${canonicalEnvironment.pageId}`;
  await page.goto(nestedPageRoute);
  await page.reload();
  await expect(page).toHaveURL(new RegExp(`${nestedPageRoute}$`));
  await expect(
    page.getByRole('heading', { name: 'Version history', exact: true }),
  ).toBeVisible();
});

test('CMS resource routes are deep-linkable and overlays require intent', async ({
  page,
  canonicalEnvironment,
}) => {
  await loginToCanonicalBuilder(page);

  const pagesRoute = `/workspaces/${canonicalEnvironment.workspaceId}/sites/${canonicalEnvironment.siteId}/pages`;
  const detailRoute = `${pagesRoute}/${canonicalEnvironment.pageId}`;

  await page.goto(pagesRoute);
  await expect(page).toHaveURL(new RegExp(`${pagesRoute}$`));
  await expect(page.getByRole('heading', { name: 'Pages', exact: true })).toBeVisible();
  await expect(page.locator('.ui-drawer-layer')).toHaveCount(0);

  await page.getByRole('button', { name: '+ New page', exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`${pagesRoute}/new$`));
  await expect(page.getByRole('dialog', { name: 'Create page' })).toBeVisible();
  await page
    .getByRole('dialog', { name: 'Create page' })
    .getByRole('button', { name: 'Cancel' })
    .click();
  await expect(page).toHaveURL(new RegExp(`${pagesRoute}$`));
  await expect(page.locator('.ui-drawer-layer')).toHaveCount(0);

  await page.goto(detailRoute);
  await expect(page).toHaveURL(new RegExp(`${detailRoute}$`));
  await expect(page.getByRole('heading', { name: 'Pages', exact: true })).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'Version history', exact: true }),
  ).toBeVisible();
  await expect(page.locator('.ui-drawer-layer')).toHaveCount(0);

  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`${detailRoute}/edit$`));
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByRole('dialog').getByRole('button', { name: 'Cancel' }).click();
  await expect(page).toHaveURL(new RegExp(`${detailRoute}$`));
  await expect(page.locator('.ui-drawer-layer')).toHaveCount(0);

  await page.goBack();
  await expect(page).toHaveURL(new RegExp(`${detailRoute}$`));
  await page.goBack();
  await expect(page).toHaveURL(new RegExp(`${pagesRoute}$`));
});

test('create routes keep resource lists quiet until the primary action is chosen', async ({
  page,
  canonicalEnvironment,
}) => {
  await loginToCanonicalBuilder(page);

  const workspacePath = `/workspaces/${canonicalEnvironment.workspaceId}`;
  const sitePath = `${workspacePath}/sites`;

  await page.goto(sitePath);
  await expect(page.getByRole('heading', { name: 'Sites', exact: true })).toBeVisible();
  await expect(page.locator('.ui-drawer-layer')).toHaveCount(0);
  await page.getByRole('button', { name: 'New site', exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`${sitePath}/new$`));
  await expect(page.getByRole('dialog', { name: 'Create site' })).toBeVisible();
  await page.getByRole('dialog').getByRole('button', { name: 'Cancel' }).click();

  const assetsPath = `${workspacePath}/assets`;
  await page.goto(assetsPath);
  await expect(page.getByRole('heading', { name: 'Assets', exact: true })).toBeVisible();
  await expect(page.locator('.ui-drawer-layer')).toHaveCount(0);
  await page.getByRole('button', { name: 'Add asset', exact: true }).first().click();
  await expect(page).toHaveURL(new RegExp(`${assetsPath}/new$`));
  await expect(page.getByRole('dialog', { name: 'Add asset' })).toBeVisible();
  await page.getByRole('dialog').getByRole('button', { name: 'Cancel' }).click();

  const templatesPath = `${workspacePath}/templates`;
  await page.goto(templatesPath);
  await expect(
    page.getByRole('heading', { name: 'Templates', exact: true }),
  ).toBeVisible();
  await expect(page.locator('.ui-drawer-layer')).toHaveCount(0);
  await page
    .locator('header')
    .getByRole('button', { name: 'New template', exact: true })
    .click();
  await expect(page).toHaveURL(new RegExp(`${templatesPath}/new$`));
  await expect(page.getByRole('dialog', { name: 'New template' })).toBeVisible();
  await page.getByRole('dialog').getByRole('button', { name: 'Cancel' }).click();

  const collectionsPath = `${workspacePath}/sites/${canonicalEnvironment.siteId}/collections`;
  await page.goto(collectionsPath);
  await expect(
    page.getByRole('heading', { name: 'Collections', exact: true }).first(),
  ).toBeVisible();
  await expect(page.locator('.ui-drawer-layer')).toHaveCount(0);
  await page.getByRole('button', { name: 'New collection', exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`${collectionsPath}/new$`));
  await expect(page.getByRole('dialog', { name: 'New collection' })).toBeVisible();
  await page.getByRole('dialog').getByRole('button', { name: 'Cancel' }).click();
  await expect(page).toHaveURL(new RegExp(`${collectionsPath}$`));
});
