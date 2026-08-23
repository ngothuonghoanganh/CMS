import { expect, test } from '@playwright/test';

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
