import { expect, request as playwrightRequest, test } from '@playwright/test';

test('API liveness is reachable', async ({ request }) => {
  const response = await request.get('http://127.0.0.1:3001/api/v1/health/live');
  expect(response.ok()).toBeTruthy();
  expect((await response.json()) as { status: string }).toMatchObject({ status: 'ok' });
});

test('management API requires authentication and supports session lifecycle', async ({
  request,
}) => {
  const workspaceResponse = await request.get(
    'http://127.0.0.1:3001/api/v1/workspaces/not-authorized',
  );
  expect(workspaceResponse.status()).toBe(401);

  const loginResponse = await request.post('http://127.0.0.1:3001/api/v1/auth/login', {
    data: {
      email: process.env.AUTH_EMAIL ?? 'admin@example.com',
      password: process.env.AUTH_PASSWORD ?? 'change-me-in-development',
    },
  });
  expect(loginResponse.status()).toBe(200);

  const meResponse = await request.get('http://127.0.0.1:3001/api/v1/auth/me');
  expect(meResponse.status()).toBe(200);
  expect(
    ((await meResponse.json()) as { workspace: { id: string } }).workspace.id,
  ).toMatch(/^[0-9a-f-]{36}$/);

  const logoutResponse = await request.post('http://127.0.0.1:3001/api/v1/auth/logout');
  expect(logoutResponse.status()).toBe(204);
  expect((await request.get('http://127.0.0.1:3001/api/v1/auth/me')).status()).toBe(401);
});

test('refresh tokens rotate once and stale tokens are rejected', async ({ request }) => {
  const baseUrl = 'http://127.0.0.1:3001/api/v1';
  const accessCookieName =
    process.env.AUTH_ACCESS_TOKEN_COOKIE_NAME ?? 'payload_access_token';
  const refreshCookieName =
    process.env.AUTH_REFRESH_TOKEN_COOKIE_NAME ?? 'payload_refresh_token';
  const credentials = {
    email: process.env.AUTH_EMAIL ?? 'admin@example.com',
    password: process.env.AUTH_PASSWORD ?? 'change-me-in-development',
  };

  const loginResponse = await request.post(`${baseUrl}/auth/login`, {
    data: credentials,
  });
  expect(loginResponse.status()).toBe(200);
  expect(loginResponse.headers()['set-cookie']).toContain('HttpOnly');
  const initialCookies = await request.storageState();
  const initialAccess = initialCookies.cookies.find(
    (cookie) => cookie.name === accessCookieName,
  )?.value;
  const initialRefresh = initialCookies.cookies.find(
    (cookie) => cookie.name === refreshCookieName,
  )?.value;
  expect(initialAccess?.split('.')).toHaveLength(3);
  expect(initialRefresh).toBeTruthy();
  expect((await loginResponse.json()) as Record<string, unknown>).not.toHaveProperty(
    'accessToken',
  );

  const refreshResponse = await request.post(`${baseUrl}/auth/refresh`);
  expect(refreshResponse.status()).toBe(200);
  const rotatedCookies = await request.storageState();
  const rotatedRefresh = rotatedCookies.cookies.find(
    (cookie) => cookie.name === refreshCookieName,
  )?.value;
  expect(rotatedRefresh).toBeTruthy();
  expect(rotatedRefresh).not.toBe(initialRefresh);
  expect((await request.get(`${baseUrl}/auth/me`)).status()).toBe(200);

  const staleRefreshResponse = await request.post(`${baseUrl}/auth/refresh`, {
    headers: {
      cookie: `${refreshCookieName}=${encodeURIComponent(initialRefresh ?? '')}`,
    },
  });
  expect(staleRefreshResponse.status()).toBe(401);
  expect(
    ((await staleRefreshResponse.json()) as { error: { code: string } }).error.code,
  ).toBe('REFRESH_TOKEN_INVALID');

  const logoutResponse = await request.post(`${baseUrl}/auth/logout`);
  expect(logoutResponse.status()).toBe(204);
  const revokedRefreshResponse = await request.post(`${baseUrl}/auth/refresh`, {
    headers: {
      cookie: `${refreshCookieName}=${encodeURIComponent(rotatedRefresh ?? '')}`,
    },
  });
  expect(revokedRefreshResponse.status()).toBe(401);
});

test('tenant RBAC exposes effective permissions and audits role changes', async ({
  request,
}) => {
  const baseUrl = 'http://127.0.0.1:3001/api/v1';
  const loginResponse = await request.post(`${baseUrl}/auth/login`, {
    data: {
      email: process.env.AUTH_EMAIL ?? 'admin@example.com',
      password: process.env.AUTH_PASSWORD ?? 'change-me-in-development',
    },
  });
  expect(loginResponse.status()).toBe(200);

  const me = (await request
    .get(`${baseUrl}/auth/me`)
    .then((response) => response.json())) as {
    workspace: { id: string };
  };
  const permissionsResponse = await request.get(
    `${baseUrl}/me/permissions?workspaceId=${me.workspace.id}`,
  );
  expect(permissionsResponse.status()).toBe(200);
  expect(
    ((await permissionsResponse.json()) as { permissions: string[] }).permissions,
  ).toContain('role.create');

  const rolesResponse = await request.get(`${baseUrl}/roles`);
  expect(rolesResponse.status()).toBe(200);
  expect(
    ((await rolesResponse.json()) as { items: Array<{ key: string }> }).items.map(
      (role) => role.key,
    ),
  ).toEqual(expect.arrayContaining(['owner', 'admin', 'editor', 'viewer']));

  const key = `rbac-e2e-${Date.now()}`;
  const createRoleResponse = await request.post(`${baseUrl}/roles`, {
    data: { key, name: 'RBAC E2E', permissions: ['page.read'] },
  });
  expect(createRoleResponse.status()).toBe(201);
  const createdRole = (await createRoleResponse.json()) as { id: string };

  const auditResponse = await request.get(`${baseUrl}/audit-logs?action=role.create`);
  expect(auditResponse.status()).toBe(200);
  expect(
    ((await auditResponse.json()) as { items: Array<{ action: string }> }).items.some(
      (entry) => entry.action === 'role.create',
    ),
  ).toBe(true);

  const deleteRoleResponse = await request.delete(`${baseUrl}/roles/${createdRole.id}`);
  expect([200, 204]).toContain(deleteRoleResponse.status());
});

test('tenant extensions are registry-backed, tenant-scoped and auditable', async ({
  request,
}) => {
  const baseUrl = 'http://127.0.0.1:3001/api/v1';
  const loginResponse = await request.post(`${baseUrl}/auth/login`, {
    data: {
      email: process.env.AUTH_EMAIL ?? 'admin@example.com',
      password: process.env.AUTH_PASSWORD ?? 'change-me-in-development',
    },
  });
  expect(loginResponse.status()).toBe(200);

  const extensionsResponse = await request.get(`${baseUrl}/extensions`);
  expect(extensionsResponse.status()).toBe(200);
  const extensions = (await extensionsResponse.json()) as {
    items: Array<{
      manifest: { id: string; capabilities: string[] };
      tenantEnabled: boolean;
    }>;
  };
  expect(extensions.items.map((item) => item.manifest.id)).toEqual(
    expect.arrayContaining(['demo-builder-countdown', 'demo-analytics', 'demo-webhook']),
  );

  const currentContext = (await (await request.get(`${baseUrl}/auth/me`)).json()) as {
    workspace: { organizationId: string; id: string };
  };
  const tenantSuffix = Date.now();
  const tenantBResponse = await request.post(`${baseUrl}/organizations`, {
    data: {
      name: `Extension Tenant B ${tenantSuffix}`,
      slug: `extension-tenant-b-${tenantSuffix}`,
    },
  });
  expect(tenantBResponse.status()).toBe(201);
  const tenantB = (await tenantBResponse.json()) as { id: string };
  const tenantBWorkspacesResponse = await request.get(
    `${baseUrl}/organizations/${tenantB.id}/workspaces`,
  );
  expect(tenantBWorkspacesResponse.status()).toBe(200);
  const tenantBWorkspaces = (await tenantBWorkspacesResponse.json()) as {
    items: Array<{ id: string }>;
  };
  expect(tenantBWorkspaces.items[0]).toBeTruthy();
  const switchToBResponse = await request.post(`${baseUrl}/auth/context`, {
    data: {
      organizationId: tenantB.id,
      workspaceId: tenantBWorkspaces.items[0]?.id,
    },
  });
  expect(switchToBResponse.status()).toBe(200);
  const tenantBExtensions = (await (
    await request.get(`${baseUrl}/extensions`)
  ).json()) as {
    items: Array<{ tenantEnabled: boolean; manifest: { id: string } }>;
  };
  expect(tenantBExtensions.items.every((item) => item.tenantEnabled === false)).toBe(
    true,
  );
  const switchToAResponse = await request.post(`${baseUrl}/auth/context`, {
    data: {
      organizationId: currentContext.workspace.organizationId,
      workspaceId: currentContext.workspace.id,
    },
  });
  expect(switchToAResponse.status()).toBe(200);

  const webhookEnableResponse = await request.post(
    `${baseUrl}/extensions/demo-webhook/enable`,
    {
      data: {
        configuration: { endpoint: `https://tenant-a-${tenantSuffix}.example/hook` },
      },
    },
  );
  expect(webhookEnableResponse.status()).toBe(201);
  const tenantAWebhook = (await webhookEnableResponse.json()) as {
    configuredFields: string[];
  };
  expect(tenantAWebhook.configuredFields).toContain('endpoint');
  const switchToBAfterConfigResponse = await request.post(`${baseUrl}/auth/context`, {
    data: {
      organizationId: tenantB.id,
      workspaceId: tenantBWorkspaces.items[0]?.id,
    },
  });
  expect(switchToBAfterConfigResponse.status()).toBe(200);
  const tenantBWebhook = (await (
    await request.get(`${baseUrl}/extensions/demo-webhook`)
  ).json()) as { tenantEnabled: boolean; configuredFields: string[] };
  expect(tenantBWebhook).toMatchObject({ tenantEnabled: false, configuredFields: [] });
  const switchToAAfterConfigResponse = await request.post(`${baseUrl}/auth/context`, {
    data: {
      organizationId: currentContext.workspace.organizationId,
      workspaceId: currentContext.workspace.id,
    },
  });
  expect(switchToAAfterConfigResponse.status()).toBe(200);
  await request.post(`${baseUrl}/extensions/demo-webhook/disable`);

  const readerRoleResponse = await request.post(`${baseUrl}/roles`, {
    data: {
      key: `extension-reader-${Date.now()}`,
      name: 'Extension Reader E2E',
      permissions: ['extensions.read'],
    },
  });
  expect(readerRoleResponse.status()).toBe(201);
  const readerRole = (await readerRoleResponse.json()) as { id: string };
  const readerEmail = `extension-reader-${Date.now()}@example.com`;
  const readerPassword = 'extension-reader-password';
  const readerUserResponse = await request.post(`${baseUrl}/users`, {
    data: {
      email: readerEmail,
      displayName: 'Extension Reader',
      password: readerPassword,
      roleId: readerRole.id,
      scope: 'tenant',
    },
  });
  expect(readerUserResponse.status()).toBe(201);
  const readerUser = (await readerUserResponse.json()) as { user: { id: string } };
  const readerRequest = await playwrightRequest.newContext();
  try {
    const readerLogin = await readerRequest.post(`${baseUrl}/auth/login`, {
      data: { email: readerEmail, password: readerPassword },
    });
    expect(readerLogin.status()).toBe(200);
    expect((await readerRequest.get(`${baseUrl}/extensions`)).status()).toBe(200);
    expect(
      (
        await readerRequest.post(`${baseUrl}/extensions/demo-builder-countdown/enable`, {
          data: { configuration: {} },
        })
      ).status(),
    ).toBe(403);
  } finally {
    await readerRequest.dispose();
    const assignmentsResponse = await request.get(
      `${baseUrl}/users/${readerUser.user.id}/role-assignments`,
    );
    if (assignmentsResponse.ok()) {
      const assignments = (await assignmentsResponse.json()) as {
        items: Array<{ id: string }>;
      };
      for (const assignment of assignments.items) {
        await request.delete(
          `${baseUrl}/users/${readerUser.user.id}/role-assignments/${assignment.id}`,
        );
      }
    }
    await request.delete(`${baseUrl}/users/${readerUser.user.id}`);
    await request.delete(`${baseUrl}/roles/${readerRole.id}`);
  }

  const enableResponse = await request.post(
    `${baseUrl}/extensions/demo-builder-countdown/enable`,
    { data: { configuration: {} } },
  );
  expect(enableResponse.status()).toBe(201);
  expect(
    ((await enableResponse.json()) as { tenantEnabled: boolean }).tenantEnabled,
  ).toBe(true);

  const configuredResponse = await request.get(
    `${baseUrl}/extensions/demo-builder-countdown`,
  );
  expect(configuredResponse.status()).toBe(200);
  const configured = (await configuredResponse.json()) as {
    tenantEnabled: boolean;
    health: string;
    manifest: { capabilities: string[] };
  };
  expect(configured).toMatchObject({ tenantEnabled: true, health: 'healthy' });
  expect(configured.manifest.capabilities).toContain('builder.element.countdown');

  const disableResponse = await request.post(
    `${baseUrl}/extensions/demo-builder-countdown/disable`,
  );
  expect(disableResponse.status()).toBe(201);
  expect(
    ((await disableResponse.json()) as { tenantEnabled: boolean }).tenantEnabled,
  ).toBe(false);

  const auditResponse = await request.get(
    `${baseUrl}/audit-logs?action=extension.enabled&resourceType=extension`,
  );
  expect(auditResponse.status()).toBe(200);
  expect(
    ((await auditResponse.json()) as { items: Array<{ resourceId?: string }> }).items,
  ).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ resourceId: 'demo-builder-countdown' }),
    ]),
  );
});

test('extension disable contract distinguishes draft-only and published page usage', async ({
  request,
}) => {
  const baseUrl = 'http://127.0.0.1:3001/api/v1';
  const loginResponse = await request.post(`${baseUrl}/auth/login`, {
    data: {
      email: process.env.AUTH_EMAIL ?? 'admin@example.com',
      password: process.env.AUTH_PASSWORD ?? 'change-me-in-development',
    },
  });
  expect(loginResponse.status()).toBe(200);
  const currentContext = (await (await request.get(`${baseUrl}/auth/me`)).json()) as {
    workspace: { organizationId: string; id: string };
  };
  const suffix = Date.now();
  const organizationResponse = await request.post(`${baseUrl}/organizations`, {
    data: { name: `Extension Contract ${suffix}`, slug: `extension-contract-${suffix}` },
  });
  expect(organizationResponse.status()).toBe(201);
  const organization = (await organizationResponse.json()) as { id: string };
  const workspacesResponse = await request.get(
    `${baseUrl}/organizations/${organization.id}/workspaces`,
  );
  expect(workspacesResponse.status()).toBe(200);
  const workspace = (
    (await workspacesResponse.json()) as { items: Array<{ id: string }> }
  ).items[0];
  expect(workspace).toBeTruthy();
  const switchResponse = await request.post(`${baseUrl}/auth/context`, {
    data: { organizationId: organization.id, workspaceId: workspace?.id },
  });
  expect(switchResponse.status()).toBe(200);

  const extensionId = 'demo-builder-countdown';
  const enableTenantResponse = await request.post(
    `${baseUrl}/extensions/${extensionId}/enable`,
    { data: {} },
  );
  expect(enableTenantResponse.status()).toBe(201);
  const siteResponse = await request.post(
    `${baseUrl}/workspaces/${workspace?.id}/sites`,
    {
      data: {
        name: `Extension Contract Site ${suffix}`,
        slug: `extension-contract-site-${suffix}`,
      },
    },
  );
  expect(siteResponse.status()).toBe(201);
  const site = (await siteResponse.json()) as { id: string };
  const payload = {
    version: 3,
    metadata: { documentTitle: 'Extension contract page' },
    root: {
      id: 'root',
      type: 'root',
      props: {},
      children: [
        {
          id: 'section',
          type: 'section',
          props: {},
          children: [
            {
              id: 'countdown',
              type: 'countdown',
              props: { label: 'Launch', targetAt: '2030-01-01T00:00:00.000Z' },
              children: [],
            },
          ],
        },
      ],
    },
  };
  const pageResponse = await request.post(`${baseUrl}/sites/${site.id}/pages`, {
    data: {
      name: `Extension Contract Page ${suffix}`,
      slug: `extension-contract-page-${suffix}`,
      payload,
    },
  });
  expect(pageResponse.status()).toBe(201);
  const page = (await pageResponse.json()) as { id: string };

  try {
    const draftDisableResponse = await request.post(
      `${baseUrl}/extensions/${extensionId}/disable`,
    );
    expect(draftDisableResponse.status()).toBe(201);

    expect(
      (
        await request.post(`${baseUrl}/extensions/${extensionId}/enable`, { data: {} })
      ).status(),
    ).toBe(201);
    const attachResponse = await request.put(
      `${baseUrl}/pages/${page.id}/extensions/${extensionId}`,
      { data: { enabled: true } },
    );
    expect(attachResponse.status()).toBe(200);
    const publishResponse = await request.post(`${baseUrl}/pages/${page.id}/publish`, {
      data: {},
    });
    expect(publishResponse.status()).toBe(201);

    const publishedDisableResponse = await request.post(
      `${baseUrl}/extensions/${extensionId}/disable`,
    );
    expect(publishedDisableResponse.status()).toBe(409);
    expect(
      ((await publishedDisableResponse.json()) as { error: { code: string } }).error.code,
    ).toBe('EXTENSION_PUBLISHED_DEPENDENCY');
  } finally {
    await request.post(`${baseUrl}/pages/${page.id}/unpublish`);
    await request.delete(`${baseUrl}/pages/${page.id}`);
    await request.post(`${baseUrl}/extensions/${extensionId}/disable`);
    await request.post(`${baseUrl}/auth/context`, {
      data: {
        organizationId: currentContext.workspace.organizationId,
        workspaceId: currentContext.workspace.id,
      },
    });
  }
});

test('tenant user management enforces lifecycle, session revocation and safe access data', async ({
  request,
}) => {
  const baseUrl = 'http://127.0.0.1:3001/api/v1';
  const ownerLogin = await request.post(`${baseUrl}/auth/login`, {
    data: {
      email: process.env.AUTH_EMAIL ?? 'admin@example.com',
      password: process.env.AUTH_PASSWORD ?? 'change-me-in-development',
    },
  });
  expect(ownerLogin.status()).toBe(200);

  const roles = (await (await request.get(`${baseUrl}/roles`)).json()) as {
    items: Array<{ id: string; key: string }>;
  };
  const viewerRole = roles.items.find((role) => role.key === 'viewer');
  expect(viewerRole).toBeTruthy();
  const workspace = (await (await request.get(`${baseUrl}/auth/me`)).json()) as {
    workspace: { id: string };
  };
  const email = `user-management-${Date.now()}@example.com`;
  const password = 'user-management-password';

  const createResponse = await request.post(`${baseUrl}/users`, {
    data: {
      email,
      displayName: 'Lifecycle User',
      password,
      roleId: viewerRole?.id,
      scope: 'workspace',
      workspaceId: workspace.workspace.id,
    },
  });
  expect(createResponse.status()).toBe(201);
  const created = (await createResponse.json()) as { user: { id: string } };
  expect(created.user.id).toMatch(/^[0-9a-f-]{36}$/);

  const duplicateResponse = await request.post(`${baseUrl}/users`, {
    data: { email: email.toUpperCase(), password },
  });
  expect(duplicateResponse.status()).toBe(409);

  const listResponse = await request.get(
    `${baseUrl}/users?search=${encodeURIComponent(email)}`,
  );
  expect(listResponse.status()).toBe(200);
  expect(
    ((await listResponse.json()) as { items: Array<{ email: string }> }).items,
  ).toEqual(expect.arrayContaining([expect.objectContaining({ email })]));

  const detailResponse = await request.get(`${baseUrl}/users/${created.user.id}`);
  expect(detailResponse.status()).toBe(200);
  const detailBody = (await detailResponse.json()) as Record<string, unknown>;
  expect(detailBody).not.toHaveProperty('passwordHash');
  expect(JSON.stringify(detailBody)).not.toContain(password);

  const userRequest = await playwrightRequest.newContext();
  try {
    const userLogin = await userRequest.post(`${baseUrl}/auth/login`, {
      data: { email, password },
    });
    expect(userLogin.status()).toBe(200);
    expect((await userRequest.get(`${baseUrl}/auth/me`)).status()).toBe(200);

    const disableResponse = await request.post(
      `${baseUrl}/users/${created.user.id}/disable`,
    );
    expect(disableResponse.status()).toBe(201);
    expect((await userRequest.get(`${baseUrl}/auth/me`)).status()).toBe(401);

    const disabledLogin = await userRequest.post(`${baseUrl}/auth/login`, {
      data: { email, password },
    });
    expect(disabledLogin.status()).toBe(401);

    const enableResponse = await request.post(
      `${baseUrl}/users/${created.user.id}/enable`,
    );
    expect(enableResponse.status()).toBe(201);
    expect(
      (
        await userRequest.post(`${baseUrl}/auth/login`, { data: { email, password } })
      ).status(),
    ).toBe(200);
  } finally {
    await userRequest.dispose();
  }

  const ownerList = (await (await request.get(`${baseUrl}/users`)).json()) as {
    items: Array<{ id: string; email: string }>;
  };
  const owner = ownerList.items.find(
    (user) =>
      user.email === (process.env.AUTH_EMAIL ?? 'admin@example.com').toLowerCase(),
  );
  expect(owner).toBeTruthy();
  const lastOwnerDisable = await request.post(`${baseUrl}/users/${owner?.id}/disable`);
  expect(lastOwnerDisable.status()).toBe(403);

  const auditResponse = await request.get(
    `${baseUrl}/audit-logs?resourceType=tenant_user`,
  );
  expect(auditResponse.status()).toBe(200);
  expect(
    ((await auditResponse.json()) as { items: Array<{ action: string }> }).items.map(
      (entry) => entry.action,
    ),
  ).toEqual(expect.arrayContaining(['user.create', 'user.disable', 'user.enable']));

  const removeResponse = await request.delete(`${baseUrl}/users/${created.user.id}`);
  expect(removeResponse.status()).toBe(204);
});
