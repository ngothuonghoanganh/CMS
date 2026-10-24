/** Plain-text 404 for non-page routes; identical whatever was missing (host, site or page). */
export function notFoundText(): Response {
  return new Response('Không tìm thấy trang\n', {
    status: 404,
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
}
