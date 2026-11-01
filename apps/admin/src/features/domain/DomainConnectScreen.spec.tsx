import { type Domain, endpoints } from '@plp/contracts';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
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

describe('DomainConnectScreen', () => {
  it('takes only a domain, suggesting it from a URL (board 14)', async () => {
    const user = userEvent.setup();
    renderScreen(null);
    await user.type(screen.getByLabelText('Tên miền'), 'https://uudai.smilecare.vn/');
    await user.click(screen.getByRole('button', { name: 'Tiếp tục' }));
    expect(
      screen.getByText('Chỉ nhập tên miền, không kèm https://, cổng và dấu / ở cuối.'),
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Dùng uudai.smilecare.vn' }));
    expect(screen.getByLabelText('Tên miền')).toHaveValue('uudai.smilecare.vn');
    expect(screen.getByText(/Tên miền phụ\./)).toBeInTheDocument();

    apiMock.mockResolvedValueOnce(waiting);
    await user.click(screen.getByRole('button', { name: 'Tiếp tục' }));
    expect(lastCallTo(apiMock, endpoints.addDomain).options).toEqual({
      body: { hostname: 'uudai.smilecare.vn' },
    });
    expect(router.replace).toHaveBeenCalledWith(
      `/sites/${site.id}/domain/connect?domain=${waiting.id}`,
    );
  });

  it('shows the records to add, as providers name them, and checks now', async () => {
    const user = userEvent.setup();
    renderScreen();
    expect(screen.getByRole('status')).toHaveTextContent('Đang chờ bản ghi DNS có hiệu lực');
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
    await user.click(
      await screen.findByRole('radio', { name: /Đặt uudai.smilecare.vn làm địa chỉ chính/ }),
    );
    await user.click(screen.getByRole('button', { name: 'Xong' }));
    await vi.waitFor(() => {
      expect(router.push).toHaveBeenCalledWith(`/sites/${site.id}/domain`);
    });
    expect(lastCallTo(apiMock, endpoints.setPrimaryDomain).options).toEqual({
      body: { domainId: active.id },
    });
  });
});
