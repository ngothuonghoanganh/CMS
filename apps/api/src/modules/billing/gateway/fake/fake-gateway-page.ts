import { FAKE_TEST_CARDS } from './fake-gateway-protocol.js';

/*
 * The HTML of the fake gateway's card page (ADR-035). Plain on purpose: it must look like a test
 * gateway, run without any external asset and stay readable with a keyboard or a screen reader.
 * It never echoes a card number back, whatever the error.
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

const STYLE = `
  :root { color-scheme: light; }
  body { margin: 0; font: 16px/1.5 system-ui, sans-serif; background: #f4f5f7; color: #1b1f24; }
  main { max-width: 26rem; margin: 2rem auto; padding: 1.5rem; background: #fff; border: 1px solid #c9ced6; border-radius: 12px; }
  .badge { display: inline-block; padding: 0.125rem 0.625rem; border-radius: 999px; background: #fff3c4; color: #5c4400; border: 1px solid #b58900; font-size: 0.875rem; font-weight: 600; }
  h1 { font-size: 1.25rem; margin: 0.75rem 0 0.5rem; }
  label { display: block; margin-top: 1rem; font-weight: 600; }
  input { box-sizing: border-box; width: 100%; margin-top: 0.25rem; padding: 0.5rem 0.625rem; font: inherit; border: 1px solid #5b6470; border-radius: 6px; }
  input:focus-visible, a:focus-visible, button:focus-visible { outline: 3px solid #1d4ed8; outline-offset: 2px; }
  .row { display: flex; gap: 1rem; } .row > div { flex: 1; }
  .error { margin: 1rem 0 0; padding: 0.625rem 0.75rem; border: 1px solid #b42318; background: #fef3f2; color: #7a271a; border-radius: 6px; }
  .actions { display: flex; align-items: center; gap: 1rem; margin-top: 1.5rem; }
  button { padding: 0.5rem 1.25rem; font: inherit; font-weight: 600; color: #fff; background: #1d4ed8; border: 0; border-radius: 6px; cursor: pointer; }
  a { color: #1d4ed8; }
  .cards { margin-top: 1.5rem; padding-top: 1rem; border-top: 1px solid #c9ced6; font-size: 0.875rem; }
  .cards ul { margin: 0.25rem 0 0; padding-left: 1.25rem; } code { font-family: ui-monospace, monospace; }
`;

const CARD_RESULTS: Record<string, string> = {
  succeeds: 'thanh toán thành công',
  card_declined: 'bị từ chối',
  insufficient_funds: 'không đủ số dư',
};

function layout(title: string, body: string): string {
  return `<!doctype html>
<html lang="vi">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>${escapeHtml(title)}</title>
<style>${STYLE}</style>
</head>
<body>
<main>
<span class="badge">Cổng thanh toán thử</span>
${body}
</main>
</body>
</html>
`;
}

export interface SetupPageInput {
  /** The signed session token, sent back with the form. */
  session: string;
  cancelUrl: string;
  error?: string;
  expiry?: string;
}

/** The card form of one setup, with the test cards listed beneath. */
export function renderSetupPage(input: SetupPageInput): string {
  const error =
    input.error === undefined
      ? ''
      : `<p class="error" role="alert" id="form-error">${escapeHtml(input.error)}</p>`;
  const cards = Object.entries(FAKE_TEST_CARDS)
    .map(([number, card]) => {
      const spaced = number.replace(/(\d{4})(?=\d)/g, '$1 ');
      return `<li><code>${spaced}</code>: ${CARD_RESULTS[card.behaviour] ?? card.behaviour}</li>`;
    })
    .join('');
  return layout(
    'Thêm thẻ (cổng thanh toán thử)',
    `<h1>Thêm phương thức thanh toán</h1>
<p>Đây là cổng thanh toán giả để thử nghiệm. Không có khoản tiền thật nào được trừ.</p>
${error}
<form method="post" action="setup" autocomplete="off"${input.error === undefined ? '' : ' aria-describedby="form-error"'}>
<input type="hidden" name="session" value="${escapeHtml(input.session)}">
<label for="number">Số thẻ</label>
<input id="number" name="number" inputmode="numeric" autocomplete="off" required>
<div class="row">
<div><label for="expiry">Hết hạn (MM/YY)</label>
<input id="expiry" name="expiry" inputmode="numeric" placeholder="12/35" autocomplete="off" value="${escapeHtml(input.expiry ?? '')}" required></div>
<div><label for="cvc">CVC</label>
<input id="cvc" name="cvc" inputmode="numeric" autocomplete="off" required></div>
</div>
<div class="actions">
<button type="submit">Lưu thẻ</button>
<a href="${escapeHtml(input.cancelUrl)}">Hủy</a>
</div>
</form>
<section class="cards" aria-label="Thẻ thử">
<strong>Thẻ thử</strong>
<ul>${cards}</ul>
</section>`,
  );
}

/** A page for a link that cannot be used: the session is expired, changed, or the card page is off. */
export function renderGatewayError(message: string): string {
  return layout(
    'Cổng thanh toán thử',
    `<h1>Không thể tiếp tục</h1>
<p class="error" role="alert">${escapeHtml(message)}</p>
<p>Quay lại trang thanh toán của bạn và thử lại.</p>`,
  );
}
