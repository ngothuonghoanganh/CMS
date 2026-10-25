import type { RelayOutcome } from './lead-relay';

/**
 * The page a form sent without JavaScript lands on (ADR-016). Plain HTML built here: it carries no
 * site content, so it needs no page lookup, and every value in it is escaped.
 */

const ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ESCAPES[character] ?? character);
}

/**
 * A path on this site to go back to: "/" or one lowercase slug. Anything else, such as another
 * host or a protocol-relative "//", becomes "/", so the link can never lead off the site.
 */
export function safeBackPath(value: string | null): string {
  return value !== null && /^\/[a-z0-9-]*$/.test(value) ? value : '/';
}

const CAMPAIGN_TAGS = ['utm_source', 'utm_medium', 'utm_campaign'] as const;

/**
 * The campaign tags of the page a form was on, as a query to keep on the way back to it: a lead
 * sent again after a refusal is then attributed like the first try (ADR-016). Only these tags go
 * along, encoded; nothing else of the visitor's address does.
 */
export function campaignQuery(params: URLSearchParams): string {
  const kept = new URLSearchParams();
  for (const name of CAMPAIGN_TAGS) {
    const value = params.get(name);
    if (value !== null && value !== '') {
      kept.set(name, value);
    }
  }
  return kept.toString();
}

export type LeadResultKind = 'received' | Exclude<RelayOutcome['kind'], 'received'>;

const COPY: Record<LeadResultKind, { title: string; text: string; back: string }> = {
  received: {
    title: 'Đã nhận đăng ký của bạn',
    text: 'Chúng tôi sẽ liên hệ lại với bạn sớm.',
    back: 'Quay lại trang',
  },
  invalid: {
    title: 'Chưa gửi được đăng ký',
    text: 'Vui lòng sửa các mục sau rồi gửi lại:',
    back: 'Quay lại form',
  },
  rate_limited: {
    title: 'Chưa gửi được đăng ký',
    text: 'Bạn đã gửi nhiều lần, hãy thử lại sau ít phút.',
    back: 'Quay lại trang',
  },
  not_found: {
    title: 'Form này không còn nhận đăng ký',
    text: 'Trang có thể vừa được cập nhật. Mở lại trang rồi gửi lại.',
    back: 'Mở lại trang',
  },
  failed: {
    title: 'Chưa gửi được đăng ký',
    text: 'Đã có lỗi khi gửi. Vui lòng thử lại sau ít phút.',
    back: 'Quay lại trang',
  },
};

export function leadResultHtml(
  kind: LeadResultKind,
  backPath: string,
  messages: readonly string[] = [],
  campaign = '',
): string {
  const copy = COPY[kind];
  const back = `${safeBackPath(backPath)}${campaign === '' ? '' : `?${campaign}`}`;
  const list =
    messages.length === 0
      ? ''
      : `<ul>${messages.map((message) => `<li>${escapeHtml(message)}</li>`).join('')}</ul>`;
  return `<!doctype html>
<html lang="vi">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>${escapeHtml(copy.title)}</title>
<style>
body{margin:0;font-family:system-ui,sans-serif;color:#15171c;background:#f5f6f8}
main{max-width:520px;margin:0 auto;padding:48px 20px;display:flex;flex-direction:column;gap:12px}
h1{margin:0;font-size:24px}p,li{font-size:16px;line-height:1.55}
a{color:#0f5e55;font-weight:600}
</style>
</head>
<body>
<main>
<h1>${escapeHtml(copy.title)}</h1>
<p>${escapeHtml(copy.text)}</p>
${list}
<p><a href="${escapeHtml(back)}">${escapeHtml(copy.back)}</a></p>
</main>
</body>
</html>`;
}
