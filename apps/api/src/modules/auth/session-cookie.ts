import { SESSION_COOKIE } from '@plp/contracts';
import type { Request } from 'express';

/**
 * Every session token the browser sent. Usually one; two when a host-only cookie and one on the
 * workspace addresses' parent domain meet, after a deployment switched modes (ADR-025). Read from
 * the raw header: a parsed cookie map keeps only one of them.
 */
export function sessionTokensOf(request: Pick<Request, 'headers'>): string[] {
  const header = request.headers.cookie ?? '';
  const tokens: string[] = [];
  for (const part of header.split(';')) {
    const at = part.indexOf('=');
    if (at > 0 && part.slice(0, at).trim() === SESSION_COOKIE) {
      const value = part.slice(at + 1).trim();
      try {
        tokens.push(decodeURIComponent(value));
      } catch {
        // Not a token we issued; skip it like any other unknown value.
      }
    }
  }
  return tokens.filter((token) => token !== '');
}
