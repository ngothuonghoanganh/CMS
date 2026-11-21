import { endpoints, type ErrorCode, type Membership } from '@plp/contracts';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '../../lib/api';
import { ApiError } from '../../lib/api-core';
import { navigateTo } from '../../lib/navigate';
import { WORKSPACE_ID } from '../dashboard/test-fixtures';
import { invoiceFixture } from '../billing/test-fixtures';
import { lastCallTo, renderWithProviders } from '../shell/test-utils';
import { MarketplaceItemScreen } from './MarketplaceItemScreen';
import { licenceFixture, marketplaceDetailFixture, quoteFixture } from './test-fixtures';

const { router } = vi.hoisted(() => ({
  router: { push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() },
}));
vi.mock('next/navigation', () => ({ useRouter: () => router }));
vi.mock(import('../../lib/api'), async (importOriginal) => ({
  ...(await importOriginal()),
  api: vi.fn(),
}));
vi.mock(import('../../lib/navigate'), () => ({ navigateTo: vi.fn() }));

const apiMock = vi.mocked(api);
const workspace: Membership['workspace'] = {
  id: WORKSPACE_ID,
  name: 'Mây Xanh Agency',
  slug: 'may-xanh-agency',
};
const itemId = marketplaceDetailFixture().id;
const INVOICE_ID = '64b0000000000000000000c3';

function problem(
  status: number,
  code: ErrorCode,
  title: string,
  context?: Record<string, unknown>,
) {
  return new ApiError(status, {
    type: 'about:blank',
    title,
    status,
    code,
    ...(context === undefined ? {} : { context }),
  });
}

const declined = () =>
  problem(402, 'payment_failed', 'Thanh toán không thành công', {
    invoiceId: INVOICE_ID,
    invoiceNumber: 'HD-2026-000009',
    code: 'card_declined',
  });
const paidAnswer = () => ({
  invoice: invoiceFixture(),
  licence: licenceFixture({ source: 'purchase' }),
});

interface Answers {
  quote?: unknown;
  /** A function that throws makes the call fail with what it throws. */
  purchase?: (options: { onStatus?: (status: number) => void }) => unknown;
  pay?: (options: unknown) => unknown;
  suggest?: unknown;
}

/** The answers of the quote and of the call being tried; anything else fails the test. */
function route(answers: Answers = {}) {
  const settle = (produce: () => unknown) =>
    new Promise((resolve, reject) => {
      try {
        resolve(produce());
      } catch (error) {
        reject(error instanceof Error ? error : new Error('The test threw a non-error'));
      }
    });
  apiMock.mockImplementation((endpoint, _args, options) => {
    if (endpoint === endpoints.getMarketplaceQuote) {
      return settle(() => answers.quote ?? quoteFixture());
    }
    if (endpoint === endpoints.purchaseMarketplaceItem && answers.purchase !== undefined) {
      return settle(() => answers.purchase?.(options ?? {}));
    }
    if (endpoint === endpoints.payInvoice && answers.pay !== undefined) {
      return settle(() => answers.pay?.(options));
    }
    if (endpoint === endpoints.startPaymentMethodSetup) {
      return Promise.resolve({ url: 'https://gateway.test/card' });
    }
    if (endpoint === endpoints.suggestMarketplaceItem) {
      return settle(() => {
        if (answers.suggest instanceof Error) {
          throw answers.suggest;
        }
        return answers.suggest;
      });
    }
    return Promise.reject(new Error('unexpected call'));
  });
}

function renderItem(
  overrides: Parameters<typeof marketplaceDetailFixture>[0] = {},
  role: 'owner' | 'editor' | 'viewer' = 'owner',
  returned: 'saved' | 'canceled' | null = null,
) {
  return renderWithProviders(
    <MarketplaceItemScreen
      workspace={workspace}
      role={role}
      item={marketplaceDetailFixture(overrides)}
      returned={returned}
    />,
  );
}

type User = ReturnType<typeof userEvent.setup>;

async function openDialog(user: User) {
  await user.click(screen.getByRole('button', { name: 'Mua mẫu' }));
  return screen.findByRole('dialog');
}

async function confirm(user: User, dialog: HTMLElement) {
  await user.click(await within(dialog).findByRole('checkbox'));
  await user.click(within(dialog).getByRole('button', { name: /^Thanh toán / }));
}

function keyOf(call: readonly unknown[] | undefined): string | undefined {
  return (call?.[2] as { headers?: Record<string, string> } | undefined)?.headers?.[
    'Idempotency-Key'
  ];
}

beforeEach(() => {
  apiMock.mockReset();
  apiMock.mockRejectedValue(new Error('unexpected call'));
  router.refresh.mockReset();
  vi.mocked(navigateTo).mockReset();
  window.history.replaceState(null, '', '/');
});

describe('"Xác nhận mua mẫu" (board 31, ADR-036)', () => {
  it('reads the quote and shows the item, the price, the VAT, the total, the card and the terms', async () => {
    route({ quote: quoteFixture({ billingCompanyName: 'Công ty TNHH Mây Xanh' }) });
    const user = userEvent.setup();
    renderItem();
    const dialog = await openDialog(user);
    expect(within(dialog).getByRole('heading', { name: 'Xác nhận mua mẫu' })).toBeVisible();
    expect(await within(dialog).findByText('Thanh toán bằng', { exact: false })).toBeVisible();
    expect(dialog).toHaveTextContent('Khai trương phòng tập · v1');
    expect(dialog).toHaveTextContent('Thuế');
    expect(dialog).toHaveTextContent('Đã gồm VAT');
    expect(dialog).toHaveTextContent('Tổng');
    expect(dialog).toHaveTextContent('Thanh toán bằng Thẻ Visa •••• 4242');
    expect(within(dialog).getByRole('button', { name: 'Đổi' })).toBeVisible();
    expect(dialog).toHaveTextContent('Biên nhận ghi tên Công ty TNHH Mây Xanh.');
    expect(apiMock).toHaveBeenCalledWith(
      endpoints.getMarketplaceQuote,
      [WORKSPACE_ID, itemId],
      expect.anything(),
    );
    // Reading the quote charges nothing.
    expect(apiMock).not.toHaveBeenCalledWith(
      endpoints.purchaseMarketplaceItem,
      expect.anything(),
      expect.anything(),
    );
  });

  it('pays only once the terms are ticked, with the quote and one Idempotency-Key', async () => {
    route({ purchase: paidAnswer });
    const user = userEvent.setup();
    renderItem();
    const dialog = await openDialog(user);
    const pay = await within(dialog).findByRole('button', { name: /^Thanh toán 399\.000/ });
    expect(pay).toBeDisabled();
    const box = within(dialog).getByRole('checkbox', {
      name: 'Tôi đồng ý với điều khoản giấy phép',
    });
    expect(box).not.toBeChecked();
    await user.click(box);
    expect(pay).toBeEnabled();
    await user.dblClick(pay);

    expect(
      await within(dialog).findByRole('heading', { name: 'Đã mua “Khai trương phòng tập”' }),
    ).toBeVisible();
    const calls = apiMock.mock.calls.filter(
      (call) => call[0] === endpoints.purchaseMarketplaceItem,
    );
    expect(calls).toHaveLength(1);
    const { args, options } = lastCallTo(apiMock, endpoints.purchaseMarketplaceItem);
    expect(args).toEqual([WORKSPACE_ID]);
    expect(options).toMatchObject({
      body: { itemId, version: 1, expectedAmount: 399_000, termsVersion: 1 },
    });
    expect(keyOf([null, null, options])).toMatch(/^[0-9a-f-]{36}$/);
    expect(within(dialog).getByRole('link', { name: 'Sản phẩm đã mua' })).toHaveAttribute(
      'href',
      `/workspaces/${WORKSPACE_ID}/marketplace/owned`,
    );
    expect(within(dialog).getByRole('link', { name: 'Tạo trang từ mẫu' })).toHaveAttribute(
      'href',
      `/workspaces/${WORKSPACE_ID}/templates/${itemId}`,
    );
    expect(router.refresh).toHaveBeenCalled();
  });

  it('cannot be dismissed while the gateway is asked, and says what it waits for', async () => {
    let finish: (value: unknown) => void = () => undefined;
    apiMock.mockImplementation((endpoint) => {
      if (endpoint === endpoints.getMarketplaceQuote) {
        return Promise.resolve(quoteFixture());
      }
      return new Promise((resolve) => {
        finish = resolve;
      });
    });
    const user = userEvent.setup();
    renderItem();
    const dialog = await openDialog(user);
    await confirm(user, dialog);
    expect(await within(dialog).findByText('Đang chờ cổng thanh toán xác nhận…')).toBeVisible();
    expect(within(dialog).getByRole('heading', { name: 'Đang thanh toán…' })).toBeVisible();
    expect(within(dialog).getByRole('button', { name: 'Hủy' })).toBeDisabled();
    // The close button says it does nothing now, rather than doing nothing silently.
    const close = within(dialog).getByRole('button', { name: 'Đóng' });
    expect(close).toHaveAttribute('aria-disabled', 'true');
    await user.keyboard('{Escape}');
    await user.click(close);
    expect(screen.getByRole('dialog')).toBeVisible();
    finish(paidAnswer());
    expect(await screen.findByRole('heading', { name: /Đã mua/ })).toBeVisible();
    expect(within(dialog).getByRole('button', { name: 'Đóng' })).not.toHaveAttribute(
      'aria-disabled',
    );
  });

  it('announces the wait and what came of it in one live region, there from the start', async () => {
    route({ purchase: paidAnswer });
    const user = userEvent.setup();
    renderItem();
    const dialog = await openDialog(user);
    await within(dialog).findByText('Thanh toán bằng', { exact: false });
    const region = within(dialog).getByRole('status');
    expect(region).toBeEmptyDOMElement();
    await confirm(user, dialog);

    await within(dialog).findByRole('heading', { name: /Đã mua/ });
    expect(region).toBeInTheDocument();
    expect(region).toHaveTextContent('Mẫu đã có trong Templates của workspace');
  });

  it('says a charge still being decided (202) and leads to the invoices', async () => {
    route({
      purchase: (options) => {
        options.onStatus?.(202);
        return { invoice: invoiceFixture({ status: 'pending' }), licence: null };
      },
    });
    const user = userEvent.setup();
    renderItem();
    const dialog = await openDialog(user);
    await confirm(user, dialog);
    expect(
      await within(dialog).findByText(/Mẫu sẽ có trong workspace khi cổng xác nhận/),
    ).toBeVisible();
    expect(within(dialog).getByRole('link', { name: 'Thanh toán & hóa đơn' })).toHaveAttribute(
      'href',
      `/workspaces/${WORKSPACE_ID}/billing/payments`,
    );
    expect(within(dialog).queryByRole('heading', { name: /Đã mua/ })).toBeNull();
  });

  it('says a declined card with the board words, then "Thanh toán lại" of that invoice with a new key', async () => {
    const purchase = vi.fn(() => {
      throw declined();
    });
    const pay = vi.fn(() => ({ invoice: invoiceFixture() }));
    route({ purchase, pay });
    const user = userEvent.setup();
    renderItem();
    const dialog = await openDialog(user);
    await confirm(user, dialog);
    const alert = await within(dialog).findByRole('alert');
    expect(alert).toHaveTextContent('Ngân hàng từ chối thẻ');
    expect(alert).toHaveTextContent('Bạn chưa bị trừ tiền và chưa sở hữu mẫu.');
    expect(
      within(dialog).getByRole('heading', { name: 'Thanh toán chưa thành công' }),
    ).toBeVisible();
    const firstKey = keyOf(
      apiMock.mock.calls.find((call) => call[0] === endpoints.purchaseMarketplaceItem),
    );

    await user.click(within(dialog).getByRole('button', { name: 'Thử lại' }));
    expect(await screen.findByRole('heading', { name: /Đã mua/ })).toBeVisible();
    const retry = lastCallTo(apiMock, endpoints.payInvoice);
    expect(retry.args).toEqual([WORKSPACE_ID, INVOICE_ID]);
    const retryKey = (retry.options as { headers: Record<string, string> }).headers[
      'Idempotency-Key'
    ];
    expect(retryKey).toBeTruthy();
    expect(retryKey).not.toBe(firstKey);
    expect(purchase).toHaveBeenCalledTimes(1);
  });

  it('sends "Đổi phương thức" to the gateway for this item', async () => {
    route({
      purchase: () => {
        throw declined();
      },
    });
    const user = userEvent.setup();
    renderItem();
    const dialog = await openDialog(user);
    await confirm(user, dialog);
    await user.click(await within(dialog).findByRole('button', { name: 'Đổi phương thức' }));
    await waitFor(() => {
      expect(navigateTo).toHaveBeenCalledWith('https://gateway.test/card');
    });
    expect(lastCallTo(apiMock, endpoints.startPaymentMethodSetup)).toMatchObject({
      options: { body: { returnTo: 'marketplace', itemId } },
    });
  });

  it('warns not to buy again when the outcome is unknown, and leads to "Thanh toán lại"', async () => {
    route({
      purchase: () => {
        throw problem(503, 'gateway_unavailable', 'Chưa rõ kết quả thanh toán', {
          invoiceId: INVOICE_ID,
          invoiceNumber: 'HD-2026-000009',
        });
      },
    });
    const user = userEvent.setup();
    renderItem();
    const dialog = await openDialog(user);
    await confirm(user, dialog);
    expect(await within(dialog).findByText(/Đừng mua lại: “Thanh toán lại” ở/)).toBeVisible();
    expect(within(dialog).queryByRole('button', { name: /^Thanh toán / })).toBeNull();
  });

  it('keeps the key of an answer that never arrived, so the same attempt is asked again', async () => {
    let count = 0;
    route({
      purchase: () => {
        count += 1;
        if (count === 1) {
          throw new TypeError('network');
        }
        return paidAnswer();
      },
    });
    const user = userEvent.setup();
    renderItem();
    const dialog = await openDialog(user);
    await confirm(user, dialog);
    await user.click(await within(dialog).findByRole('button', { name: /^Thanh toán 399\.000/ }));
    await screen.findByRole('heading', { name: /Đã mua/ });
    const keys = apiMock.mock.calls
      .filter((call) => call[0] === endpoints.purchaseMarketplaceItem)
      .map(keyOf);
    expect(keys).toHaveLength(2);
    expect(keys[0]).toBe(keys[1]);
  });

  it('reads the item again when it changed meanwhile (409 item_changed)', async () => {
    route({
      purchase: () => {
        throw problem(409, 'item_changed', 'Mẫu “Khai trương phòng tập” vừa thay đổi');
      },
    });
    const user = userEvent.setup();
    renderItem();
    const dialog = await openDialog(user);
    await confirm(user, dialog);
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull();
    });
    expect(router.refresh).toHaveBeenCalled();
    expect(screen.getByRole('complementary', { name: 'Giá' })).toHaveTextContent(
      'vừa thay đổi. Đã tải lại',
    );
  });

  it('says another payment is under way and points to the invoices (409 payment_in_progress)', async () => {
    route({
      purchase: () => {
        throw problem(409, 'payment_in_progress', 'Đang có một thanh toán chưa xong', {
          invoiceId: INVOICE_ID,
          invoiceNumber: 'HD-2026-000008',
        });
      },
    });
    const user = userEvent.setup();
    renderItem();
    const dialog = await openDialog(user);
    await confirm(user, dialog);
    expect(await within(dialog).findByText(/Hóa đơn HD-2026-000008 chưa có kết quả/)).toBeVisible();
    expect(
      within(dialog).getByRole('heading', { name: 'Chưa rõ kết quả thanh toán' }),
    ).toBeVisible();
  });

  it('calls a charge that merely holds the workspace a payment not finished, not an unknown one', async () => {
    route({
      purchase: () => {
        throw problem(409, 'payment_in_progress', 'Đang có một thanh toán chưa xong');
      },
    });
    const user = userEvent.setup();
    renderItem();
    const dialog = await openDialog(user);
    await confirm(user, dialog);
    expect(
      await within(dialog).findByRole('heading', { name: 'Đang có một thanh toán chưa xong' }),
    ).toBeVisible();
    expect(within(dialog).getByRole('alert')).toHaveTextContent(
      'Một khoản thanh toán của workspace đang được xử lý. Chờ kết quả rồi thử lại.',
    );
    expect(within(dialog).queryByText(/Chưa rõ kết quả/)).toBeNull();
  });

  it('shows the item owned when it was paid for but held already (409 payment_not_applied)', async () => {
    route({
      purchase: () => {
        throw new ApiError(409, {
          type: 'about:blank',
          title: 'Lần mua không được áp dụng',
          status: 409,
          code: 'payment_not_applied',
          detail:
            'Cổng thanh toán đã trừ tiền cho hóa đơn HD-2026-000009, nhưng workspace đã sở hữu mẫu này trước đó nên lần mua không được áp dụng. Khoản tiền này sẽ được hoàn lại.',
          context: { invoiceId: INVOICE_ID, invoiceNumber: 'HD-2026-000009' },
        });
      },
    });
    const user = userEvent.setup();
    renderItem();
    const dialog = await openDialog(user);
    await confirm(user, dialog);
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull();
    });
    expect(router.refresh).toHaveBeenCalled();
    expect(screen.getByRole('complementary', { name: 'Giá' })).toHaveTextContent(
      'Khoản tiền này sẽ được hoàn lại. Đã tải lại trang.',
    );
  });

  it('says a read-only workspace cannot buy, with the way to the plan', async () => {
    route({
      purchase: () => {
        throw problem(402, 'workspace_read_only', 'Workspace đang ở chế độ chỉ đọc', {
          state: 'read_only',
        });
      },
    });
    const user = userEvent.setup();
    renderItem();
    const dialog = await openDialog(user);
    await confirm(user, dialog);
    const alert = await within(dialog).findByRole('alert');
    expect(alert).toHaveTextContent('Workspace đang ở chế độ chỉ đọc');
    expect(within(dialog).getByRole('button', { name: /^Thanh toán / })).toBeEnabled();
  });

  it('asks for a card instead of paying when none can be charged', async () => {
    route({ quote: quoteFixture({ paymentMethod: null, paymentMethodRequired: true }) });
    const user = userEvent.setup();
    renderItem();
    const dialog = await openDialog(user);
    const add = await within(dialog).findByRole('button', { name: 'Thêm thẻ' });
    expect(within(dialog).queryByRole('button', { name: /^Thanh toán / })).toBeNull();
    await user.click(add);
    await waitFor(() => {
      expect(navigateTo).toHaveBeenCalledWith('https://gateway.test/card');
    });
    expect(lastCallTo(apiMock, endpoints.startPaymentMethodSetup)).toMatchObject({
      options: { body: { returnTo: 'marketplace', itemId } },
    });
  });

  it('has no button to buy when payments are off', async () => {
    route({
      quote: quoteFixture({
        paymentsEnabled: false,
        paymentMethod: null,
        paymentMethodRequired: true,
      }),
    });
    const user = userEvent.setup();
    renderItem();
    const dialog = await openDialog(user);
    expect(await within(dialog).findByText('Thanh toán chưa được bật')).toBeVisible();
    expect(within(dialog).queryByRole('button', { name: /^Thanh toán |Thêm thẻ/ })).toBeNull();
  });

  it('closes and reads the item again when the quote says the workspace holds it', async () => {
    route({ quote: quoteFixture({ owned: true }) });
    const user = userEvent.setup();
    renderItem();
    await user.click(screen.getByRole('button', { name: 'Mua mẫu' }));
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull();
    });
    expect(router.refresh).toHaveBeenCalled();
  });

  it('closes and reads again when the quote is of another version than the page', async () => {
    route({ quote: quoteFixture({ version: 2 }) });
    const user = userEvent.setup();
    renderItem();
    await user.click(screen.getByRole('button', { name: 'Mua mẫu' }));
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull();
    });
    expect(router.refresh).toHaveBeenCalled();
  });

  it('opens by itself when the gateway led back from the card page, and says the card is saved', async () => {
    route();
    renderItem({}, 'owner', 'saved');
    const dialog = await screen.findByRole('dialog');
    expect(await within(dialog).findByText('Đã lưu thẻ')).toBeVisible();
    expect(window.location.pathname).toBe(`/workspaces/${WORKSPACE_ID}/marketplace/${itemId}`);
  });

  it('says what the gateway did only in the dialog it led back to, not when opened again', async () => {
    route();
    const user = userEvent.setup();
    renderItem({}, 'owner', 'saved');
    const dialog = await screen.findByRole('dialog');
    expect(await within(dialog).findByText('Đã lưu thẻ')).toBeVisible();
    await user.click(within(dialog).getByRole('button', { name: 'Hủy' }));
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull();
    });

    const again = await openDialog(user);
    await within(again).findByText('Thanh toán bằng', { exact: false });
    expect(within(again).queryByText('Đã lưu thẻ')).toBeNull();
  });

  it('says the card is not there yet when the gateway has not reported it', async () => {
    route({ quote: quoteFixture({ paymentMethod: null, paymentMethodRequired: true }) });
    renderItem({}, 'owner', 'saved');
    const dialog = await screen.findByRole('dialog');
    expect(await within(dialog).findByText('Đang chờ cổng thanh toán xác nhận thẻ')).toBeVisible();
  });

  it('does not open for a viewer who cannot pay, whatever the address says', () => {
    route();
    renderItem({}, 'editor', 'saved');
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});

describe('"Đề xuất {owner} mua" (board 31)', () => {
  it('sends the suggestion once and then says it was sent', async () => {
    route({ suggest: { alreadySuggested: false, message: 'Đã gửi đề xuất tới Ngọc Anh.' } });
    const user = userEvent.setup();
    renderItem({}, 'editor');
    const regions = within(screen.getByRole('complementary', { name: 'Giá' })).getAllByRole(
      'status',
    );
    await user.click(screen.getByRole('button', { name: 'Đề xuất Ngọc Anh mua' }));
    expect(await screen.findByText('Đã đề xuất Ngọc Anh mua')).toBeVisible();
    const sentence = screen.getByText('Đã gửi đề xuất tới Ngọc Anh.');
    expect(sentence).toBeVisible();
    expect(screen.queryByRole('button', { name: /Đề xuất/ })).toBeNull();
    // Announced by a region that was there before; focus goes to what took the button's place.
    const region = sentence.closest('[role="status"]');
    expect(regions).toContain(region);
    await waitFor(() => {
      expect(region?.firstElementChild).toHaveFocus();
    });
    expect(apiMock).toHaveBeenCalledWith(endpoints.suggestMarketplaceItem, [WORKSPACE_ID, itemId]);
  });

  it('shows what was sent before without a button', () => {
    renderItem({ suggested: true }, 'viewer');
    expect(screen.getByText('Đã đề xuất Ngọc Anh mua')).toBeVisible();
    expect(screen.queryByRole('button', { name: /Đề xuất/ })).toBeNull();
  });

  it('keeps the button and says why when the email could not be sent', async () => {
    route({ suggest: problem(503, 'suggestion_not_sent', 'Chưa gửi được đề xuất') });
    const user = userEvent.setup();
    renderItem({}, 'editor');
    await user.click(screen.getByRole('button', { name: 'Đề xuất Ngọc Anh mua' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Chưa gửi được đề xuất');
    expect(screen.getByRole('button', { name: 'Đề xuất Ngọc Anh mua' })).toBeEnabled();
  });
});
