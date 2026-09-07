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
    `${workspacePath}/collections`,
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
  const newPageDialog = page.getByRole('dialog', { name: 'Create page' });
  await expect(newPageDialog).toBeVisible();
  await expect(newPageDialog.getByLabel('Page name')).toBeVisible();
  await expect(
    newPageDialog.getByText('Advanced page options', { exact: true }),
  ).toBeVisible();
  await expect(newPageDialog.getByLabel('Slug')).toBeHidden();
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
  const newSiteDialog = page.getByRole('dialog', { name: 'Create site' });
  await expect(newSiteDialog).toBeVisible();
  await expect(newSiteDialog.getByLabel('Site name')).toBeVisible();
  await expect(
    newSiteDialog.getByText('Advanced settings', { exact: true }),
  ).toBeVisible();
  await expect(newSiteDialog.getByLabel('Slug')).toBeHidden();
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

  const collectionsPath = `${workspacePath}/collections`;
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

test('brand styles show website impact without changing the CMS chrome', async ({
  page,
  canonicalEnvironment,
}) => {
  await loginToCanonicalBuilder(page);

  const sitePath = `/workspaces/${canonicalEnvironment.workspaceId}/sites/${canonicalEnvironment.siteId}`;
  await page.setViewportSize({ height: 900, width: 1440 });
  await page.goto(`${sitePath}/design-system`);

  await expect(
    page.getByRole('heading', { name: 'Brand & styles', exact: true }),
  ).toBeVisible();
  await expect(page.getByRole('region', { name: 'Preview your website' })).toBeVisible();
  await expect(page.getByRole('tab', { name: 'Home', exact: true })).toBeVisible();
  await expect(page.getByRole('tab', { name: 'Services', exact: true })).toBeVisible();
  await expect(
    page.getByText('Primary color → buttons, links, and highlights', { exact: true }),
  ).toBeVisible();

  const workbenchLayout = await page
    .locator('.design-system-workbench')
    .evaluate((workbench) => {
      const preview = workbench
        .querySelector('.design-system-preview')!
        .getBoundingClientRect();
      const editor = workbench
        .querySelector('.design-system-editor')!
        .getBoundingClientRect();
      return {
        editorBottom: editor.bottom,
        editorLeft: editor.left,
        editorRight: editor.right,
        editorTop: editor.top,
        previewLeft: preview.left,
        previewRight: preview.right,
        previewTop: preview.top,
        editorHeight: editor.height,
        editorPosition: getComputedStyle(
          workbench.querySelector('.design-system-editor')!,
        ).position,
      };
    });
  expect(workbenchLayout.editorPosition).toBe('fixed');
  expect(workbenchLayout.editorLeft).toBeGreaterThan(workbenchLayout.previewLeft);
  expect(workbenchLayout.editorRight).toBeLessThanOrEqual(
    workbenchLayout.previewRight + 1,
  );
  expect(workbenchLayout.editorTop).toBeGreaterThan(0);
  expect(workbenchLayout.editorHeight).toBeGreaterThan(440);
  expect(workbenchLayout.editorHeight).toBeLessThan(460);

  const editorTopBeforeScroll = workbenchLayout.editorTop;
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  const pageScrollY = await page.evaluate(() => window.scrollY);
  if (pageScrollY > 0) {
    await expect
      .poll(() =>
        page
          .locator('.design-system-editor')
          .evaluate((editor) => editor.getBoundingClientRect().top),
      )
      .toBeCloseTo(editorTopBeforeScroll, 0);
  }
  await page.evaluate(() => window.scrollTo(0, 0));

  const editor = page.locator('.design-system-editor');
  await expect(
    editor.getByRole('button', { name: 'Save draft', exact: true }),
  ).toBeVisible();
  await expect(
    editor.getByRole('button', { name: 'Publish design system', exact: true }),
  ).toBeVisible();

  const primaryColor = page.getByLabel('Primary color hex value', { exact: true });
  await primaryColor.fill('#e11d48');
  await expect
    .poll(async () =>
      page.locator('.design-system-website-frame').evaluate((frame) => ({
        brandPrimary: getComputedStyle(frame).getPropertyValue('--brand-primary').trim(),
        cmsSidebar: getComputedStyle(document.querySelector('.sidebar')!).backgroundColor,
      })),
    )
    .toEqual({ brandPrimary: '#e11d48', cmsSidebar: 'rgb(13, 13, 13)' });
  await editor
    .getByRole('button', { name: 'Publish design system', exact: true })
    .click();
  await expect(page.locator('.builder-alert.alert-success')).toHaveText(
    'Website styles published immediately.',
  );

  await page.getByRole('tab', { name: 'Services', exact: true }).click();
  await expect(page.locator('.site-preview-hero h1')).toHaveText(
    'Everything you need to move forward.',
  );
  await page.getByRole('button', { name: 'Mobile', exact: true }).click();
  await expect(page.locator('.design-system-website-frame')).toHaveClass(/is-mobile/);
  await expect(page.getByText('Menu', { exact: true })).toBeVisible();

  const dragHandle = page.getByRole('button', {
    name: 'Move design editor',
    exact: true,
  });
  const dragHandleBox = await dragHandle.boundingBox();
  expect(dragHandleBox).not.toBeNull();
  if (!dragHandleBox) throw new Error('Design editor drag handle is not measurable.');
  const editorBeforeDrag = await page
    .locator('.design-system-editor')
    .evaluate((editor) => editor.getBoundingClientRect().top);
  await page.mouse.move(
    dragHandleBox.x + dragHandleBox.width / 2,
    dragHandleBox.y + dragHandleBox.height / 2,
  );
  await page.mouse.down();
  await page.mouse.move(
    dragHandleBox.x + dragHandleBox.width / 2 - 80,
    dragHandleBox.y + dragHandleBox.height / 2 - 60,
  );
  await page.mouse.up();
  await expect
    .poll(() =>
      page
        .locator('.design-system-editor')
        .evaluate((editor) => editor.getBoundingClientRect().top),
    )
    .toBeLessThan(editorBeforeDrag - 40);
  await page.getByRole('button', { name: 'Reset position', exact: true }).click();

  await page.getByRole('button', { name: 'Close design editor', exact: true }).click();
  await expect(page.locator('.design-system-editor')).toHaveCount(0);
  const reopenButton = page.getByRole('button', { name: 'Open editor', exact: true });
  const reopenButtonBox = await reopenButton.boundingBox();
  expect(reopenButtonBox).not.toBeNull();
  if (!reopenButtonBox) throw new Error('Reopen button is not measurable.');
  const reopenBeforeDrag = await reopenButton.evaluate(
    (button) => button.getBoundingClientRect().left,
  );
  await page.mouse.move(
    reopenButtonBox.x + reopenButtonBox.width / 2,
    reopenButtonBox.y + reopenButtonBox.height / 2,
  );
  await page.mouse.down();
  await page.mouse.move(
    reopenButtonBox.x + reopenButtonBox.width / 2 - 80,
    reopenButtonBox.y + reopenButtonBox.height / 2 - 40,
  );
  await page.mouse.up();
  await expect
    .poll(() => reopenButton.evaluate((button) => button.getBoundingClientRect().left))
    .toBeLessThan(reopenBeforeDrag - 40);
  await reopenButton.click();
  await expect(
    page.getByRole('button', { name: 'Move design editor', exact: true }),
  ).toBeVisible();

  await primaryColor.fill('#2563eb');

  await page.setViewportSize({ height: 900, width: 768 });
  await page.reload();
  const smallLayout = await page
    .locator('.design-system-workbench')
    .evaluate((workbench) => {
      const preview = workbench
        .querySelector('.design-system-preview')!
        .getBoundingClientRect();
      const editor = workbench
        .querySelector('.design-system-editor')!
        .getBoundingClientRect();
      return {
        editorLeft: Math.round(editor.left),
        editorTop: Math.round(editor.top),
        previewLeft: Math.round(preview.left),
        previewTop: Math.round(preview.top),
        editorPosition: getComputedStyle(
          workbench.querySelector('.design-system-editor')!,
        ).position,
        previewPosition: getComputedStyle(
          workbench.querySelector('.design-system-preview')!,
        ).position,
      };
    });
  expect(smallLayout.editorLeft).toBe(smallLayout.previewLeft);
  expect(smallLayout.editorTop).toBeGreaterThan(smallLayout.previewTop);
  expect(smallLayout.editorPosition).toBe('static');
  expect(smallLayout.previewPosition).toBe('static');

  await page.goto(`/workspaces/${canonicalEnvironment.workspaceId}/design-system`);
  const workspaceEditor = page.locator('.design-system-editor');
  await expect(
    workspaceEditor.getByRole('button', { name: 'Publish defaults', exact: true }),
  ).toBeVisible();
});
