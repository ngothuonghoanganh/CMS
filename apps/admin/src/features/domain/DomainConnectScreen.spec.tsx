import { type Domain, type DomainAvailability, endpoints } from '@plp/contracts';
import { act, fireEvent, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, onTestFinished, vi } from 'vitest';
import { api } from '../../lib/api';
import { siteFixture } from '../dashboard/test-fixtures';
import { lastCallTo, renderWithProviders } from '../shell/test-utils';
import { DomainConnectScreen } from './DomainConnectScreen';
import { domainFixture, domainList } from './test-fixtures';

const { router } = vi.hoisted(() => ({
  router: { push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() },
}));

vi.mock('next/navigation', () => ({ useRouter: () => router }));

vi.mock(import('../../lib/api'), async (importOriginal) => ({
  ...(await importOriginal()),
  api: vi.fn(),
}));

const apiMock = vi.mocked(api);
const LOADED_AT = Date.parse('2026-11-01T03:00:00.000Z');
const site = siteFixture();

const waiting = domainFixture({
  hostname: 'uudai.smilecare.vn',
  status: 'pending_dns',
  activeSince: null,
  httpsValidUntil: null,
  found: [],
  records: [
    { type: 'CNAME', name: 'uudai.smilecare.vn', value: 'cname.payload.site', state: 'missing' },
    {
      type: 'TXT',
      name: '_payload.uudai.smilecare.vn',
      value: 'payload-verify=8f3a2c91e07b4d5aa1b2c3d4e5f60718',
      state: 'missing',
    },
  ],
});

function renderScreen(initialDomain: Domain | null = waiting) {
  return renderWithProviders(
    <DomainConnectScreen
      site={site}
      initialDomain={initialDomain}
      baseDomain="payload.site"
      loadedAt={LOADED_AT}
    />,
  );
}

beforeEach(() => {
  apiMock.mockReset();
  router.push.mockReset();
  router.replace.mockReset();
});

/** The API: the check of a typed domain answers `state`; adding one answers `added`. */
function answer(state: DomainAvailability['state'], added: Domain = waiting) {
  apiMock.mockImplementation((endpoint, _args, options) => {
    if (endpoint === endpoints.domainAvailability) {
      const query = (options as { query?: { hostname?: string } } | undefined)?.query;
      return Promise.resolve({
        hostname: query?.hostname ?? '',
        state,
        reason: null,
      } satisfies DomainAvailability);
    }
    return Promise.resolve(endpoint === endpoints.addDomain ? added : undefined);
  });
}

describe('DomainConnectScreen', () => {
  it('takes only a domain, suggesting it from a URL (board 14)', async () => {
    const user = userEvent.setup();
    answer('available');
    renderScreen(null);
    await user.type(screen.getByLabelText('Tên miền'), 'https://uudai.smilecare.vn/');
    await user.click(screen.getByRole('button', { name: 'Tiếp tục' }));
    expect(
      screen.getByText('Chỉ nhập tên miền, không kèm https://, cổng và dấu / ở cuối.'),
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Dùng uudai.smilecare.vn' }));
    expect(screen.getByLabelText('Tên miền')).toHaveValue('uudai.smilecare.vn');
    expect(screen.getByText(/của smilecare\.vn\. Bạn chỉ cần thêm/)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Tiếp tục' }));
    expect(lastCallTo(apiMock, endpoints.addDomain).options).toEqual({
      body: { hostname: 'uudai.smilecare.vn' },
    });
    expect(router.replace).toHaveBeenCalledWith(
      `/sites/${site.id}/domain/connect?domain=${waiting.id}`,
    );
  });

  it('checks a typed domain and says at once that another site has it, never which', async () => {
    // The test holds the clock: the check goes once typing pauses for 400 ms, and a busy machine
    // must neither make a pause between two letters nor make the answer late.
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    onTestFinished(() => {
      vi.useRealTimers();
    });
    const checks = () =>
      apiMock.mock.calls.filter(([endpoint]) => endpoint === endpoints.domainAvailability);
    answer('taken');
    renderScreen(null);
    const field = screen.getByLabelText('Tên miền');
    for (const typed of [' U', ' UuDai.', ' UuDai.SmileCare.', ' UuDai.SmileCare.vn ']) {
      fireEvent.change(field, { target: { value: typed } });
      await act(() => vi.advanceTimersByTimeAsync(399));
    }
    expect(checks()).toEqual([]);

    // Typing stopped: the check goes, and its answer reaches the screen.
    await act(() => vi.advanceTimersByTimeAsync(1));
    await act(() => vi.advanceTimersByTimeAsync(0));
    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('Tên miền này đang được một site khác dùng');
    expect(alert).toHaveTextContent('hãy thêm bản ghi TXT ở bước sau');
    // Asked once the typing stopped, not for every letter.
    expect(checks()).toHaveLength(1);
    expect(lastCallTo(apiMock, endpoints.domainAvailability)).toEqual({
      args: [site.id],
      options: {
        query: { hostname: 'uudai.smilecare.vn' },
        signal: expect.any(AbortSignal) as AbortSignal,
      },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Tiếp tục để xác minh quyền sở hữu' }));
    await act(() => vi.advanceTimersByTimeAsync(0));
    expect(lastCallTo(apiMock, endpoints.addDomain).options).toEqual({
      body: { hostname: 'uudai.smilecare.vn' },
    });
  });

  it('says in a live region what the check found', async () => {
    const user = userEvent.setup();
    answer('available');
    renderScreen(null);
    const field = screen.getByLabelText('Tên miền');
    await user.type(field, 'go.smilecare.vn');
    const status = screen.getByRole('status');
    expect(status).toHaveTextContent('Đang kiểm tra tên miền…');
    await vi.waitFor(() => {
      expect(status).toHaveTextContent('Chưa site nào dùng tên miền này.');
    });

    answer('already_added');
    await user.clear(field);
    await user.type(field, 'uudai.smilecare.vn');
    expect(await screen.findByText('Site này đã có tên miền này')).toBeInTheDocument();
    expect(field).toHaveAttribute('aria-invalid', 'true');
  });

  it('heads each step as the domain stands, and says the certificate renews itself', () => {
    const { unmount } = renderScreen({ ...waiting, status: 'issuing' });
    expect(screen.getByRole('heading', { level: 2, name: 'Đang bật HTTPS' })).toBeInTheDocument();
    unmount();
    const second = renderScreen({ ...waiting, status: 'taken' });
    expect(
      screen.getByRole('heading', { level: 2, name: 'Xác minh quyền sở hữu' }),
    ).toBeInTheDocument();
    second.unmount();
    apiMock.mockResolvedValue(domainList([]));
    renderScreen(domainFixture({ hostname: 'uudai.smilecare.vn' }));
    expect(screen.getByRole('heading', { level: 2, name: 'Đã kết nối' })).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent(
      'uudai.smilecare.vn đã hoạt động với HTTPS.Mọi trang đang live đã mở được qua địa chỉ này. Chứng chỉ tự gia hạn trước khi hết hạn.',
    );
  });

  it('shows the records to add, as providers name them, and checks now', async () => {
    const user = userEvent.setup();
    renderScreen();
    expect(screen.getByRole('status')).toHaveTextContent('Đang chờ bản ghi DNS có hiệu lực');
    // Said beside the status, not in it: the time changes every minute.
    expect(screen.getByRole('status')).not.toHaveTextContent('Kiểm tra lần cuối');
    expect(screen.getByText(/^Kiểm tra lần cuối/)).toBeInTheDocument();
    const table = screen.getByRole('table');
    expect(
      within(table)
        .getAllByRole('row')
        .slice(1)
        .map((row) => row.textContent),
    ).toEqual([
      expect.stringContaining('CNAMEuudai') as string,
      expect.stringContaining('TXT_payload.uudai') as string,
    ]);
    expect(screen.getByRole('button', { name: 'Sao chép giá trị TXT' })).toBeInTheDocument();

    apiMock.mockResolvedValueOnce({
      ...waiting,
      status: 'misconfigured',
      found: [{ type: 'A', value: '103.97.125.18' }],
      records: waiting.records.map((record) =>
        record.type === 'CNAME'
          ? { ...record, state: 'wrong' as const }
          : { ...record, state: 'ok' as const },
      ),
    });
    await user.click(screen.getByRole('button', { name: 'Kiểm tra ngay' }));
    expect(lastCallTo(apiMock, endpoints.checkDomain).args).toEqual([site.id, waiting.id]);
    expect(await screen.findByText('A · 103.97.125.18')).toBeInTheDocument();
    expect(screen.getByText('CNAME · cname.payload.site')).toBeInTheDocument();
  });

  it('lets an active domain become the primary address before finishing', async () => {
    const user = userEvent.setup();
    const active = domainFixture({ hostname: 'uudai.smilecare.vn' });
    apiMock.mockImplementation((endpoint) =>
      Promise.resolve(endpoint === endpoints.listDomains ? domainList([active]) : undefined),
    );
    renderScreen(active);
    expect(screen.getByRole('status')).toHaveTextContent('uudai.smilecare.vn đã hoạt động');
    const choice = await screen.findByRole('radio', {
      name: /Đặt uudai.smilecare.vn làm địa chỉ chính/,
    });
    await vi.waitFor(() => {
      expect(choice).toHaveAccessibleDescription(/^6 trang đang live đổi địa chỉ ngay\./);
    });
    await user.click(choice);
    await user.click(screen.getByRole('button', { name: 'Xong' }));
    await vi.waitFor(() => {
      expect(router.push).toHaveBeenCalledWith(`/sites/${site.id}/domain`);
    });
    expect(lastCallTo(apiMock, endpoints.setPrimaryDomain).options).toEqual({
      body: { domainId: active.id },
    });
  });
});
