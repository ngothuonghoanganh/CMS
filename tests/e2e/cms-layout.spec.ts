import { expect, loginToCanonicalBuilder, test } from './fixtures/canonical-environment';

async function expectViewportToContainDocument(page: import('@playwright/test').Page) {
  const dimensions = await page.evaluate(() => ({
    bodyScrollWidth: document.body.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
    documentScrollWidth: document.documentElement.scrollWidth,
  }));

  expect(dimensions.documentScrollWidth).toBeLessThanOrEqual(dimensions.clientWidth + 1);
  expect(dimensions.bodyScrollWidth).toBeLessThanOrEqual(dimensions.clientWidth + 1);
}

test('CMS resource actions remain contained across narrow admin layouts', async ({
  page,
  canonicalEnvironment,
}) => {
  await loginToCanonicalBuilder(page, canonicalEnvironment);

  const workspacePath = `/workspaces/${canonicalEnvironment.workspaceId}`;

  await page.setViewportSize({ width: 320, height: 900 });
  await page.goto(`${workspacePath}/sites`);
  await expect(page.getByRole('heading', { name: 'Sites', exact: true })).toBeVisible();
  await expect(page.locator('.sites-list-panel .site-row-actions').first()).toBeVisible();
  await expectViewportToContainDocument(page);

  const siteActions = await page
    .locator('.sites-list-panel .site-row-actions')
    .evaluateAll((elements) => {
      const tableShell = document.querySelector('.sites-list-panel .table-shell');
      const shellRight = tableShell?.getBoundingClientRect().right ?? 0;
      return {
        actions: elements.map((element) => element.getBoundingClientRect().right),
        shellRight,
      };
    });
  expect(siteActions.actions.length).toBeGreaterThan(0);
  expect(Math.max(...siteActions.actions)).toBeLessThanOrEqual(
    siteActions.shellRight + 1,
  );

  await page.goto(`${workspacePath}/assets`);
  await expect(page.getByRole('heading', { name: 'Assets', exact: true })).toBeVisible();
  await expect(
    page
      .locator('.asset-library-layout > section.panel .list-row .form-actions button')
      .first(),
  ).toBeVisible();
  await expectViewportToContainDocument(page);
  await expect(page.locator('.asset-library-layout')).toHaveCSS(
    'grid-template-columns',
    '288px',
  );

  const assetBounds = await page.locator('.asset-library-layout').evaluate((layout) => {
    const layoutRight = layout.getBoundingClientRect().right;
    const buttons = [
      ...layout.querySelectorAll(':scope > section.panel .list-row .form-actions button'),
    ].map((element) => element.getBoundingClientRect().right);
    return { buttons, layoutRight };
  });
  expect(assetBounds.buttons.length).toBeGreaterThan(0);
  expect(Math.max(...assetBounds.buttons)).toBeLessThanOrEqual(
    assetBounds.layoutRight + 1,
  );

  await page.goto(workspacePath);
  await expect(
    page.getByRole('heading', { name: 'Good morning', exact: true }),
  ).toBeVisible();
  await expect(page.locator('.overview-sites-panel .list-row').first()).toBeVisible();
  await expectViewportToContainDocument(page);
  await expect(page.locator('.overview-next-action')).toHaveCSS('display', 'flex');

  const overviewCopy = await page
    .locator('.overview-sites-panel .list-row > span:first-child')
    .evaluateAll((elements) =>
      elements.map((element) => ({
        clientWidth: element.clientWidth,
        scrollWidth: element.scrollWidth,
      })),
    );
  expect(overviewCopy.length).toBeGreaterThan(0);
  for (const copy of overviewCopy) {
    expect(copy.scrollWidth).toBeLessThanOrEqual(copy.clientWidth + 1);
  }

  await page.setViewportSize({ width: 1024, height: 900 });
  await page.goto(workspacePath);
  await expect(
    page.getByRole('heading', { name: 'Good morning', exact: true }),
  ).toBeVisible();
  const overviewActionSpacing = await page.evaluate(() => {
    const paragraph = document.querySelector('.overview-hero p');
    const action = document.querySelector('.overview-next-action');
    if (!paragraph || !action) return null;
    return {
      actionTop: action.getBoundingClientRect().top,
      paragraphBottom: paragraph.getBoundingClientRect().bottom,
    };
  });
  expect(overviewActionSpacing).not.toBeNull();
  expect(overviewActionSpacing!.actionTop).toBeGreaterThanOrEqual(
    overviewActionSpacing!.paragraphBottom,
  );

  await page.goto(`${workspacePath}/sites`);
  await expect(page.getByRole('heading', { name: 'Sites', exact: true })).toBeVisible();
  const sitesTablePadding = await page
    .locator('.sites-list-panel .resource-table table')
    .evaluate((table) => {
      const firstCell = table.querySelector('thead th');
      const lastCell = table.querySelector('thead th:last-child');
      return {
        firstLeft: firstCell
          ? Number.parseFloat(getComputedStyle(firstCell).paddingLeft)
          : 0,
        lastRight: lastCell
          ? Number.parseFloat(getComputedStyle(lastCell).paddingRight)
          : 0,
      };
    });
  expect(sitesTablePadding.firstLeft).toBeGreaterThanOrEqual(8);
  expect(sitesTablePadding.lastRight).toBeGreaterThanOrEqual(8);
});
