import { describe, expect, it } from 'vitest';
import {
  compareMembers,
  foreignSites,
  hashInvitationToken,
  invitationExpiry,
  invitationLimitKeys,
  mailboxOf,
  invitationState,
  newInvitationToken,
  purgeAfter,
} from './member-rules.js';

const NOW = new Date('2026-11-01T03:00:00.000Z');

describe('invitation links', () => {
  it('keeps only the hash of a random token', () => {
    const { token, tokenHash } = newInvitationToken();
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(tokenHash).toBe(hashInvitationToken(token));
    expect(tokenHash).not.toContain(token);
    expect(newInvitationToken().token).not.toBe(token);
  });

  it('works 7 days, and records are deleted 30 days after they close', () => {
    expect(invitationExpiry(NOW).toISOString()).toBe('2026-11-08T03:00:00.000Z');
    expect(purgeAfter(NOW).toISOString()).toBe('2026-12-01T03:00:00.000Z');
  });

  it('is expired once a pending invitation passes its expiry', () => {
    const pending = { status: 'pending' as const, expiresAt: invitationExpiry(NOW) };
    expect(invitationState(pending, NOW)).toBe('pending');
    expect(invitationState(pending, pending.expiresAt)).toBe('expired');
    expect(invitationState({ ...pending, status: 'accepted' }, pending.expiresAt)).toBe('accepted');
  });

  it('counts emails per workspace and per hashed address', () => {
    const keys = invitationLimitKeys('Thuy.MKT@smilecare.vn', {
      toHexString: () => '64b0000000000000000000a1',
    });
    expect(keys.workspace).toBe('member-invite:workspace:64b0000000000000000000a1');
    expect(keys.address).toMatch(/^member-invite:address:[0-9a-f]{64}$/);
    expect(keys.address).not.toContain('smilecare');
    expect(invitationLimitKeys('thuy.mkt@smilecare.vn', { toHexString: () => 'x' }).address).toBe(
      keys.address,
    );
  });

  it('counts every variant of one mailbox as that mailbox', () => {
    expect(mailboxOf(' Thuy+moi1@SmileCare.vn ')).toBe('thuy@smilecare.vn');
    expect(mailboxOf('thuy.mkt+a@smilecare.vn')).toBe('thuy.mkt@smilecare.vn');
    expect(mailboxOf('T.h.u.y+x@googlemail.com')).toBe('thuy@gmail.com');
    expect(invitationLimitKeys('thuy+1@gmail.com', { toHexString: () => 'x' }).address).toBe(
      invitationLimitKeys('t.huy@gmail.com', { toHexString: () => 'x' }).address,
    );
  });
});

describe('grants', () => {
  it('names the sites that are not the workspace’s', () => {
    expect(foreignSites(null, [])).toEqual([]);
    expect(foreignSites(['a', 'b'], ['a', 'c'])).toEqual(['b']);
  });

  it('lists the most powerful roles first, then by name', () => {
    const members = [
      { role: 'viewer' as const, name: 'An' },
      { role: 'editor' as const, name: 'Yến' },
      { role: 'owner' as const, name: 'Ngọc Anh' },
      { role: 'editor' as const, name: 'Khoa' },
    ];
    expect(members.sort(compareMembers).map((member) => member.name)).toEqual([
      'Ngọc Anh',
      'Khoa',
      'Yến',
      'An',
    ]);
  });
});
