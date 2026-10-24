import { endpoints } from '@plp/contracts';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '../../lib/api';
import { siteFixture } from '../dashboard/test-fixtures';
import { apiError, renderWithProviders } from '../shell/test-utils';
import { RollbackPanel } from './RollbackPanel';
import { historyPage, PAGE_ID, releaseFixture, releaseId } from './test-fixtures';

vi.mock(import('../../lib/api'), async (importOriginal) => ({
  ...(await importOriginal()),
  api: vi.fn(),
}));

const apiMock = vi.mocked(api);

function renderPanel() {
  const props = {
    onCancel: vi.fn(),
    onRolledBack: vi.fn(() => Promise.resolve()),
    onConflict: vi.fn(),
  };
  renderWithProviders(
    <RollbackPanel
      site={siteFixture()}
      page={historyPage()}
      release={releaseFixture(11)}
      liveReleaseId={releaseId(12)}
      {...props}
    />,
  );
  return props;
}

function confirmButton(): HTMLElement {
  return screen.getByRole('button', { name: 'Khôi phục v11' });
}

beforeEach(() => {
  apiMock.mockReset();
});

describe('RollbackPanel', () => {
  it('explains what changes and focuses its heading', () => {
    renderPanel();
    const heading = screen.getByRole('heading', { name: 'Khôi phục v11 thành bản live?' });
    expect(heading).toHaveFocus();
    expect(screen.getByText('v12 · 24/10')).toBeInTheDocument();
    expect(screen.getByText('v11 · 21/10')).toBeInTheDocument();
    expect(screen.getByText('smilecare.payload.site/uu-dai-thang-11')).toBeInTheDocument();
    expect(screen.getByText('Bản nháp hiện tại (4 thay đổi) được giữ nguyên.')).toBeInTheDocument();
    expect(
      screen.getByText('v12 vẫn nằm trong lịch sử, bạn có thể hoàn tác ngay sau đó.'),
    ).toBeInTheDocument();
  });

  it('requires a reason before rolling back', async () => {
    const user = userEvent.setup();
    renderPanel();

    expect(confirmButton()).toBeDisabled();
    expect(confirmButton()).toHaveAccessibleDescription('Nhập lý do để tiếp tục.');
    await user.type(screen.getByRole('textbox', { name: /Lý do/ }), '   ');
    expect(confirmButton()).toBeDisabled();
    await user.type(screen.getByRole('textbox', { name: /Lý do/ }), 'Giá mới chưa duyệt');
    expect(confirmButton()).toBeEnabled();
  });

  it('moves the pointer to the release, expecting the live one, with the trimmed reason', async () => {
    const user = userEvent.setup();
    const props = renderPanel();
    const result = {
      activityId: '64b0000000000000000000f1',
      page: historyPage(),
      revalidation: 'ok',
    };
    apiMock.mockResolvedValueOnce(result);

    await user.type(screen.getByRole('textbox', { name: /Lý do/ }), '  Giá mới chưa duyệt ');
    await user.click(confirmButton());

    await vi.waitFor(() => {
      expect(props.onRolledBack).toHaveBeenCalledWith(result);
    });
    expect(apiMock).toHaveBeenCalledWith(endpoints.movePointer, [PAGE_ID], {
      body: {
        targetReleaseId: releaseId(11),
        expectedCurrentReleaseId: releaseId(12),
        reason: 'Giá mới chưa duyệt',
      },
    });
  });

  it('shows the server message and asks for a refresh when the live page changed', async () => {
    const user = userEvent.setup();
    const props = renderPanel();
    apiMock.mockRejectedValueOnce(
      apiError(409, 'pointer_conflict', 'Trang live vừa được thay đổi bởi một thao tác khác'),
    );

    await user.type(screen.getByRole('textbox', { name: /Lý do/ }), 'Giá mới chưa duyệt');
    await user.click(confirmButton());

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Trang live vừa được thay đổi bởi một thao tác khác',
    );
    expect(props.onConflict).toHaveBeenCalledTimes(1);
    expect(props.onRolledBack).not.toHaveBeenCalled();
  });

  it('cancels without calling the server', async () => {
    const user = userEvent.setup();
    const props = renderPanel();
    await user.click(screen.getByRole('button', { name: 'Hủy' }));
    expect(props.onCancel).toHaveBeenCalledTimes(1);
    expect(apiMock).not.toHaveBeenCalled();
  });
});
