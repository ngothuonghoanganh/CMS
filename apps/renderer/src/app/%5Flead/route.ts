import { LEAD_ROUTE } from '@plp/contracts';
import { rendererEnv } from '../../env';
import { clientAddress } from '../../lib/client-address';
import { requestHost, subdomainFromHeaders } from '../../lib/host';
import { relayLead, type RelayOutcome } from '../../lib/lead-relay';
import { checkLeadRequest, leadRequestCandidate, leadSourceFrom } from '../../lib/lead-request';
import { leadResultHtml, safeBackPath } from '../../lib/lead-result-page';
import { readBodyWithin } from '../../lib/request-body';
import { isCrossSite } from '../../lib/same-site';

// `/_lead` (ADR-016): the folder is "%5Flead" because "_lead" would be a private folder. Response
// headers (noindex, no-referrer) come from next.config.ts; every answer here is also no-store.

/** A lead is a few short fields; anything far larger is not a real form. */
const MAX_BODY_BYTES = 32 * 1024;

const NO_STORE = { 'cache-control': 'no-store' };

/** What the page script shows for each outcome it does not word itself. */
const SCRIPT_MESSAGES = {
  not_found: 'Form này không còn nhận đăng ký. Tải lại trang rồi gửi lại.',
  failed: 'Chưa gửi được đăng ký. Kiểm tra kết nối rồi thử lại.',
} as const;

function json(body: unknown, status: number): Response {
  return Response.json(body, { status, headers: NO_STORE });
}

function html(body: string, status: number): Response {
  return new Response(body, {
    status,
    headers: { 'content-type': 'text/html; charset=utf-8', ...NO_STORE },
  });
}

function mediaType(header: string | null): string {
  return (header ?? '').split(';')[0]?.trim().toLowerCase() ?? '';
}

function parseJson(text: string): { ok: true; value: unknown } | { ok: false } {
  try {
    return { ok: true, value: JSON.parse(text) as unknown };
  } catch {
    // Not JSON: answered as 400 by the caller, like any other malformed body.
    return { ok: false };
  }
}

/** The page the form was on, from the Referer when it is this site; "/" otherwise. */
function backPathOf(request: Request, host: string | null): string {
  const referer = request.headers.get('referer');
  if (referer === null || host === null || !URL.canParse(referer)) {
    return '/';
  }
  const url = new URL(referer);
  return url.host === host ? safeBackPath(url.pathname) : '/';
}

function scriptAnswer(outcome: RelayOutcome): Response {
  switch (outcome.kind) {
    case 'received':
      return json({ ok: true }, 200);
    case 'invalid':
      return json({ ok: false, issues: outcome.issues }, 422);
    case 'rate_limited':
      return json({ ok: false, message: outcome.message }, 429);
    case 'not_found':
      return json({ ok: false, message: SCRIPT_MESSAGES.not_found }, 404);
    case 'failed':
      return json({ ok: false, message: SCRIPT_MESSAGES.failed }, 502);
  }
}

function formAnswer(outcome: RelayOutcome, back: string): Response {
  switch (outcome.kind) {
    case 'received':
      // Post/redirect/get: refreshing the result page does not send the lead again.
      return new Response(null, {
        status: 303,
        headers: {
          location: `${LEAD_ROUTE}?status=received&back=${encodeURIComponent(back)}`,
          ...NO_STORE,
        },
      });
    case 'invalid':
      return html(
        leadResultHtml(
          'invalid',
          back,
          outcome.issues.map((issue) => issue.message),
        ),
        422,
      );
    case 'rate_limited':
      return html(leadResultHtml('rate_limited', back), 429);
    case 'not_found':
      return html(leadResultHtml('not_found', back), 404);
    case 'failed':
      return html(leadResultHtml('failed', back), 502);
  }
}

/**
 * A visitor's lead: JSON from the page script, or the plain form when JavaScript is off. It is
 * checked with the API's own contract, then relayed with the visitor's address and user agent,
 * signed (ADR-016). The lead itself is never logged.
 */
export async function POST(request: Request): Promise<Response> {
  const env = rendererEnv();
  const host = requestHost(request.headers, env.TRUST_PROXY);
  const subdomain = subdomainFromHeaders(request.headers, env);
  const type = mediaType(request.headers.get('content-type'));
  const fromScript = type === 'application/json';
  if (subdomain === null) {
    return fromScript
      ? json({ ok: false, message: SCRIPT_MESSAGES.not_found }, 404)
      : html(leadResultHtml('not_found', '/'), 404);
  }
  if (isCrossSite(request, host)) {
    return json({ ok: false, message: 'Yêu cầu không đến từ trang này' }, 403);
  }
  if (!fromScript && type !== 'application/x-www-form-urlencoded') {
    return json({ ok: false, message: 'Định dạng gửi không được hỗ trợ' }, 415);
  }
  const raw = await readBodyWithin(request, MAX_BODY_BYTES);
  if (raw === null) {
    return json({ ok: false, message: 'Nội dung gửi quá lớn' }, 413);
  }
  const visitor = {
    subdomain,
    clientIp: clientAddress(request.headers, env.TRUST_PROXY),
    userAgent: request.headers.get('user-agent') ?? '',
    env,
  };

  if (fromScript) {
    const parsed = parseJson(raw);
    if (!parsed.ok) {
      return json({ ok: false, message: 'Nội dung gửi không hợp lệ' }, 400);
    }
    const check = checkLeadRequest(parsed.value);
    if (!check.ok) {
      return json({ ok: false, issues: check.issues }, 422);
    }
    return scriptAnswer(await relayLead({ ...visitor, body: parsed.value }));
  }

  const form = new URLSearchParams(raw);
  const back = backPathOf(request, host);
  // Without script there is no submission id or fill time; campaign tags come from the Referer.
  const candidate = leadRequestCandidate((name) => form.get(name), {
    submissionId: null,
    elapsedMs: null,
    source: leadSourceFrom(request.headers.get('referer'), null),
  });
  const check = checkLeadRequest(candidate);
  if (!check.ok) {
    return html(
      leadResultHtml(
        'invalid',
        back,
        check.issues.map((issue) => issue.message),
      ),
      422,
    );
  }
  return formAnswer(await relayLead({ ...visitor, body: candidate }), back);
}

/** Where a form sent without script lands after a lead was received. */
export function GET(request: Request): Response {
  const query = new URL(request.url).searchParams;
  if (query.get('status') !== 'received') {
    return new Response('Không tìm thấy', {
      status: 404,
      headers: { 'content-type': 'text/plain; charset=utf-8', ...NO_STORE },
    });
  }
  return html(leadResultHtml('received', safeBackPath(query.get('back'))), 200);
}
