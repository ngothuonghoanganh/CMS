import { endpoints, type LeadRecipient } from '@plp/contracts';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '../../lib/api';
import { apiError, lastCallTo, renderWithProviders } from '../shell/test-utils';
import { LeadRecipientsDialog } from './LeadRecipientsDialog';
import { SITE_ID } from './test-fixtures';

vi.mock(import('../../lib/api'), async (importOriginal) => ({
  ...(await importOriginal()),
  api: vi.fn(),
}));

const apiMock = vi.mocked(api);

function recipient(overrides: Partial<LeadRecipient> = {}): LeadRecipient {
  return {
    id: '64b000000000000000000501',
    email: 'sales@smilecare.vn',
    status: 'confirmed',
    invitedAt: '2026-10-24T08:00:00.000Z',
    confirmedAt: '2026-10-24T08:05:00.000Z',
    ...overrides,
  };
}

const confirmed = recipient();
const pending = recipient({
  id: '64b000000000000000000502',
  email: 'le-tan@smilecare.vn',
  status: 'pending',
  confirmedAt: null,
});

function serve(items: LeadRecipient[]) {
  apiMock.mockImplementation((endpoint, _args, options) => {
    if (endpoint === endpoints.listLeadRecipients) {
      return Promise.resolve({ items });
    }
    if (endpoint === endpoints.addLeadRecipient) {
      const body = options?.body as { email: string } | undefined;
      return Promise.resolve(
        recipient({ id: '64b000000000000000000503', email: body?.email ?? '', status: 'pending' }),
      );
    }
    if (endpoint === endpoints.resendLeadRecipient) {
      return Promise.resolve({ ...pending, status: 'pending' });
    }
    if (endpoint === endpoints.removeLeadRecipient) {
      return Promise.resolve(undefined);
    }
    return Promise.reject(new Error('unexpected call'));
  });
}

function renderDialog(canManage = true) {
  return renderWithProviders(
    <LeadRecipientsDialog siteId={SITE_ID} open onOpenChange={vi.fn()} canManage={canManage} />,
  );
}

beforeEach(() => {
  apiMock.mockReset();
});

describe('LeadRecipientsDialog', () => {
  it('lists the addresses with where each one stands', async () => {
    serve([confirmed, pending]);
    renderDialog();
    const dialog = screen.getByRole('dialog', { name: 'Nơi nhận lead' });
    const list = await within(dialog).findByRole('list', { name: 'Các email nhận lead' });
    const [first, second] = within(list).getAllByRole('listitem');
    expect(first).toHaveTextContent('sales@smilecare.vnĐã xác nhận');
    expect(second).toHaveTextContent('le-tan@smilecare.vnChờ xác nhận');
    // A confirmed address needs no new link.
    expect(
      within(dialog).queryByRole('button', { name: 'Gửi lại thư xác nhận tới sales@smilecare.vn' }),
    ).not.toBeInTheDocument();
    expect(
      within(dialog).getByRole('button', { name: 'Gửi lại thư xác nhận tới le-tan@smilecare.vn' }),
    ).toBeInTheDocument();
  });

  it('adds an address and says a confirmation email went out', async () => {
    const user = userEvent.setup();
    serve([]);
    renderDialog();
    expect(await screen.findByText(/Chưa có email nào/)).toBeInTheDocument();

    await user.type(
      screen.getByRole('textbox', { name: 'Thêm email nhận lead' }),
      'nv@smilecare.vn',
    );
    await user.click(screen.getByRole('button', { name: 'Thêm' }));

    await vi.waitFor(() => {
      expect(lastCallTo(apiMock, endpoints.addLeadRecipient).options).toHaveProperty('body', {
        email: 'nv@smilecare.vn',
      });
    });
    expect(await screen.findByText('Đã gửi thư xác nhận tới nv@smilecare.vn')).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Thêm email nhận lead' })).toHaveValue('');
  });

  it('shows why an address was refused next to the field', async () => {
    const user = userEvent.setup();
    serve([confirmed]);
    apiMock.mockImplementation((endpoint) =>
      endpoint === endpoints.addLeadRecipient
        ? Promise.reject(apiError(409, 'recipient_exists', 'Địa chỉ này đã có trong nơi nhận lead'))
        : Promise.resolve({ items: [confirmed] }),
    );
    renderDialog();
    await user.type(
      screen.getByRole('textbox', { name: 'Thêm email nhận lead' }),
      'sales@smilecare.vn',
    );
    await user.click(screen.getByRole('button', { name: 'Thêm' }));
    expect(await screen.findByText('Địa chỉ này đã có trong nơi nhận lead')).toBeInTheDocument();
    const field = screen.getByRole('textbox', { name: 'Thêm email nhận lead' });
    expect(field).toHaveAttribute('aria-invalid', 'true');
    // Focus returns to the field, which reads its error out.
    expect(field).toHaveFocus();
    expect(field).toHaveAccessibleDescription(/Địa chỉ này đã có trong nơi nhận lead/);
  });

  it('asks for an address when "Thêm" is pressed with an empty field', async () => {
    const user = userEvent.setup();
    serve([]);
    renderDialog();
    await user.click(screen.getByRole('button', { name: 'Thêm' }));
    const field = screen.getByRole('textbox', { name: 'Thêm email nhận lead' });
    expect(field).toHaveFocus();
    expect(field).toHaveAccessibleDescription(/Nhập email nhận lead/);
    expect(apiMock).not.toHaveBeenCalledWith(
      endpoints.addLeadRecipient,
      expect.anything(),
      expect.anything(),
    );
  });

  it('sends a new link and removes an address', async () => {
    const user = userEvent.setup();
    serve([confirmed, pending]);
    renderDialog();
    await user.click(
      await screen.findByRole('button', { name: 'Gửi lại thư xác nhận tới le-tan@smilecare.vn' }),
    );
    await vi.waitFor(() => {
      expect(lastCallTo(apiMock, endpoints.resendLeadRecipient).args).toEqual([
        SITE_ID,
        pending.id,
      ]);
    });
    await user.click(
      screen.getByRole('button', { name: 'Bỏ sales@smilecare.vn khỏi nơi nhận lead' }),
    );
    await vi.waitFor(() => {
      expect(lastCallTo(apiMock, endpoints.removeLeadRecipient).args).toEqual([
        SITE_ID,
        confirmed.id,
      ]);
    });
    expect(
      await screen.findByText('Đã bỏ sales@smilecare.vn khỏi nơi nhận lead'),
    ).toBeInTheDocument();
  });

  it('shows editors the addresses without the controls only the owner has', async () => {
    serve([confirmed, pending]);
    renderDialog(false);
    expect(await screen.findByRole('list', { name: 'Các email nhận lead' })).toBeInTheDocument();
    expect(screen.queryByRole('textbox', { name: 'Thêm email nhận lead' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Bỏ / })).not.toBeInTheDocument();
    expect(
      screen.getByText('Chỉ Owner của workspace được thay đổi nơi nhận lead.'),
    ).toBeInTheDocument();
  });

  it('stops adding at five addresses', async () => {
    serve(
      Array.from({ length: 5 }, (_, index) =>
        recipient({ id: `64b00000000000000000060${index}`, email: `nv${index}@smilecare.vn` }),
      ),
    );
    renderDialog();
    expect(await screen.findByText('Đã đủ 5 địa chỉ. Bỏ một địa chỉ để thêm.')).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Thêm email nhận lead' })).toBeDisabled();
  });
});
