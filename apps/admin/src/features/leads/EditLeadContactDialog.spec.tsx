import { endpoints, LEAD_PHONE_MESSAGE } from '@plp/contracts';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '../../lib/api';
import { apiError, lastCallTo, renderWithProviders } from '../shell/test-utils';
import { EditLeadContactDialog } from './EditLeadContactDialog';
import { LEAD_ID, leadDetail } from './test-fixtures';

vi.mock(import('../../lib/api'), async (importOriginal) => ({
  ...(await importOriginal()),
  api: vi.fn(),
}));

const apiMock = vi.mocked(api);

function renderDialog() {
  const onSaved = vi.fn();
  const onGone = vi.fn();
  renderWithProviders(
    <EditLeadContactDialog
      lead={leadDetail()}
      open
      onOpenChange={vi.fn()}
      onSaved={onSaved}
      onGone={onGone}
    />,
  );
  return { dialog: screen.getByRole('dialog', { name: 'Sửa thông tin' }), onSaved, onGone };
}

beforeEach(() => {
  apiMock.mockReset();
});

describe('EditLeadContactDialog', () => {
  it('starts from the lead as it is and saves the corrected contact', async () => {
    const user = userEvent.setup();
    const saved = leadDetail({ phone: '+84901234568', email: null });
    apiMock.mockResolvedValue(saved);
    const { dialog, onSaved } = renderDialog();
    const phone = within(dialog).getByRole('textbox', { name: /Số điện thoại/ });
    expect(within(dialog).getByRole('textbox', { name: /Họ và tên/ })).toHaveValue('Nguyễn Thu Hà');
    expect(phone).toHaveValue('0901 234 567');
    expect(within(dialog).getByRole('textbox', { name: /Email/ })).toHaveValue('thuha@example.com');

    await user.clear(phone);
    await user.type(phone, '0901 234 568');
    await user.clear(within(dialog).getByRole('textbox', { name: /Email/ }));
    await user.click(within(dialog).getByRole('button', { name: 'Lưu thông tin' }));

    expect(lastCallTo(apiMock, endpoints.updateLeadContact)).toEqual({
      args: [LEAD_ID],
      options: { body: { name: 'Nguyễn Thu Hà', phone: '0901 234 568', email: '' } },
    });
    expect(onSaved).toHaveBeenCalledWith(saved);
  });

  it('keeps a phone number a form would refuse, and says why', async () => {
    const user = userEvent.setup();
    const { dialog } = renderDialog();
    const phone = within(dialog).getByRole('textbox', { name: /Số điện thoại/ });
    await user.clear(phone);
    await user.type(phone, '12345');
    await user.click(within(dialog).getByRole('button', { name: 'Lưu thông tin' }));

    expect(phone).toHaveAccessibleDescription(expect.stringContaining(LEAD_PHONE_MESSAGE));
    expect(phone).toHaveFocus();
    expect(apiMock).not.toHaveBeenCalled();
  });

  it('closes the lead when it was deleted meanwhile', async () => {
    const user = userEvent.setup();
    apiMock.mockRejectedValue(apiError(404, 'not_found', 'Không tìm thấy lead'));
    const { dialog, onGone } = renderDialog();
    await user.click(within(dialog).getByRole('button', { name: 'Lưu thông tin' }));
    await vi.waitFor(() => {
      expect(onGone).toHaveBeenCalled();
    });
  });
});
