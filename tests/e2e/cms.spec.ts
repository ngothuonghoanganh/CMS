import { expect, test, type Locator, type Page } from '@playwright/test';

const email = process.env.AUTH_EMAIL ?? 'admin@example.com';
const password = process.env.AUTH_PASSWORD ?? 'change-me-in-development';

async function login(page: Page) {
  await page.goto('/');
  await expect(page).toHaveURL(/\/login$/);
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole('heading', { name: 'Good morning' })).toBeVisible();
}

async function openBuilder(page: Page, prefix: string): Promise<string> {
  const suffix = Date.now().toString();
  const pageName = `${prefix} ${suffix}`;
  const slugPrefix = prefix.toLowerCase().replaceAll(' ', '-');
  await login(page);
  await page.getByRole('button', { name: 'Sites', exact: true }).click();
  await page.getByLabel('Site name').fill(`${prefix} Site ${suffix}`);
  await page.getByLabel('Slug').fill(`${slugPrefix}-site-${suffix}`);
  await page.getByRole('button', { name: 'Create site' }).click();
  await expect(page.getByRole('status')).toContainText('Site created');
  await page.getByRole('button', { name: 'Landing Pages', exact: true }).click();
  await page.getByLabel('Page name').fill(pageName);
  await page.getByLabel('Slug').fill(`${slugPrefix}-page-${suffix}`);
  await page.getByRole('button', { name: 'Create page' }).click();
  await expect(page.getByRole('status')).toContainText('draft version 1 created');
  await page.getByRole('button', { name: 'Open Builder' }).click();
  await expect(page).toHaveURL(/\/builder$/);
  await expect(page.getByRole('heading', { name: pageName })).toBeVisible();
  await expect(page.locator('.gjs-editor')).toBeVisible({ timeout: 15_000 });
  return pageName;
}

type BuilderDebugNode = {
  id: string;
  type: string;
  props: Record<string, unknown>;
  children: BuilderDebugNode[];
};

type BuilderDebugPayload = {
  root: BuilderDebugNode;
};

async function readBuilderModel(page: Page): Promise<BuilderDebugPayload> {
  const payload = await page.evaluate(() => {
    const debug = (
      window as Window & {
        __payloadBuilderDebug?: { getPayload: () => unknown };
      }
    ).__payloadBuilderDebug;
    return debug?.getPayload();
  });
  expect(payload).toBeTruthy();
  return payload as BuilderDebugPayload;
}

async function dragWithRealPointer(
  page: Page,
  source: Locator,
  target: Locator,
): Promise<void> {
  const sourceBox = await source.boundingBox();
  const targetBox = await target.boundingBox();
  expect(sourceBox).not.toBeNull();
  expect(targetBox).not.toBeNull();
  const sourceX = sourceBox!.x + sourceBox!.width / 2;
  const sourceY = sourceBox!.y + sourceBox!.height / 2;
  const targetX = targetBox!.x + targetBox!.width / 2;
  const targetY = targetBox!.y + Math.max(4, Math.min(48, targetBox!.height / 2));
  await page.mouse.move(sourceX, sourceY);
  await page.mouse.down();
  await page.mouse.move(sourceX + 20, sourceY, { steps: 5 });
  await page.mouse.move(targetX, targetY, { steps: 20 });
  await page.waitForTimeout(300);
  await page.mouse.up();
}

test('protected CMS route redirects to login', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveURL(/\/login$/);
  await expect(
    page.getByRole('heading', { name: 'Sign in to your workspace' }),
  ).toBeVisible();
});

test('invalid login shows a structured error', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill('wrong-password');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByText('The email or password is invalid')).toBeVisible();
});

test('valid login and logout protect the CMS shell', async ({ page }) => {
  await login(page);
  await expect(page.getByText('Authenticated')).toBeVisible();
  await page.getByRole('button', { name: 'Log out' }).click();
  await expect(page).toHaveURL(/\/login$/);
  await page.goto('/');
  await expect(page).toHaveURL(/\/login$/);
});

test('CMS bootstrap settles after the authenticated shell is ready', async ({ page }) => {
  const apiRequests: string[] = [];
  page.on('request', (request) => {
    if (
      request.url().startsWith('http://127.0.0.1:3001/api/v1/') &&
      request.method() === 'GET'
    ) {
      apiRequests.push(request.url());
    }
  });

  await login(page);
  const requestsAtReady = apiRequests.length;
  await page.waitForTimeout(750);

  expect(apiRequests.slice(requestsAtReady)).toEqual([]);
  await expect(page.getByText('Authenticated')).toBeVisible();
});

test('stale auth cookies do not redirect login back into a loop', async ({ browser }) => {
  const context = await browser.newContext();
  await context.addCookies([
    {
      domain: '127.0.0.1',
      name: process.env.AUTH_ACCESS_TOKEN_COOKIE_NAME ?? 'payload_access_token',
      path: '/',
      value: 'stale-access-token',
    },
    {
      domain: '127.0.0.1',
      name: process.env.AUTH_REFRESH_TOKEN_COOKIE_NAME ?? 'payload_refresh_token',
      path: '/',
      value: 'stale-refresh-token',
    },
  ]);
  const page = await context.newPage();
  const navigationRequests: string[] = [];
  page.on('request', (request) => {
    if (request.isNavigationRequest()) navigationRequests.push(request.url());
  });

  await page.goto('http://127.0.0.1:3000/login');
  await expect(
    page.getByRole('heading', { name: 'Sign in to your workspace' }),
  ).toBeVisible();
  const requestsAtReady = navigationRequests.length;
  await page.waitForTimeout(750);

  expect(page.url()).toBe('http://127.0.0.1:3000/login');
  expect(navigationRequests.slice(requestsAtReady)).toEqual([]);
  await context.close();
});

test('refreshes an active session when the access cookie is no longer present', async ({
  context,
  page,
}) => {
  await login(page);

  await context.clearCookies({
    name: process.env.AUTH_ACCESS_TOKEN_COOKIE_NAME ?? 'payload_access_token',
  });
  await page.reload();

  await expect(page.getByRole('heading', { name: 'Good morning' })).toBeVisible();
  await expect(page.getByText('Authenticated')).toBeVisible();
});

test('creates and edits a site', async ({ page }) => {
  const suffix = Date.now().toString();
  await login(page);
  await page.getByRole('button', { name: 'Sites', exact: true }).click();
  await page.getByLabel('Site name').fill(`E2E Site ${suffix}`);
  await page.getByLabel('Slug').fill(`e2e-site-${suffix}`);
  await page.getByRole('button', { name: 'Create site' }).click();
  await expect(page.getByRole('status')).toContainText('Site created');
  await expect(page.getByText(`E2E Site ${suffix}`)).toBeVisible();

  await page.getByRole('button', { name: 'Edit' }).last().click();
  await page.getByLabel('Site name').fill(`Edited E2E Site ${suffix}`);
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.getByRole('status')).toContainText('Site metadata updated');
  await expect(page.getByText(`Edited E2E Site ${suffix}`)).toBeVisible();
});

test('creates a landing page and edits its metadata', async ({ page }) => {
  const suffix = Date.now().toString();
  await login(page);
  await page.getByRole('button', { name: 'Sites', exact: true }).click();
  await page.getByLabel('Site name').fill(`Page Site ${suffix}`);
  await page.getByLabel('Slug').fill(`page-site-${suffix}`);
  await page.getByRole('button', { name: 'Create site' }).click();
  await expect(page.getByRole('status')).toContainText('Site created');

  await page.getByRole('button', { name: 'Landing Pages', exact: true }).click();
  await page.getByLabel('Page name').fill(`Landing Page ${suffix}`);
  await page.getByLabel('Slug').fill(`landing-page-${suffix}`);
  await page.getByRole('button', { name: 'Create page' }).click();
  await expect(page.getByRole('status')).toContainText('draft version 1 created');
  await expect(page.getByText(`Landing Page ${suffix}`)).toBeVisible();

  await page.getByRole('button', { name: `Landing Page ${suffix}` }).click();
  await page.getByLabel('Page name').fill(`Edited Landing Page ${suffix}`);
  await page.getByRole('button', { name: 'Save metadata' }).click();
  await expect(page.getByRole('status')).toContainText('metadata updated');
  await expect(page.getByText(`Edited Landing Page ${suffix}`)).toBeVisible();
  await expect(page.getByText('Version 1')).toBeVisible();
});

test('opens the visual builder, saves a draft, and restores it after reload', async ({
  page,
}) => {
  const suffix = Date.now().toString();
  await login(page);
  await page.getByRole('button', { name: 'Sites', exact: true }).click();
  await page.getByLabel('Site name').fill(`Builder Site ${suffix}`);
  await page.getByLabel('Slug').fill(`builder-site-${suffix}`);
  await page.getByRole('button', { name: 'Create site' }).click();
  await expect(page.getByRole('status')).toContainText('Site created');

  await page.getByRole('button', { name: 'Landing Pages', exact: true }).click();
  await page.getByLabel('Page name').fill(`Builder Page ${suffix}`);
  await page.getByLabel('Slug').fill(`builder-page-${suffix}`);
  await page.getByRole('button', { name: 'Create page' }).click();
  await expect(page.getByRole('status')).toContainText('draft version 1 created');

  await page.getByRole('button', { name: 'Open Builder' }).click();
  await expect(page).toHaveURL(/\/builder$/);
  await expect(
    page.getByRole('heading', { name: `Builder Page ${suffix}` }),
  ).toBeVisible();
  await expect(page.locator('.gjs-editor')).toBeVisible({ timeout: 15_000 });

  await page.getByRole('button', { name: /^Section/ }).click();
  await page.getByRole('button', { name: /^Text/ }).click();
  await page.getByLabel('Text content').fill('Persisted builder content');
  await page.getByRole('button', { name: 'Save draft' }).click();
  await expect(page.getByText('Saved · v2')).toBeVisible({ timeout: 15_000 });

  await page.reload();
  await expect(
    page.getByRole('heading', { name: `Builder Page ${suffix}` }),
  ).toBeVisible();
  await expect(
    page
      .frameLocator('iframe.gjs-frame')
      .locator('p')
      .filter({ hasText: 'Persisted builder content' }),
  ).toBeVisible({ timeout: 15_000 });
});

test('supports true block drag and a second edit after save and reload', async ({
  page,
}) => {
  await openBuilder(page, 'Drag Builder');

  const dragHandle = page.getByRole('button', { name: 'Drag Text block' });
  const canvasRoot = page.frameLocator('iframe.gjs-frame').locator('main');
  const dragBox = await dragHandle.boundingBox();
  const targetBox = await canvasRoot.boundingBox();
  expect(dragBox).not.toBeNull();
  expect(targetBox).not.toBeNull();
  await page.mouse.move(
    dragBox!.x + dragBox!.width / 2,
    dragBox!.y + dragBox!.height / 2,
  );
  await page.mouse.down();
  await page.mouse.move(
    targetBox!.x + targetBox!.width / 2,
    targetBox!.y + Math.min(48, targetBox!.height / 2),
    { steps: 12 },
  );
  await page.mouse.up();
  const dragDebug = await page.evaluate(() => {
    const debug = (
      window as Window & {
        __payloadBuilderDebug?: {
          getPayload: () => unknown;
        };
      }
    ).__payloadBuilderDebug;
    return { payload: debug?.getPayload() };
  });
  expect(dragDebug.payload).toMatchObject({
    root: {
      children: [
        {
          type: 'section',
          children: [{ type: 'text', props: { text: 'Edit this text' } }],
        },
      ],
    },
  });
  const canvasText = page
    .frameLocator('iframe.gjs-frame')
    .locator('p')
    .filter({ hasText: 'Edit this text' });
  await expect(canvasText).toBeVisible({ timeout: 15_000 });

  await page.getByLabel('Text content').fill('Hello Landing Page');
  await page.getByRole('button', { name: 'Save draft' }).click();
  await expect(page.getByText('Saved · v2')).toBeVisible({ timeout: 15_000 });
  await page.reload();
  await expect(
    page
      .frameLocator('iframe.gjs-frame')
      .locator('p')
      .filter({ hasText: 'Hello Landing Page' }),
  ).toBeVisible({ timeout: 15_000 });

  await page
    .frameLocator('iframe.gjs-frame')
    .locator('p')
    .filter({ hasText: 'Hello Landing Page' })
    .click();
  await page.getByLabel('Text content').fill('Updated Landing Page');
  await page.getByRole('button', { name: 'Save draft' }).click();
  await expect(page.getByText('Saved · v3')).toBeVisible({ timeout: 15_000 });
  await page.reload();
  await expect(
    page
      .frameLocator('iframe.gjs-frame')
      .locator('p')
      .filter({ hasText: 'Updated Landing Page' }),
  ).toBeVisible({ timeout: 15_000 });
});

test('diagnoses Playwright dragTo against the real GrapesJS model', async ({ page }) => {
  await openBuilder(page, 'DragTo Builder');
  const source = page.getByRole('button', { name: 'Drag Text block' });
  const target = page.frameLocator('iframe.gjs-frame').locator('main');
  const targetBox = await target.boundingBox();
  expect(targetBox).not.toBeNull();

  await source.dragTo(target, {
    targetPosition: {
      x: targetBox!.width / 2,
      y: Math.min(48, targetBox!.height / 2),
    },
  });
  const model = await readBuilderModel(page);
  expect(model.root.children[0]?.children[0]?.type).toBe('text');
  await expect(
    page
      .frameLocator('iframe.gjs-frame')
      .locator('p')
      .filter({ hasText: 'Edit this text' }),
  ).toBeVisible();
});

test('reorders existing components with canvas drag and persists the order', async ({
  page,
}) => {
  await openBuilder(page, 'Reorder Builder');
  await page.getByRole('button', { name: /^Section/ }).click();
  await page.getByRole('button', { name: /^Text/ }).click();
  await page.getByLabel('Text content').fill('First component');
  await page.getByRole('button', { name: /^Text/ }).click();
  await page.getByLabel('Text content').fill('Second component');

  const canvasTexts = page.frameLocator('iframe.gjs-frame').locator('p');
  await expect(canvasTexts).toHaveCount(2);
  const firstBox = await canvasTexts.nth(0).boundingBox();
  const secondBox = await canvasTexts.nth(1).boundingBox();
  expect(firstBox).not.toBeNull();
  expect(secondBox).not.toBeNull();
  await expect(canvasTexts.nth(1)).toHaveCSS('cursor', 'grab');
  await page.mouse.move(
    secondBox!.x + secondBox!.width / 2,
    secondBox!.y + secondBox!.height / 2,
  );
  await page.mouse.down();
  await page.mouse.move(
    secondBox!.x + secondBox!.width / 2 + 20,
    secondBox!.y + secondBox!.height / 2,
    { steps: 5 },
  );
  await page.mouse.move(firstBox!.x + firstBox!.width / 2, firstBox!.y + 2, {
    steps: 12,
  });
  await page.mouse.up();
  await expect
    .poll(() => canvasTexts.allTextContents())
    .toEqual(['Second component', 'First component']);
  const reorderModel = await readBuilderModel(page);
  expect(
    reorderModel.root.children[0]?.children.map((child) => child.props.text),
  ).toEqual(['Second component', 'First component']);

  await page.getByRole('button', { name: 'Save draft' }).click();
  await expect(page.getByText('Saved · v2')).toBeVisible({ timeout: 15_000 });
  await page.reload();
  await expect(page.locator('iframe.gjs-frame')).toBeVisible({ timeout: 15_000 });
  await expect
    .poll(() => canvasTexts.allTextContents())
    .toEqual(['Second component', 'First component']);
});

test('moves between valid containers, inserts a block, and rejects invalid drops', async ({
  page,
}) => {
  await openBuilder(page, 'Nested Drag Builder');
  const canvas = page.frameLocator('iframe.gjs-frame');
  const containerAdd = page.getByRole('button', { name: 'Container add' });
  const textAdd = page.getByRole('button', { name: 'Text add' });

  await containerAdd.click();
  await textAdd.click();
  await page.getByLabel('Text content').fill('Text in container A');
  await containerAdd.click();
  await textAdd.click();
  await page.getByLabel('Text content').fill('Text in container B');

  const textA = canvas.locator('p').filter({ hasText: 'Text in container A' });
  const textB = canvas.locator('p').filter({ hasText: 'Text in container B' });
  const containerB = canvas.locator('div[data-payload-node-type="container"]').nth(1);
  await dragWithRealPointer(page, textA, containerB);

  let model = await readBuilderModel(page);
  expect(model.root.children.map((child) => child.type)).toEqual([
    'container',
    'container',
  ]);
  expect(model.root.children[0]?.children).toHaveLength(0);
  expect(model.root.children[1]?.children.map((child) => child.props.text)).toEqual([
    'Text in container A',
    'Text in container B',
  ]);
  const movedModel = model;
  await page.getByRole('button', { name: 'Undo' }).click();
  const undoneModel = await readBuilderModel(page);
  expect(undoneModel.root.children[0]?.children.map((child) => child.props.text)).toEqual(
    ['Text in container A'],
  );
  await page.getByRole('button', { name: 'Redo' }).click();
  expect(await readBuilderModel(page)).toEqual(movedModel);

  await dragWithRealPointer(
    page,
    page.getByRole('button', { name: 'Drag Button block' }),
    textB,
  );
  await expect(canvas.locator('a[data-payload-node-type="button"]')).toHaveCount(1);
  model = await readBuilderModel(page);
  expect(model.root.children[1]?.children.map((child) => child.type)).toEqual([
    'text',
    'text',
    'button',
  ]);

  const beforeInvalidDrop = model;
  await dragWithRealPointer(
    page,
    canvas.locator('div[data-payload-node-type="container"]').nth(1),
    canvas.locator('a[data-payload-node-type="button"]'),
  );
  expect(await readBuilderModel(page)).toEqual(beforeInvalidDrop);

  await page.getByRole('button', { name: 'Save draft' }).click();
  await expect(page.getByText('Saved · v2')).toBeVisible({ timeout: 15_000 });
  await page.reload();
  await expect(canvas.locator('a[data-payload-node-type="button"]')).toHaveCount(1);
  expect(await readBuilderModel(page)).toEqual(beforeInvalidDrop);
});

test('supports Space hand-pan without changing the GrapesJS tree', async ({ page }) => {
  await openBuilder(page, 'Pan Builder');
  await page.getByRole('button', { name: /^Section/ }).click();
  await page.getByRole('button', { name: /^Text/ }).click();
  const beforePan = await readBuilderModel(page);
  const frame = page.locator('iframe.gjs-frame');
  const frameBox = await frame.boundingBox();
  expect(frameBox).not.toBeNull();

  const interactionToolbar = page.locator('.builder-interaction-toolbar');
  await interactionToolbar.getByRole('button', { name: /Hand/ }).click();
  await expect(interactionToolbar.getByRole('button', { name: /Hand/ })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await page.mouse.move(frameBox!.x + 520, frameBox!.y + 360);
  await page.mouse.down();
  await page.mouse.move(frameBox!.x + 460, frameBox!.y + 300, { steps: 8 });
  await page.mouse.up();
  expect(await readBuilderModel(page)).toEqual(beforePan);

  await interactionToolbar.getByRole('button', { name: /Select/ }).click();
  await expect(
    interactionToolbar.getByRole('button', { name: /Select/ }),
  ).toHaveAttribute('aria-pressed', 'true');
});

test('auto-scrolls the Canvas while a real pointer drag reaches the viewport edge', async ({
  page,
}) => {
  await openBuilder(page, 'Auto Scroll Builder');
  await page.getByRole('button', { name: 'Section add' }).click();
  await page.getByLabel('Min height').fill('1600px');
  await page.getByRole('button', { name: 'Text add' }).click();
  const canvas = page.frameLocator('iframe.gjs-frame');
  const text = canvas.locator('p[data-payload-node-type="text"]');
  const textBox = await text.boundingBox();
  const frameBox = await page.locator('iframe.gjs-frame').boundingBox();
  expect(textBox).not.toBeNull();
  expect(frameBox).not.toBeNull();
  const scrollTop = () =>
    Promise.all([
      page.locator('.gjs-cv-canvas').evaluate((element) => element.scrollTop),
      page
        .locator('iframe.gjs-frame')
        .evaluate((element) => element.contentDocument?.scrollingElement?.scrollTop ?? 0),
    ]).then(([canvasScrollTop, frameScrollTop]) => canvasScrollTop + frameScrollTop);
  const before = await scrollTop();
  await page.mouse.move(
    textBox!.x + textBox!.width / 2,
    textBox!.y + textBox!.height / 2,
  );
  await page.mouse.down();
  await page.mouse.move(
    frameBox!.x + frameBox!.width / 2,
    frameBox!.y + frameBox!.height - 8,
    { steps: 24 },
  );
  await page.waitForTimeout(500);
  const after = await scrollTop();
  await page.mouse.up();
  expect(after).toBeGreaterThan(before);
});

test('moves a node from Layers with the same operation and persists the reparent', async ({
  page,
}) => {
  await openBuilder(page, 'Layers Drag Builder');
  const canvas = page.frameLocator('iframe.gjs-frame');
  await page.getByRole('button', { name: 'Container add' }).click();
  await page.getByRole('button', { name: 'Text add' }).click();
  await page.getByLabel('Text content').fill('Layer text A');
  await page.getByRole('button', { name: 'Container add' }).click();
  await page.getByRole('button', { name: 'Text add' }).click();
  await page.getByLabel('Text content').fill('Layer text B');

  const sourceLabel = page
    .locator('.builder-layer-label')
    .filter({ hasText: 'Layer text A' });
  const sourceRow = sourceLabel.locator(
    'xpath=ancestor::*[@data-builder-layer-row-id][1]',
  );
  const sourceHandle = sourceRow.locator(
    ':scope > .builder-layer-row > .builder-layer-drag-handle',
  );
  const containerLabels = page
    .locator('.builder-layer-label')
    .filter({ hasText: 'Container' });
  const targetRow = containerLabels
    .nth(1)
    .locator('xpath=ancestor::*[@data-builder-layer-row-id][1]');
  await targetRow.scrollIntoViewIfNeeded();
  const sourceBox = await sourceHandle.boundingBox();
  const targetBox = await targetRow
    .locator(':scope > .builder-layer-row > .builder-layer-button')
    .boundingBox();
  expect(sourceBox).not.toBeNull();
  expect(targetBox).not.toBeNull();
  await page.mouse.move(
    sourceBox!.x + sourceBox!.width / 2,
    sourceBox!.y + sourceBox!.height / 2,
  );
  await page.mouse.down();
  await page.waitForTimeout(100);
  await page.mouse.move(sourceBox!.x + 20, sourceBox!.y + 4, { steps: 5 });
  await page.mouse.move(
    targetBox!.x + targetBox!.width / 2,
    targetBox!.y + targetBox!.height / 2,
    { steps: 16 },
  );
  await page.waitForTimeout(150);
  await page.mouse.up();

  await expect
    .poll(async () =>
      (await readBuilderModel(page)).root.children[1]?.children.map(
        (node) => node.props.text,
      ),
    )
    .toEqual(['Layer text B', 'Layer text A']);
  await expect(
    canvas.locator('div[data-payload-node-type="container"]').nth(0),
  ).not.toContainText('Layer text A');
  await expect(
    canvas.locator('div[data-payload-node-type="container"]').nth(1).locator('p'),
  ).toHaveText(['Layer text B', 'Layer text A']);

  await page.getByRole('button', { name: 'Save draft' }).click();
  await expect(page.getByText('Saved · v2')).toBeVisible({ timeout: 15_000 });
  await page.reload();
  await expect(canvas.locator('p').filter({ hasText: 'Layer text A' })).toBeVisible();
  expect(
    (await readBuilderModel(page)).root.children[1]?.children.map(
      (node) => node.props.text,
    ),
  ).toEqual(['Layer text B', 'Layer text A']);
});

test('rejects a circular Canvas move into a descendant', async ({ page }) => {
  await openBuilder(page, 'Circular Drag Builder');
  const canvas = page.frameLocator('iframe.gjs-frame');
  await page.getByRole('button', { name: 'Section add' }).click();
  await page.getByRole('button', { name: 'Container add' }).click();
  await page.getByRole('button', { name: 'Text add' }).click();
  const before = await readBuilderModel(page);
  const section = canvas.locator('section[data-payload-node-type="section"]');
  const container = canvas.locator('div[data-payload-node-type="container"]');
  await dragWithRealPointer(page, section, container);
  expect(await readBuilderModel(page)).toEqual(before);
});

test('edits responsive styles and changes the real canvas viewport', async ({ page }) => {
  await openBuilder(page, 'Responsive Builder');
  await page.getByRole('button', { name: /^Section/ }).click();
  await page.getByRole('button', { name: /^Text/ }).click();
  await page.getByLabel('Width', { exact: true }).fill('320px');

  const frame = page.locator('iframe.gjs-frame');
  const canvasWidth = () =>
    frame.evaluate(
      (element) => element.contentDocument?.documentElement.clientWidth ?? -1,
    );
  const desktopWidth = await canvasWidth();
  await page.getByRole('button', { name: 'Tablet', exact: true }).click();
  await expect.poll(canvasWidth).toBeLessThan(desktopWidth);
  const tabletWidth = await canvasWidth();
  expect(tabletWidth).toBeLessThan(desktopWidth);
  await page.getByLabel('Width', { exact: true }).fill('280px');

  await page.getByRole('button', { name: 'Mobile', exact: true }).click();
  await expect.poll(canvasWidth).toBeLessThan(tabletWidth);
  const mobileWidth = await canvasWidth();
  expect(mobileWidth).toBeLessThan(tabletWidth);
  await page.getByLabel('Width', { exact: true }).fill('240px');
  await page.getByRole('button', { name: 'Save draft' }).click();
  await expect(page.getByText('Saved · v2')).toBeVisible({ timeout: 15_000 });

  await page.reload();
  await page
    .frameLocator('iframe.gjs-frame')
    .locator('p')
    .filter({ hasText: 'Edit this text' })
    .click();
  await page.getByRole('button', { name: 'Tablet', exact: true }).click();
  await expect(page.getByLabel('Width', { exact: true })).toHaveValue('280px');
  await page.getByRole('button', { name: 'Mobile', exact: true }).click();
  await expect(page.getByLabel('Width', { exact: true })).toHaveValue('240px');
});

test('applies multiple inspector properties immediately and persists them after reload', async ({
  page,
}) => {
  await openBuilder(page, 'Inspector Persistence Builder');
  await page.getByRole('button', { name: /^Section/ }).click();
  await page.getByRole('button', { name: /^Text/ }).click();

  const canvasText = page
    .frameLocator('iframe.gjs-frame')
    .locator('p[data-payload-node-type="text"]');
  await page.getByLabel('Text content').fill('Persisted inspector content');
  await page.getByRole('button', { name: 'Align text center' }).click();
  await page.getByLabel('Width', { exact: true }).fill('320px');
  await page.getByText('Spacing', { exact: true }).click();
  await page.getByLabel('Margin', { exact: true }).fill('12px 0');
  await page.getByText('Appearance', { exact: true }).click();
  await page.getByLabel('Background', { exact: true }).fill('#fef3c7');

  await expect(canvasText).toHaveText('Persisted inspector content');
  await expect
    .poll(() =>
      canvasText.evaluate((element) => {
        const style = getComputedStyle(element);
        return {
          width: style.width,
          textAlign: style.textAlign,
          marginTop: style.marginTop,
          backgroundColor: style.backgroundColor,
        };
      }),
    )
    .toEqual({
      width: '320px',
      textAlign: 'center',
      marginTop: '12px',
      backgroundColor: 'rgb(254, 243, 199)',
    });

  expect(await readBuilderModel(page)).toMatchObject({
    root: {
      children: [
        {
          children: [
            {
              type: 'text',
              props: { text: 'Persisted inspector content', align: 'center' },
              style: {
                base: {
                  width: '320px',
                  margin: '12px 0',
                  backgroundColor: '#fef3c7',
                },
              },
            },
          ],
        },
      ],
    },
  });

  await page.getByRole('button', { name: 'Save draft' }).click();
  await expect(page.getByText('Saved · v2')).toBeVisible({ timeout: 15_000 });
  await page.reload();

  const reloadedText = page
    .frameLocator('iframe.gjs-frame')
    .locator('p[data-payload-node-type="text"]');
  await expect(reloadedText).toHaveText('Persisted inspector content');
  await reloadedText.click();
  await page.getByText('Spacing', { exact: true }).click();
  await page.getByText('Appearance', { exact: true }).click();
  await expect(page.getByLabel('Text content')).toHaveValue(
    'Persisted inspector content',
  );
  await expect(page.getByRole('button', { name: 'Align text center' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(page.getByLabel('Width', { exact: true })).toHaveValue('320px');
  await expect(page.getByLabel('Margin', { exact: true })).toHaveValue('12px 0');
  await expect(page.getByLabel('Background', { exact: true })).toHaveValue('#fef3c7');
  await expect
    .poll(() =>
      reloadedText.evaluate((element) => {
        const style = getComputedStyle(element);
        return {
          width: style.width,
          textAlign: style.textAlign,
          marginTop: style.marginTop,
          backgroundColor: style.backgroundColor,
        };
      }),
    )
    .toEqual({
      width: '320px',
      textAlign: 'center',
      marginTop: '12px',
      backgroundColor: 'rgb(254, 243, 199)',
    });
  expect(await readBuilderModel(page)).toMatchObject({
    root: {
      children: [
        {
          children: [
            {
              type: 'text',
              props: { text: 'Persisted inspector content', align: 'center' },
              style: {
                base: {
                  width: '320px',
                  margin: '12px 0',
                  backgroundColor: '#fef3c7',
                },
              },
            },
          ],
        },
      ],
    },
  });
});

test('supports duplicate, delete, undo and redo for a selected component', async ({
  page,
}) => {
  await openBuilder(page, 'Component Actions');
  await page.getByRole('button', { name: /^Section/ }).click();
  await page.getByRole('button', { name: /^Text/ }).click();
  await page.getByLabel('Text content').fill('Action component');

  await page.getByRole('button', { name: 'Duplicate' }).click();
  await expect(
    page
      .frameLocator('iframe.gjs-frame')
      .locator('p')
      .filter({ hasText: 'Action component' }),
  ).toHaveCount(2);
  await page.getByRole('button', { name: 'Save draft' }).click();
  await expect(page.getByText('Saved · v2')).toBeVisible({ timeout: 15_000 });

  await page.getByRole('button', { name: 'Delete' }).click();
  await expect(
    page
      .frameLocator('iframe.gjs-frame')
      .locator('p')
      .filter({ hasText: 'Action component' }),
  ).toHaveCount(1);
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(
    page
      .frameLocator('iframe.gjs-frame')
      .locator('p')
      .filter({ hasText: 'Action component' }),
  ).toHaveCount(2);
  await page.getByRole('button', { name: 'Redo' }).click();
  await expect(
    page
      .frameLocator('iframe.gjs-frame')
      .locator('p')
      .filter({ hasText: 'Action component' }),
  ).toHaveCount(1);
  await page.getByRole('button', { name: 'Save draft' }).click();
  await expect(page.getByText('Saved · v3')).toBeVisible({ timeout: 15_000 });
  await page.reload();
  await expect(
    page
      .frameLocator('iframe.gjs-frame')
      .locator('p')
      .filter({ hasText: 'Action component' }),
  ).toHaveCount(1);
});

test('shows a conflict when another draft is saved first', async ({ page }) => {
  const suffix = Date.now().toString();
  await login(page);
  await page.getByRole('button', { name: 'Sites', exact: true }).click();
  await page.getByLabel('Site name').fill(`Conflict Site ${suffix}`);
  await page.getByLabel('Slug').fill(`conflict-site-${suffix}`);
  await page.getByRole('button', { name: 'Create site' }).click();
  await expect(page.getByRole('status')).toContainText('Site created');

  await page.getByRole('button', { name: 'Landing Pages', exact: true }).click();
  await page.getByLabel('Page name').fill(`Conflict Page ${suffix}`);
  await page.getByLabel('Slug').fill(`conflict-page-${suffix}`);
  await page.getByRole('button', { name: 'Create page' }).click();
  await expect(page.getByRole('status')).toContainText('draft version 1 created');
  await page.getByRole('button', { name: 'Open Builder' }).click();
  await expect(page.locator('.gjs-editor')).toBeVisible({ timeout: 15_000 });

  await page.getByRole('button', { name: /^Section/ }).click();
  const pageId = page.url().match(/\/pages\/([^/]+)\/builder$/)?.[1];
  expect(pageId).toBeTruthy();
  const externalSave = await page.evaluate(async (id) => {
    const response = await fetch(`http://127.0.0.1:3001/api/v1/pages/${id}/versions`, {
      body: JSON.stringify({
        expectedVersionNumber: 1,
        payload: {
          version: 1,
          metadata: { documentTitle: 'External draft' },
          root: { id: 'root', type: 'root', props: {}, children: [] },
        },
      }),
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      method: 'POST',
    });
    return response.status;
  }, pageId);
  expect(externalSave).toBe(201);

  await page.getByRole('button', { name: 'Save draft' }).click();
  await expect(page.getByText('Conflict', { exact: true })).toBeVisible({
    timeout: 15_000,
  });
  await expect(page.getByRole('button', { name: 'Reload latest' })).toBeVisible();
});

test('keeps Layers, Canvas, Inspector and Minimap selection in sync', async ({
  page,
}) => {
  await openBuilder(page, 'Minimap Builder');

  await page.getByRole('button', { name: /^Section/ }).click();
  await page.getByRole('button', { name: /^Text/ }).click();
  const minimap = page.locator('aside.builder-minimap');
  await expect(minimap).toBeVisible();
  await expect(page.locator('[data-builder-layer-id]')).toHaveCount(3);
  await expect(minimap.locator('.builder-minimap-node')).toHaveCount(3);

  const textLayer = page.locator('[data-builder-layer-id]').filter({ hasText: 'Text' });
  await textLayer.click();
  await expect(page.locator('.builder-layer-button.selected')).toContainText('Text');
  await expect(minimap.locator('.builder-minimap-node.selected')).toHaveAttribute(
    'aria-label',
    /Text/,
  );
  await expect(
    page.locator('.builder-properties-panel .builder-panel-heading strong'),
  ).toHaveText('Text');
  const properties = page.locator('.builder-properties-panel');
  await expect(properties.getByText(/^Node:/)).toHaveCount(0);
  await expect(properties.locator('details')).toHaveCount(6);
  await properties.getByText('Advanced', { exact: true }).click();
  await expect(properties.locator('code')).toBeVisible();

  await minimap.locator('.builder-minimap-node-text').click();
  await expect(page.locator('.builder-layer-button.selected')).toContainText('Text');
  await page.frameLocator('iframe.gjs-frame').locator('p').click();
  await expect(minimap.locator('.builder-minimap-node.selected')).toHaveAttribute(
    'aria-label',
    /Text/,
  );

  await expect(minimap.locator('.builder-minimap-zoom-label')).toHaveText('100%');
  await page.getByRole('button', { name: 'Zoom out canvas' }).click();
  await expect(minimap.locator('.builder-minimap-zoom-label')).toHaveText('90%');
  await page.getByRole('button', { name: 'Zoom in canvas' }).click();
  await expect(minimap.locator('.builder-minimap-zoom-label')).toHaveText('100%');

  await page.locator('[data-builder-layer-id]').filter({ hasText: 'Section' }).click();
  await page.getByLabel('Min height').fill('1400px');
  const viewport = minimap.locator('.builder-minimap-viewport');
  const viewportBeforeScroll = await viewport.getAttribute('style');
  await page
    .frameLocator('iframe.gjs-frame')
    .locator('html')
    .evaluate((html) => {
      html.ownerDocument.defaultView?.scrollTo({ top: 800 });
    });
  await expect
    .poll(() => viewport.getAttribute('style'), { timeout: 5_000 })
    .not.toBe(viewportBeforeScroll);

  await page.getByRole('button', { name: 'Fit page in canvas' }).click();
});
