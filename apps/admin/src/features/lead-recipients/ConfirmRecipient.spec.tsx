import { endpoints } from '@plp/contracts';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '../../lib/api';
import { apiError, lastCallTo, renderWithProviders } from '../shell/test-utils';
import { ConfirmRecipient } from './ConfirmRecipient';

vi.mock(import('../../lib/api'), async (importOriginal) => ({
  ...(await importOriginal()),
  api: vi.fn(),
}));

const apiMock = vi.mocked(api);
const TOKEN = 'a'.repeat(43);

beforeEach(() => {
  apiMock.mockReset();
  window.history.replaceState(null, '', `/lead-recipients/confirm#token=${TOKEN}`);
});

describe('ConfirmRecipient', () => {
  it('confirms only on a click, then removes the secret from the address bar', async () => {
    const user = userEvent.setup();
    apiMock.mockResolvedValue({ siteName: 'Nha khoa Smile Care', email: 'sales@smilecare.vn' });
    renderWithProviders(<ConfirmRecipient />);
    expect(apiMock).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Xác nhận nhận lead' }));

    expect(lastCallTo(apiMock, endpoints.confirmLeadRecipient).options).toEqual({
      body: { token: TOKEN },
    });
    expect(await screen.findByRole('status')).toHaveTextContent(
      'sales@smilecare.vn sẽ nhận email khi có lead mới từ Nha khoa Smile Care.',
    );
    expect(window.location.hash).toBe('');
  });

  it('explains a used or expired link', async () => {
    const user = userEvent.setup();
    apiMock.mockRejectedValue(apiError(404, 'not_found', 'Liên kết xác nhận không còn hiệu lực'));
    renderWithProviders(<ConfirmRecipient />);
    await user.click(screen.getByRole('button', { name: 'Xác nhận nhận lead' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Liên kết xác nhận không còn hiệu lực',
    );
  });

  it('asks to open the email again when the link lost its secret', () => {
    window.history.replaceState(null, '', '/lead-recipients/confirm#token=ngan');
    renderWithProviders(<ConfirmRecipient />);
    expect(screen.getByText('Liên kết không đầy đủ')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Xác nhận nhận lead' })).not.toBeInTheDocument();
  });
});
