import { endpoints, type Membership, type Role } from '@plp/contracts';
import { screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AdminAddress } from '../features/shell/admin-address';
import { apiError, renderWithProviders } from '../features/shell/test-utils';
import HomePage, { generateMetadata } from './page';

class Redirected extends Error {}
const redirect = vi.fn((href: string) => {
  throw new Redirected(href);
});
vi.mock('next/navigation', () => ({
  redirect: (href: string) => redirect(href),
  // The picker and screen 36 sign out with the router of the admin.
  useRouter: () => ({ replace: vi.fn(), push: vi.fn(), refresh: vi.fn() }),
}));

let preferred: string | undefined;
vi.mock('next/headers', () => ({
  cookies: () =>
    Promise.resolve({ get: () => (preferred === undefined ? undefined : { value: preferred }) }),
}));

let address: AdminAddress = { kind: 'single' };
vi.mock('../features/shell/current-address', () => ({
  currentAddress: () => Promise.resolve(address),
}));

const addresses = {
  template: 'https://{slug}.app.example.vn',
  commonOrigin: 'https://app.example.vn',
};

/** Sites per workspace; a workspace missing here was left since `/auth/me` was read. */
const sitesOf = new Map<string, Array<{ id: string }>>();
const memberships: Membership[] = [];
vi.mock('../lib/server-api', () => ({
  requireMe: () =>
    Promise.resolve({
      user: { id: 'u', name: 'Minh Khoa', email: 'khoa@mayxanh.vn' },
      memberships,
    }),
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
  return { workspace: { id, name: id, slug: `ws-${id.slice(-6)}` }, role, siteIds: null };
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
  address = { kind: 'single' };
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

  describe('with workspace addresses (ADR-025)', () => {
    it('opens the only workspace at its address from the common one', async () => {
      address = { kind: 'common', addresses };
      given(membership('64b0000000000000000000a1', 'viewer'));
      expect(await landing()).toBe('https://ws-0000a1.app.example.vn/');
    });

    it('lets a user of several workspaces pick one at the common address (screen 35)', async () => {
      address = { kind: 'common', addresses };
      given(
        membership('64b0000000000000000000a1', 'owner'),
        membership('64b0000000000000000000b2', 'editor'),
      );
      renderWithProviders(await HomePage());

      expect(screen.getByRole('heading', { name: 'Chọn workspace' })).toBeInTheDocument();
      expect(screen.getByRole('link', { name: 'Mở 64b0000000000000000000a1' })).toHaveAttribute(
        'href',
        'https://ws-0000a1.app.example.vn/',
      );
      expect(screen.getByRole('link', { name: 'Mở 64b0000000000000000000b2' })).toHaveAttribute(
        'href',
        'https://ws-0000b2.app.example.vn/',
      );
      expect(screen.getByText('ws-0000b2.app.example.vn')).toBeInTheDocument();
      // Who may open what, as the board says it.
      expect(screen.getByText('Chủ sở hữu · toàn workspace')).toBeInTheDocument();
      expect(screen.getByText('Biên tập · toàn workspace')).toBeInTheDocument();
      // The header names the common address and who is signed in, with a way out (board 35).
      expect(screen.getByText('app.example.vn')).toBeInTheDocument();
      expect(screen.getByRole('banner')).toHaveTextContent('khoa@mayxanh.vn');
      expect(screen.getByRole('button', { name: 'Đăng xuất' })).toBeInTheDocument();
    });

    it('says when the account belongs to no workspace', async () => {
      address = { kind: 'common', addresses };
      given();
      renderWithProviders(await HomePage());
      expect(
        screen.getByRole('heading', { name: 'Tài khoản này chưa thuộc workspace nào' }),
      ).toBeInTheDocument();
      // One in the header, one in the card (board 35).
      expect(screen.getAllByRole('button', { name: 'Đăng xuất' })).toHaveLength(2);
    });

    it('opens the workspace of its address, even without a site to show', async () => {
      address = { kind: 'workspace', slug: 'ws-0000b2', addresses };
      given(
        membership('64b0000000000000000000a1', 'owner'),
        membership('64b0000000000000000000b2', 'viewer'),
      );
      sitesOf.set('64b0000000000000000000a1', [{ id: '64b0000000000000000000a9' }]);
      sitesOf.set('64b0000000000000000000b2', [{ id: '64b0000000000000000000b9' }]);
      expect(await landing()).toBe('/sites/64b0000000000000000000b9');

      // Never another workspace's site, and the preference does not count here.
      sitesOf.set('64b0000000000000000000b2', []);
      preferred = '64b0000000000000000000a1';
      expect(await landing()).toBe('/sites/new?workspace=64b0000000000000000000b2');
    });

    it('tells a non-member nothing about the workspace at the address (screen 36)', async () => {
      address = { kind: 'workspace', slug: 'smile', addresses };
      given(membership('64b0000000000000000000a1', 'owner'));
      renderWithProviders(await HomePage());

      expect(
        screen.getByRole('heading', { name: 'Tài khoản này không thuộc workspace ở địa chỉ này' }),
      ).toBeInTheDocument();
      expect(screen.getByText('smile.app.example.vn')).toBeInTheDocument();
      expect(screen.getByText('khoa@mayxanh.vn')).toBeInTheDocument();
      expect(screen.getByRole('link', { name: 'Mở workspace của tôi' })).toHaveAttribute(
        'href',
        'https://app.example.vn/',
      );
      expect(
        screen.getByRole('button', { name: 'Đăng nhập bằng tài khoản khác' }),
      ).toBeInTheDocument();
    });

    it('names screens 35 and 36 for what they say', async () => {
      address = { kind: 'common', addresses };
      given(
        membership('64b0000000000000000000a1', 'owner'),
        membership('64b0000000000000000000b2', 'editor'),
      );
      expect(await generateMetadata()).toEqual({ title: 'Chọn workspace' });

      address = { kind: 'workspace', slug: 'smile', addresses };
      expect(await generateMetadata()).toEqual({ title: 'Không thuộc workspace ở địa chỉ này' });

      address = { kind: 'workspace', slug: 'ws-0000a1', addresses };
      expect(await generateMetadata()).toEqual({});
    });
  });
});
