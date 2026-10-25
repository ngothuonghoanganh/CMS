/**
 * The body as text, or null as soon as it passes `maxBytes`. It is read as a stream with a running
 * count because a chunked request declares no Content-Length, and `request.text()` would buffer
 * all of it before any check ran: the routes using this are public.
 */
export async function readBodyWithin(request: Request, maxBytes: number): Promise<string | null> {
  // A declared length that is too large is rejected without reading anything.
  if (Number(request.headers.get('content-length') ?? '0') > maxBytes) {
    return null;
  }
  if (request.body === null) {
    return '';
  }
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    size += value.byteLength;
    if (size > maxBytes) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  // Same decoding as `request.text()`: UTF-8, leading BOM dropped.
  return new TextDecoder().decode(Buffer.concat(chunks));
}
