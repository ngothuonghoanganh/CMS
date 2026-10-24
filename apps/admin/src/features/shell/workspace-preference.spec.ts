import type { Membership } from '@plp/contracts';
import { describe, expect, it } from 'vitest';
import { pickMembership, workspacePreferenceCookie } from './workspace-preference';

const agency: Membership = {
  workspace: { id: '64b0000000000000000000a1', name: 'Mây Xanh Agency' },
  role: 'owner',
};
const client: Membership = {
  workspace: { id: '64b0000000000000000000a2', name: 'Smile Care' },
  role: 'editor',
};

describe('pickMembership', () => {
  it('uses the preferred workspace while the user is a member', () => {
    expect(pickMembership([agency, client], client.workspace.id)).toBe(client);
  });

  it('falls back to the first membership for an unknown or missing preference', () => {
    expect(pickMembership([agency, client], '64b0000000000000000000ff')).toBe(agency);
    expect(pickMembership([agency, client], undefined)).toBe(agency);
  });

  it('returns null without memberships', () => {
    expect(pickMembership([], agency.workspace.id)).toBeNull();
  });
});

describe('workspacePreferenceCookie', () => {
  it('stores a valid workspace id for the whole admin', () => {
    expect(workspacePreferenceCookie(agency.workspace.id)).toBe(
      'plp_ws=64b0000000000000000000a1; Path=/; Max-Age=31536000; SameSite=Lax',
    );
  });

  it('refuses anything that is not a workspace id', () => {
    expect(() => workspacePreferenceCookie('x; Domain=evil.example')).toThrow();
  });
});
