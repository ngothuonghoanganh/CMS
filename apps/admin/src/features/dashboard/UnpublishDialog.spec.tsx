import { endpoints } from '@plp/contracts';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useRef, useState } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '../../lib/api';
import { apiError, createTestQueryClient, renderWithProviders } from '../shell/test-utils';
import { pageFixture, SITE_ID } from './test-fixtures';
import { type UnpublishablePage, unpublishable, UnpublishDialog } from './UnpublishDialog';

vi.mock(import('../../lib/api'), async (importOriginal) => ({
  ...(await importOriginal()),
  api: vi.fn(),
}));

const apiMock = vi.mocked(api);

function livePage(): UnpublishablePage {
  const page = unpublishable(pageFixture({ title: 'Tri ân khách hàng 2025' }));
  if (page === null) {
    throw new Error('fixture must be live');
  }
  return page;
}

function Harness({ page, onUnpublished }: { page: UnpublishablePage; onUnpublished?: () => void }) {
  const [open, setOpen] = useState(true);
  return (
    <>
      <p>{open ? 'dialog open' : 'dialog closed'}</p>
      <UnpublishDialog
        page={page}
        open={open}
        onOpenChange={setOpen}
        onUnpublished={onUnpublished}
      />
    </>
  );
}

/** Opened from a button that only a live page shows, as in a page's header. */
function LiveOnlyOpener({ page }: { page: UnpublishablePage }) {
  const titleRef = useRef<HTMLHeadingElement>(null);
  const [live, setLive] = useState(true);
  const [open, setOpen] = useState(false);
  return (
    <>
      <h1 ref={titleRef} tabIndex={-1}>
        {page.title}
      </h1>
      {live ? (
        <button
          type="button"
          onClick={() => {
            setOpen(true);
          }}
        >
          Gỡ trang này
        </button>
      ) : null}
      <UnpublishDialog
        page={page}
        open={open}
        onOpenChange={setOpen}
        onUnpublished={() => {
          setLive(false);
        }}
        fallbackFocusRef={titleRef}
      />
    </>
  );
}

function confirmButton(): HTMLElement {
  const dialog = screen.getByRole('alertdialog');
  const buttons = within(dialog).getAllByRole('button', { name: 'Gỡ xuất bản' });
  const last = buttons.at(-1);
  if (last === undefined) {
    throw new Error('confirm button missing');
  }
  return last;
}

beforeEach(() => {
  apiMock.mockReset();
});

describe('UnpublishDialog', () => {
  it('requires a reason before unpublishing', async () => {
    const user = userEvent.setup();
    renderWithProviders(<Harness page={livePage()} />);

    expect(
      screen.getByRole('alertdialog', { name: 'Gỡ xuất bản “Tri ân khách hàng 2025”?' }),
    ).toBeInTheDocument();
    const reason = screen.getByRole('textbox', { name: 'Lý do · ghi vào nhật ký hoạt động' });
    expect(reason).toHaveFocus();
    expect(confirmButton()).toBeDisabled();
    expect(screen.getByText('Nhập lý do để tiếp tục.')).toBeInTheDocument();

    await user.type(reason, '   ');
    expect(confirmButton()).toBeDisabled();
    expect(apiMock).not.toHaveBeenCalled();
  });

  it('moves the live pointer to nothing, expecting the current live release', async () => {
    const user = userEvent.setup();
    const page = livePage();
    const onUnpublished = vi.fn();
    apiMock.mockResolvedValueOnce({ activityId: '64b000000000000000000401', revalidation: 'ok' });
    const queryClient = createTestQueryClient();
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries');
    renderWithProviders(<Harness page={page} onUnpublished={onUnpublished} />, queryClient);

    await user.type(
      screen.getByRole('textbox', { name: 'Lý do · ghi vào nhật ký hoạt động' }),
      ' Chương trình đã kết thúc ',
    );
    await user.click(confirmButton());

    expect(apiMock).toHaveBeenCalledWith(endpoints.movePointer, [page.id], {
      body: {
        targetReleaseId: null,
        expectedCurrentReleaseId: page.liveRelease.id,
        reason: 'Chương trình đã kết thúc',
      },
    });
    expect(await screen.findByText('dialog closed')).toBeInTheDocument();
    expect(screen.getByText('Đã gỡ xuất bản “Tri ân khách hàng 2025”')).toBeInTheDocument();
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['sites', SITE_ID] });
    expect(onUnpublished).toHaveBeenCalledOnce();
  });

  it('explains a conflict, refreshes the list and closes', async () => {
    const user = userEvent.setup();
    apiMock.mockRejectedValueOnce(
      apiError(409, 'pointer_conflict', 'Trang live vừa được thay đổi bởi một thao tác khác'),
    );
    const queryClient = createTestQueryClient();
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries');
    renderWithProviders(<Harness page={livePage()} />, queryClient);

    await user.type(
      screen.getByRole('textbox', { name: 'Lý do · ghi vào nhật ký hoạt động' }),
      'Hết ưu đãi',
    );
    await user.click(confirmButton());

    expect(await screen.findByText('dialog closed')).toBeInTheDocument();
    expect(screen.getByText('Trang live vừa thay đổi')).toBeInTheDocument();
    expect(
      screen.getByText(
        'Trang live vừa được thay đổi bởi một thao tác khác. Danh sách đã được tải lại, hãy kiểm tra rồi thử lại.',
      ),
    ).toBeInTheDocument();
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['sites', SITE_ID] });
  });

  it('keeps the dialog open with the error when the server fails', async () => {
    const user = userEvent.setup();
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    apiMock.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    renderWithProviders(<Harness page={livePage()} />);

    await user.type(
      screen.getByRole('textbox', { name: 'Lý do · ghi vào nhật ký hoạt động' }),
      'Hết ưu đãi',
    );
    await user.click(confirmButton());

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Không kết nối được máy chủ. Kiểm tra kết nối mạng rồi thử lại.',
    );
    expect(screen.getByText('dialog open')).toBeInTheDocument();
  });

  it('hands the focus to the fallback when unpublishing removed what opened the dialog', async () => {
    const user = userEvent.setup();
    apiMock.mockResolvedValueOnce({ activityId: '64b000000000000000000401', revalidation: 'ok' });
    renderWithProviders(<LiveOnlyOpener page={livePage()} />);

    await user.click(screen.getByRole('button', { name: 'Gỡ trang này' }));
    await user.type(
      screen.getByRole('textbox', { name: 'Lý do · ghi vào nhật ký hoạt động' }),
      'Hết ưu đãi',
    );
    await user.click(confirmButton());

    await waitFor(() => {
      expect(screen.queryByRole('alertdialog')).toBeNull();
    });
    expect(screen.queryByRole('button', { name: 'Gỡ trang này' })).toBeNull();
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Tri ân khách hàng 2025' })).toHaveFocus();
    });
  });
});
