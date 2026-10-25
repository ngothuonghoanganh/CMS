import { Injectable } from '@nestjs/common';
import { idSchema, PREVIEW_TTL_SECONDS } from '@plp/contracts';
import { errors, jwtVerify, SignJWT } from 'jose';
import { z } from 'zod';
import type { Env } from '../../config/env.js';
import { InjectEnv } from '../../shared/env.js';

/** Key id in the token header; rotating `PREVIEW_SECRET` means a new id (ADR-010). */
export const PREVIEW_KEY_ID = 'v1';
const ALGORITHM = 'HS256';

const siteClaims = {
  siteId: idSchema,
  workspaceId: idSchema,
  /** Immutable (ADR-011); lets public delivery load the site without a user. */
  subdomain: z.string().min(1),
};

export const previewClaimsSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('draft'), pageId: idSchema, ...siteClaims }),
  z.object({ kind: z.literal('release'), releaseId: idSchema, ...siteClaims }),
]);
export type PreviewClaims = z.infer<typeof previewClaimsSchema>;

/** A verified token: its claims and when it stops working. */
export type VerifiedPreview = PreviewClaims & { expiresAt: Date };

/**
 * Signed preview links (ADR-010): a JWS HS256 with a key id and an expiry. The token is the only
 * credential a previewer has, so verification is strict: algorithm, key id, expiry and claims.
 */
@Injectable()
export class PreviewTokens {
  private readonly key: Uint8Array;

  constructor(@InjectEnv() env: Pick<Env, 'PREVIEW_SECRET'>) {
    this.key = new TextEncoder().encode(env.PREVIEW_SECRET);
  }

  async sign(
    claims: PreviewClaims,
    now: Date = new Date(),
  ): Promise<{ token: string; expiresAt: Date }> {
    const expiresAtSeconds = Math.floor(now.getTime() / 1000) + PREVIEW_TTL_SECONDS;
    const token = await new SignJWT({ ...claims })
      .setProtectedHeader({ alg: ALGORITHM, kid: PREVIEW_KEY_ID })
      .setIssuedAt(Math.floor(now.getTime() / 1000))
      .setExpirationTime(expiresAtSeconds)
      .sign(this.key);
    return { token, expiresAt: new Date(expiresAtSeconds * 1000) };
  }

  /**
   * The claims of a valid token, or null for any token that is not one (bad signature, other key
   * id or algorithm, expired, malformed claims). Public delivery answers null with 404.
   */
  async verify(token: string): Promise<VerifiedPreview | null> {
    try {
      const { payload, protectedHeader } = await jwtVerify(token, this.key, {
        algorithms: [ALGORITHM],
        requiredClaims: ['exp'],
      });
      if (protectedHeader.kid !== PREVIEW_KEY_ID || payload.exp === undefined) {
        return null;
      }
      const claims = previewClaimsSchema.safeParse(payload);
      return claims.success ? { ...claims.data, expiresAt: new Date(payload.exp * 1000) } : null;
    } catch (error) {
      if (error instanceof errors.JOSEError) {
        return null;
      }
      throw error;
    }
  }
}
