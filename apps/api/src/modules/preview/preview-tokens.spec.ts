import { PREVIEW_TTL_SECONDS } from '@plp/contracts';
import { SignJWT } from 'jose';
import { describe, expect, it } from 'vitest';
import { PREVIEW_KEY_ID, type PreviewClaims, PreviewTokens } from './preview-tokens.js';

const SECRET = 'test-preview-secret-0123456789abcdef';
const tokens = new PreviewTokens({ PREVIEW_SECRET: SECRET });

const draft: PreviewClaims = {
  kind: 'draft',
  pageId: 'aaaaaaaaaaaaaaaaaaaaaaaa',
  siteId: 'bbbbbbbbbbbbbbbbbbbbbbbb',
  workspaceId: 'cccccccccccccccccccccccc',
  subdomain: 'smilecare',
};

function key(secret = SECRET): Uint8Array {
  return new TextEncoder().encode(secret);
}

describe('PreviewTokens', () => {
  it('signs draft and release claims that verify with their expiry', async () => {
    const now = new Date('2026-10-24T10:00:00.000Z');
    const signed = await tokens.sign(draft, now);
    expect(signed.expiresAt.getTime()).toBe(now.getTime() + PREVIEW_TTL_SECONDS * 1000);
    // The fixed `now` is in the past relative to the real clock only if the TTL elapsed; sign
    // with the current time to verify.
    const fresh = await tokens.sign(draft);
    expect(await tokens.verify(fresh.token)).toEqual({ ...draft, expiresAt: fresh.expiresAt });

    const release: PreviewClaims = {
      kind: 'release',
      releaseId: 'dddddddddddddddddddddddd',
      siteId: draft.siteId,
      workspaceId: draft.workspaceId,
      subdomain: draft.subdomain,
    };
    const signedRelease = await tokens.sign(release);
    expect(await tokens.verify(signedRelease.token)).toMatchObject(release);
  });

  it('puts HS256 and the key id in the protected header', async () => {
    const { token } = await tokens.sign(draft);
    const [header] = token.split('.');
    expect(JSON.parse(Buffer.from(header ?? '', 'base64url').toString('utf8'))).toEqual({
      alg: 'HS256',
      kid: PREVIEW_KEY_ID,
    });
  });

  it('rejects an expired token', async () => {
    const past = new Date(Date.now() - (PREVIEW_TTL_SECONDS + 60) * 1000);
    const { token } = await tokens.sign(draft, past);
    expect(await tokens.verify(token)).toBeNull();
  });

  it('rejects a tampered token and a token signed with another secret', async () => {
    const { token } = await tokens.sign(draft);
    const [header, payload, signature] = token.split('.');
    const forged = Buffer.from(
      JSON.stringify({ ...draft, pageId: 'eeeeeeeeeeeeeeeeeeeeeeee', exp: 4_102_444_800 }),
    ).toString('base64url');
    expect(await tokens.verify(`${header}.${forged}.${signature}`)).toBeNull();
    expect(await tokens.verify(`${header}.${payload}.${signature}x`)).toBeNull();
    const other = await new PreviewTokens({ PREVIEW_SECRET: `${SECRET}-other` }).sign(draft);
    expect(await tokens.verify(other.token)).toBeNull();
    expect(await tokens.verify('not-a-token')).toBeNull();
  });

  it('rejects another key id, a token without expiry and malformed claims', async () => {
    const exp = Math.floor(Date.now() / 1000) + 600;
    const otherKid = await new SignJWT({ ...draft })
      .setProtectedHeader({ alg: 'HS256', kid: 'v0' })
      .setExpirationTime(exp)
      .sign(key());
    expect(await tokens.verify(otherKid)).toBeNull();
    const noExp = await new SignJWT({ ...draft })
      .setProtectedHeader({ alg: 'HS256', kid: PREVIEW_KEY_ID })
      .sign(key());
    expect(await tokens.verify(noExp)).toBeNull();
    const badClaims = await new SignJWT({ kind: 'draft', pageId: 'nope' })
      .setProtectedHeader({ alg: 'HS256', kid: PREVIEW_KEY_ID })
      .setExpirationTime(exp)
      .sign(key());
    expect(await tokens.verify(badClaims)).toBeNull();
  });
});
