import {
  ensureCanonicalEnvironment,
  test,
  expect,
} from './fixtures/canonical-environment';

test('canonical environment setup is idempotent and preserves resource identity', async ({
  request,
  canonicalEnvironment,
}) => {
  const repeated = await ensureCanonicalEnvironment(request);
  expect(repeated.organizationId).toBe(canonicalEnvironment.organizationId);
  expect(repeated.workspaceId).toBe(canonicalEnvironment.workspaceId);
  expect(repeated.siteId).toBe(canonicalEnvironment.siteId);
  expect(repeated.pageId).toBe(canonicalEnvironment.pageId);
});
