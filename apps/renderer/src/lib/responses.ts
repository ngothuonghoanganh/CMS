/** Plain-text 404 for non-page routes; identical whatever was missing (host, site or page). */
export function notFoundText(): Response {
  return new Response('Không tìm thấy trang\n', {
    status: 404,
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
}

/**
 * How long a client should wait before asking again when the API cannot answer. Crawlers keep the
 * page and come back; a 404 would tell them it is gone, an empty 200 that it is blank (ADR-009).
 */
export const RETRY_AFTER_SECONDS = 60;

const UNAVAILABLE_TITLE = 'Trang tạm thời chưa mở được';
const UNAVAILABLE_TEXT = 'Hệ thống đang bận. Vui lòng thử lại sau ít phút.';

function unavailableHeaders(contentType: string): Record<string, string> {
  return {
    'Content-Type': contentType,
    'Retry-After': String(RETRY_AFTER_SECONDS),
    'Cache-Control': 'no-store',
  };
}

/** Plain-text 503 for the SEO files when the API cannot answer. */
export function unavailableText(): Response {
  return new Response(`${UNAVAILABLE_TITLE}\n`, {
    status: 503,
    headers: unavailableHeaders('text/plain; charset=utf-8'),
  });
}

/**
 * The 503 page of a public page or a preview the API could not answer for: plain HTML built here,
 * so it needs nothing from the API and reads the same with JavaScript off. A preview stays
 * `noindex` even then (ADR-010).
 */
export function unavailablePage(options: { noindex: boolean }): Response {
  const robots = options.noindex ? '<meta name="robots" content="noindex, nofollow">\n' : '';
  const body = `<!doctype html>
<html lang="vi">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
${robots}<title>${UNAVAILABLE_TITLE}</title>
<style>
body{margin:0;font-family:system-ui,sans-serif;color:#15171c;background:#f5f6f8}
main{max-width:520px;margin:0 auto;padding:48px 20px;display:flex;flex-direction:column;gap:12px}
h1{margin:0;font-size:24px}p{margin:0;font-size:16px;line-height:1.55}
</style>
</head>
<body>
<main>
<h1>${UNAVAILABLE_TITLE}</h1>
<p>${UNAVAILABLE_TEXT}</p>
</main>
</body>
</html>`;
  return new Response(body, {
    status: 503,
    headers: {
      ...unavailableHeaders('text/html; charset=utf-8'),
      ...(options.noindex ? { 'X-Robots-Tag': 'noindex, nofollow' } : {}),
    },
  });
}
