import { endpoints } from '@plp/contracts';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '../../lib/api';
import { siteFixture } from '../dashboard/test-fixtures';
import { apiError, lastCallTo, renderWithProviders } from '../shell/test-utils';
import { DomainsScreen } from './DomainsScreen';
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

const primary = domainFixture({ primary: true });
const apex = domainFixture({
  id: '64b0000000000000000000f2',
  hostname: 'smilecare.vn',
  kind: 'apex',
});
const broken = domainFixture({
  id: '64b0000000000000000000f3',
  hostname: 'uudai.smilecare.vn',
  status: 'misconfigured',
  httpsValidUntil: null,
  activeSince: null,
  found: [{ type: 'A', value: '103.97.125.18' }],
  records: [
    { type: 'CNAME', name: 'uudai.smilecare.vn', value: 'cname.payload.site', state: 'wrong' },
    {
      type: 'TXT',
      name: '_payload.uudai.smilecare.vn',
      value: 'payload-verify=8f3a2c91e07b4d5aa1b2c3d4e5f60718',
      state: 'ok',
    },
  ],
});

function renderScreen(list = domainList([primary, apex, broken], primary.id)) {
  apiMock.mockResolvedValue(list);
  return renderWithProviders(<DomainsScreen site={site} initial={list} loadedAt={LOADED_AT} />);
}

beforeEach(() => {
  apiMock.mockReset();
  router.refresh.mockReset();
});

describe('DomainsScreen', () => {
  it('lists every address with its status, HTTPS and what can be done', () => {
    renderScreen();
    expect(screen.getByRole('heading', { name: '4 địa chỉ' })).toBeInTheDocument();
    const rows = screen
      .getAllByRole('listitem')
      .filter((item) => item.closest('ul')?.parentElement?.tagName === 'SECTION');
    expect(rows).toHaveLength(4);
    expect(rows[0]).toHaveTextContent('go.smilecare.vnĐỊA CHỈ CHÍNH');
    expect(rows[0]).toHaveTextContent('HTTPS hợp lệ tới 12/01/2027');
    // Each row says what the last check saw, as board 14 does (ADR-022).
    expect(rows[0]).toHaveTextContent('Kết nối từ 14/10/2026 bởi Ngọc Anh.');
    expect(rows[1]).toHaveTextContent('Tên miền gốc · đang chuyển hướng → go.smilecare.vn');
    expect(rows[2]).toHaveTextContent('Cấu hình sai');
    expect(rows[2]).toHaveTextContent('Đang có bản ghi A, cần đổi sang CNAME.');
    expect(screen.getByRole('link', { name: 'Sửa cấu hình uudai.smilecare.vn' })).toHaveAttribute(
      'href',
      `/sites/${site.id}/domain/connect?domain=${broken.id}`,
    );
    // The primary address cannot be disconnected.
    expect(screen.queryByRole('button', { name: 'Ngắt kết nối go.smilecare.vn' })).toBeNull();
    expect(rows[3]).toHaveTextContent('smilecare.payload.siteMẶC ĐỊNH');
  });

  it('makes an active domain primary after saying what changes', async () => {
    const user = userEvent.setup();
    renderScreen();
    await user.click(screen.getByRole('button', { name: 'Đặt smilecare.vn làm địa chỉ chính' }));
    const dialog = screen.getByRole('alertdialog', { name: 'Đặt smilecare.vn làm địa chỉ chính?' });
    expect(dialog).toHaveTextContent(
      '6 trang đang live sẽ có địa chỉ mới, ví dụ smilecare.vn/uu-dai-nieng-rang.',
    );
    expect(dialog).toHaveTextContent(
      'Link cũ trên go.smilecare.vn vẫn mở được, tự chuyển hướng 301 sang địa chỉ mới.',
    );
    apiMock.mockResolvedValueOnce(
      domainList(
        [
          { ...primary, primary: false },
          { ...apex, primary: true },
        ],
        apex.id,
      ),
    );
    await user.click(
      within(dialog).getByRole('button', { name: 'Đặt smilecare.vn làm địa chỉ chính' }),
    );
    expect(lastCallTo(apiMock, endpoints.setPrimaryDomain)).toEqual({
      args: [site.id],
      options: { body: { domainId: apex.id } },
    });
    expect(router.refresh).toHaveBeenCalled();
  });

  it('warns when the primary address is lost, and offers the default one meanwhile', async () => {
    const user = userEvent.setup();
    renderScreen(
      domainList(
        [{ ...primary, status: 'lost', lostSince: '2026-11-01T01:12:00.000Z' }],
        primary.id,
      ),
    );
    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('Địa chỉ chính go.smilecare.vn đang không truy cập được');
    expect(alert).toHaveTextContent('Các trang vẫn mở được qua smilecare.payload.site');
    apiMock.mockResolvedValueOnce(domainList([primary], null));
    await user.click(within(alert).getByRole('button', { name: 'Tạm dùng địa chỉ mặc định' }));
    expect(lastCallTo(apiMock, endpoints.setPrimaryDomain).options).toEqual({
      body: { domainId: null },
    });
  });

  it('says when the default address could not be used, and opens the next dialog without it', async () => {
    const user = userEvent.setup();
    renderScreen(
      domainList(
        [
          { ...primary, status: 'lost', lostSince: '2026-11-01T01:12:00.000Z' },
          { ...apex, primary: false },
        ],
        primary.id,
      ),
    );
    apiMock.mockRejectedValueOnce(apiError(409, 'conflict', 'Địa chỉ chính vừa đổi'));
    await user.click(screen.getByRole('button', { name: 'Tạm dùng địa chỉ mặc định' }));
    expect(await screen.findByText('Chưa đổi được địa chỉ chính')).toBeInTheDocument();
    expect(screen.getByText('Địa chỉ chính vừa đổi')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Đặt smilecare.vn làm địa chỉ chính' }));
    const dialog = screen.getByRole('alertdialog', { name: 'Đặt smilecare.vn làm địa chỉ chính?' });
    expect(within(dialog).queryByRole('alert')).not.toBeInTheDocument();
  });

  it('disconnects a domain that is not primary', async () => {
    const user = userEvent.setup();
    renderScreen();
    await user.click(screen.getByRole('button', { name: 'Ngắt kết nối uudai.smilecare.vn' }));
    const dialog = screen.getByRole('alertdialog', { name: 'Ngắt kết nối uudai.smilecare.vn?' });
    expect(dialog).toHaveTextContent(
      'Bạn nên xóa bản ghi CNAME uudai tại nhà cung cấp tên miền sau khi ngắt.',
    );
    expect(within(dialog).getByRole('button', { name: 'Giữ kết nối' })).toBeInTheDocument();
    apiMock.mockResolvedValueOnce(undefined);
    await user.click(within(dialog).getByRole('button', { name: 'Ngắt kết nối' }));
    expect(lastCallTo(apiMock, endpoints.removeDomain).args).toEqual([site.id, broken.id]);
  });

  it('starts from the default address when there is no custom domain', () => {
    renderScreen(domainList([]));
    expect(screen.getByRole('heading', { name: 'Địa chỉ của site' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Chưa có tên miền riêng' })).toBeInTheDocument();
    // The header's and the empty state's, as on board 13.
    const links = screen.getAllByRole('link', { name: 'Kết nối tên miền riêng' });
    expect(links).toHaveLength(2);
    for (const link of links) {
      expect(link).toHaveAttribute('href', `/sites/${site.id}/domain/connect`);
    }
  });

  it('says how many live pages move when the default address becomes primary again', async () => {
    const user = userEvent.setup();
    renderScreen(domainList([primary], primary.id, { count: 1, exampleSlug: '' }));
    await user.click(
      screen.getByRole('button', { name: 'Đặt smilecare.payload.site làm địa chỉ chính' }),
    );
    const dialog = screen.getByRole('alertdialog', {
      name: 'Đặt smilecare.payload.site làm địa chỉ chính?',
    });
    expect(dialog).toHaveTextContent(
      '1 trang đang live sẽ có địa chỉ mới, ví dụ smilecare.payload.site.',
    );
    // Nothing redirects to the default address (ADR-022): the custom domain keeps serving.
    expect(dialog).toHaveTextContent(
      'go.smilecare.vn vẫn mở các trang như trước, không chuyển hướng sang địa chỉ mặc định.',
    );
    expect(dialog).toHaveTextContent('Sitemap và thẻ canonical chuyển sang địa chỉ mặc định.');
    expect(dialog).not.toHaveTextContent(/301|chuyển hướng thừa/);
  });
});
