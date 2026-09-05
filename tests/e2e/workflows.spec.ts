import { expect } from '@playwright/test';
import {
  canonicalEnvironmentNames,
  createTemporaryPage,
  loginToCanonicalBuilder,
  switchCanonicalBrowserContext,
  test,
} from './fixtures/canonical-environment';

const email = process.env.AUTH_EMAIL ?? 'admin@example.com';
const password = process.env.AUTH_PASSWORD ?? 'change-me-in-development';

test('creates, publishes, enables and executes a manual workflow exactly once', async ({
  request,
}) => {
  const baseUrl = 'http://127.0.0.1:3001/api/v1';
  const login = await request.post(`${baseUrl}/auth/login`, {
    data: {
      email: process.env.AUTH_EMAIL ?? 'admin@example.com',
      password: process.env.AUTH_PASSWORD ?? 'change-me-in-development',
    },
  });
  expect(login.status()).toBe(200);

  const workflow = await request.post(`${baseUrl}/workflows`, {
    data: {
      name: `Manual workflow ${Date.now()}`,
      scope: 'workspace',
      definition: {
        trigger: { type: 'manual', config: {} },
        nodes: [
          { id: 'trigger', type: 'manual', category: 'trigger', config: {} },
          {
            id: 'create-lead',
            type: 'lead.create',
            category: 'action',
            config: {
              email: { kind: 'binding', path: 'trigger.email' },
              source: { kind: 'literal', value: 'workflow-test' },
            },
          },
        ],
        edges: [
          { id: 'edge-1', source: 'trigger', target: 'create-lead', branch: 'always' },
        ],
      },
    },
  });
  expect(workflow.status()).toBe(201);
  const created = (await workflow.json()) as { id: string };

  expect(
    (await request.post(`${baseUrl}/workflows/${created.id}/publish`)).status(),
  ).toBe(201);
  expect((await request.post(`${baseUrl}/workflows/${created.id}/enable`)).status()).toBe(
    201,
  );

  const run = await request.post(`${baseUrl}/workflows/${created.id}/run`, {
    data: { email: 'workflow@example.com' },
  });
  expect(run.status()).toBe(201);
  const execution = (await run.json()) as { id: string };

  await expect
    .poll(
      async () => {
        const response = await request.get(
          `${baseUrl}/workflow-executions/${execution.id}`,
        );
        return ((await response.json()) as { execution: { status: string } }).execution
          .status;
      },
      { timeout: 10_000 },
    )
    .toBe('completed');

  const detail = await request.get(`${baseUrl}/workflow-executions/${execution.id}`);
  expect(detail.status()).toBe(200);
  expect(
    (
      (await detail.json()) as { steps: Array<{ nodeId: string; status: string }> }
    ).steps.some((step) => step.nodeId === 'create-lead' && step.status === 'success'),
  ).toBe(true);
});

test('renders the workflow builder without horizontal overflow across viewports', async ({
  page,
}) => {
  await page.goto('http://127.0.0.1:3000/');
  await expect(page).toHaveURL(/\/login$/);
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('heading', { name: 'Good morning' })).toBeVisible();
  await page.getByRole('button', { name: 'Workflows', exact: true }).click();
  await expect(
    page.getByRole('heading', { level: 1, name: 'Workflows', exact: true }),
  ).toBeVisible();
  await expect(page.getByText('Node palette', { exact: true })).toBeVisible();
  await expect(page.getByText('Triggers', { exact: true })).toBeVisible();

  for (const width of [1440, 1024, 768, 390]) {
    await page.setViewportSize({ width, height: 900 });
    expect(
      await page.locator('body').evaluate((element) => element.scrollWidth),
    ).toBeLessThanOrEqual(width);
  }
});

test('attaches a page workflow and configures trigger, condition and action nodes', async ({
  page,
  request,
  canonicalEnvironment,
}) => {
  const suffix = Date.now().toString();
  const temporaryPage = await createTemporaryPage(
    request,
    canonicalEnvironment,
    'phase-workflows',
  );
  await loginToCanonicalBuilder(page);
  await switchCanonicalBrowserContext(page, canonicalEnvironment);
  await page.getByRole('button', { name: 'Pages', exact: true }).click();
  await page
    .getByLabel('Site')
    .selectOption({ label: canonicalEnvironmentNames.siteName });
  await page.getByRole('button', { name: /__e2e__ phase-workflows/ }).click();
  await page.getByRole('button', { name: 'Manage workflows' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Workflows' })).toBeVisible();

  await page.getByLabel('Workflow name').fill(`Page lead capture ${suffix}`);
  await page.getByRole('button', { name: 'New workflow' }).click();
  await expect(
    page.getByRole('heading', { level: 2, name: `Page lead capture ${suffix}` }),
  ).toBeVisible();
  await page.getByRole('button', { name: /Form Submitted/ }).click();
  await page.getByRole('button', { name: /Equals/ }).click();
  await page.getByLabel('Node configuration').fill(
    JSON.stringify(
      {
        expression: {
          operator: 'exists',
          left: { kind: 'binding', path: 'trigger.email' },
        },
      },
      null,
      2,
    ),
  );
  await page.getByRole('button', { name: 'Apply node config' }).click();
  await page.getByRole('button', { name: /Create Lead/ }).click();
  await page
    .getByLabel('Node configuration')
    .fill(JSON.stringify({ email: { kind: 'binding', path: 'trigger.email' } }, null, 2));
  await page.getByRole('button', { name: 'Apply node config' }).click();
  await page.getByRole('button', { name: 'Save draft' }).click();
  await expect(page.getByText('Draft saved.', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Publish', exact: true }).click();
  await expect(page.getByText('Workflow published.', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Enable' }).click();
  await expect(page.getByText('Workflow enabled.', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Pages', exact: true }).click();
  await page.getByRole('button', { name: /__e2e__ phase-workflows/ }).click();
  await page.getByRole('button', { name: 'Publish draft' }).click();
  await page.getByRole('button', { name: 'Publish version' }).click();
  await expect(
    page.getByRole('status').filter({ hasText: 'Page published' }),
  ).toBeVisible();
});
