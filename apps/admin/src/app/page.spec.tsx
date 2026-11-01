import { endpoints, type Membership, type Role } from '@plp/contracts';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { apiError } from '../features/shell/test-utils';
import HomePage from './page';

class Redirected extends Error {}
const redirect = vi.fn((href: string) => {
  throw new Redirected(href);
});
vi.mock('next/navigation', () => ({ redirect: (href: string) => redirect(href) }));

let preferred: string | undefined;
vi.mock('next/headers', () => ({
  cookies: () =>
    Promise.resolve({ get: () => (preferred === undefined ? undefined : { value: preferred }) }),
}));

/** Sites per workspace; a workspace missing here was left since `/auth/me` was read. */
const sitesOf = new Map<string, Array<{ id: string }>>();
const memberships: Membership[] = [];
vi.mock('../lib/server-api', () => ({
  requireMe: () => Promise.resolve({ user: { id: 'u' }, memberships }),
  serverApi: (endpoint: unknown, [workspaceId]: [string]) => {
    const items = sitesOf.get(workspaceId);
    if (endpoint !== endpoints.listSites) {
      return Promise.reject(new Error('unexpected call'));
    }
    return items === undefined
      ? Promise.reject(apiError(404, 'not_found', 'Không tìm thấy workspace'))
      : Promise.resolve({ items });
  },
}));

function membership(id: string, role: Role): Membership {
  return { workspace: { id, name: id }, role, siteIds: null };
}

function given(...items: Membership[]) {
  memberships.splice(0, memberships.length, ...items);
}

async function landing(): Promise<string> {
  await expect(HomePage()).rejects.toBeInstanceOf(Redirected);
  return redirect.mock.lastCall?.[0] ?? '';
}

beforeEach(() => {
  preferred = undefined;
  sitesOf.clear();
});

describe('start page', () => {
  it('opens a site of another workspace for a first sign-in that cannot create one here', async () => {
    given(membership('a', 'editor'), membership('b', 'viewer'));
    sitesOf.set('a', []);
    sitesOf.set('b', [{ id: '64b0000000000000000000b1' }]);
    expect(await landing()).toBe('/sites/64b0000000000000000000b1');

    // Who may create a site starts one in the workspace they are in.
    given(membership('a', 'owner'), membership('b', 'viewer'));
    expect(await landing()).toBe('/sites/new');

    // Without a site anywhere, where they may create one; a workspace left meanwhile is skipped.
    sitesOf.set('b', []);
    given(membership('a', 'editor'), membership('gone', 'owner'), membership('b', 'owner'));
    expect(await landing()).toBe('/sites/new?workspace=b');
  });

  it('does not count a workspace the user left as chosen', async () => {
    given(membership('a', 'editor'), membership('b', 'viewer'));
    sitesOf.set('a', []);
    sitesOf.set('b', [{ id: '64b0000000000000000000b1' }]);
    preferred = 'gone';
    expect(await landing()).toBe('/sites/64b0000000000000000000b1');
  });

  it('stays in the workspace the user chose, even without a site there', async () => {
    given(membership('a', 'viewer'), membership('b', 'editor'));
    sitesOf.set('a', [{ id: '64b0000000000000000000a1' }]);
    sitesOf.set('b', []);
    preferred = 'b';
    expect(await landing()).toBe('/sites/new');
  });
});
