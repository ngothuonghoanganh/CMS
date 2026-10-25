import {
  REVALIDATE_SIGNATURE_HEADER,
  REVALIDATE_TIMESTAMP_HEADER,
  revalidateRequestSchema,
} from '@plp/contracts';
import { revalidateTag } from 'next/cache';
import { rendererEnv } from '../../../env';
import { readBodyWithin } from '../../../lib/request-body';
import { verifyRevalidateSignature } from '../../../lib/revalidate-signature';

/** At most 20 tags of 256 characters; anything far larger is not a real webhook. */
const MAX_BODY_BYTES = 16 * 1024;

function parseJson(text: string): { ok: true; value: unknown } | { ok: false } {
  try {
    return { ok: true, value: JSON.parse(text) as unknown };
  } catch {
    // Not JSON: answered below as 400, like any other malformed body.
    return { ok: false };
  }
}

/**
 * Called by the API after every pointer move (publish, rollback, undo, unpublish), signed with
 * HMAC-SHA256 (ADR-009). `{ expire: 0 }` drops the cached entries, so the very next visitor gets
 * the new release instead of a stale one.
 */
export async function POST(request: Request): Promise<Response> {
  const rawBody = await readBodyWithin(request, MAX_BODY_BYTES);
  if (rawBody === null) {
    return Response.json({ error: 'payload_too_large' }, { status: 413 });
  }
  const verdict = verifyRevalidateSignature({
    secret: rendererEnv().REVALIDATE_SECRET,
    timestamp: request.headers.get(REVALIDATE_TIMESTAMP_HEADER),
    signature: request.headers.get(REVALIDATE_SIGNATURE_HEADER),
    rawBody,
    nowSeconds: Math.floor(Date.now() / 1000),
  });
  if (!verdict.ok) {
    return Response.json({ error: 'unauthorized', reason: verdict.reason }, { status: 401 });
  }
  const json = parseJson(rawBody);
  const body = json.ok ? revalidateRequestSchema.safeParse(json.value) : null;
  if (body === null || !body.success) {
    return Response.json({ error: 'invalid_body' }, { status: 400 });
  }
  for (const tag of body.data.tags) {
    revalidateTag(tag, { expire: 0 });
  }
  return Response.json({ revalidated: body.data.tags });
}
