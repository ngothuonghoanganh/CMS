import { endpoints } from '@plp/contracts';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '../../lib/api';
import { apiError, lastCallTo, renderWithProviders } from '../shell/test-utils';
import { CreateSiteForm } from './CreateSiteForm';

const { router } = vi.hoisted(() => ({
  router: { push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() },
}));

vi.mock('next/navigation', () => ({ useRouter: () => router }));

vi.mock(import('../../lib/api'), async (importOriginal) => ({
  ...(await importOriginal()),
  api: vi.fn(),
}));

const apiMock = vi.mocked(api);
const WORKSPACE_ID = '64b0000000000000000000a1';
const TEMPLATE = 'https://{subdomain}.payload.site';

function availability(subdomain: string, available: boolean, message: string | null = null) {
  return {
    subdomain,
    available,
    reason: available ? null : ('taken' as const),
    message,
  };
}

function renderForm() {
  return renderWithProviders(
    <CreateSiteForm workspaceId={WORKSPACE_ID} originTemplate={TEMPLATE} cancelHref="/sites/x" />,
  );
}

beforeEach(() => {
  apiMock.mockReset();
  router.push.mockReset();
});

describe('CreateSiteForm', () => {
  it('suggests the subdomain from the site name and shows the default address', async () => {
    const user = userEvent.setup();
    apiMock.mockResolvedValue(availability('nha-khoa-smile-care', true));
    renderForm();

    await user.type(screen.getByRole('textbox', { name: 'Tên site' }), 'Nha khoa Smile Care');

    const subdomain = screen.getByRole('textbox', { name: 'Tên miền con' });
    expect(subdomain).toHaveValue('nha-khoa-smile-care');
    expect(subdomain).toHaveAccessibleDescription(
      expect.stringContaining('nha-khoa-smile-care.payload.site'),
    );
    expect(await screen.findByText('Tên miền con này dùng được.')).toBeInTheDocument();
    const call = lastCallTo(apiMock, endpoints.subdomainAvailability);
    expect(call.options).toHaveProperty('query', { subdomain: 'nha-khoa-smile-care' });
    expect(apiMock).toHaveBeenCalledOnce();
  });

  it('stops following the name once the subdomain is edited, and shows why a name is taken', async () => {
    const user = userEvent.setup();
    apiMock.mockResolvedValue(
      availability('smilecare', false, 'Tên miền con này đã có site khác dùng'),
    );
    renderForm();
    const subdomain = screen.getByRole('textbox', { name: 'Tên miền con' });

    await user.type(subdomain, 'SmileCare');
    await user.type(screen.getByRole('textbox', { name: 'Tên site' }), 'Nha khoa Smile Care');

    expect(subdomain).toHaveValue('smilecare');
    await vi.waitFor(() => {
      expect(subdomain).toHaveAccessibleDescription(
        expect.stringContaining('Tên miền con này đã có site khác dùng'),
      );
    });
    expect(subdomain).toHaveAttribute('aria-invalid', 'true');

    await user.click(screen.getByRole('button', { name: 'Tạo site' }));
    expect(subdomain).toHaveFocus();
    expect(apiMock).not.toHaveBeenCalledWith(
      endpoints.createSite,
      expect.anything(),
      expect.anything(),
    );
  });

  it('explains a reserved or malformed subdomain without asking the server', async () => {
    const user = userEvent.setup();
    renderForm();
    const subdomain = screen.getByRole('textbox', { name: 'Tên miền con' });

    await user.type(subdomain, 'admin');

    await vi.waitFor(() => {
      expect(subdomain).toHaveAccessibleDescription(
        expect.stringContaining('Tên này được hệ thống giữ lại, hãy chọn tên khác'),
      );
    });
    expect(apiMock).not.toHaveBeenCalled();
  });

  it('creates the site with the chosen theme and opens it', async () => {
    const user = userEvent.setup();
    apiMock.mockImplementation((endpoint) =>
      Promise.resolve(
        endpoint === endpoints.createSite
          ? { id: '64b000000000000000000009' }
          : availability('smile-care', true),
      ),
    );
    renderForm();

    await user.type(screen.getByRole('textbox', { name: 'Tên site' }), 'Smile Care');
    await user.click(screen.getByRole('radio', { name: 'Chàm' }));
    await screen.findByText('Tên miền con này dùng được.');
    await user.click(screen.getByRole('button', { name: 'Tạo site' }));

    await vi.waitFor(() => {
      expect(router.push).toHaveBeenCalledWith('/sites/64b000000000000000000009');
    });
    expect(apiMock).toHaveBeenCalledWith(endpoints.createSite, [WORKSPACE_ID], {
      body: { name: 'Smile Care', subdomain: 'smile-care', themePresetId: 'indigo' },
    });
  });

  it('shows a subdomain the server rejects on its field', async () => {
    const user = userEvent.setup();
    apiMock.mockResolvedValueOnce(availability('smile-care', true));
    apiMock.mockRejectedValueOnce(
      apiError(409, 'subdomain_taken', 'Tên miền con này đã có site khác dùng', [
        {
          path: ['subdomain'],
          code: 'subdomain_taken',
          message: 'Tên miền con này đã có site khác dùng',
        },
      ]),
    );
    renderForm();

    await user.type(screen.getByRole('textbox', { name: 'Tên site' }), 'Smile Care');
    await screen.findByText('Tên miền con này dùng được.');
    await user.click(screen.getByRole('button', { name: 'Tạo site' }));

    const subdomain = screen.getByRole('textbox', { name: 'Tên miền con' });
    await vi.waitFor(() => {
      expect(subdomain).toHaveAccessibleDescription(
        expect.stringContaining('Tên miền con này đã có site khác dùng'),
      );
    });
    expect(router.push).not.toHaveBeenCalled();
  });
});
