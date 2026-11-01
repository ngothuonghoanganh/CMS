import { act, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { makeStore, PAGE_ID, pageDetail, SITE_ID } from './test-fixtures';
import { renderEditor } from './test-render';
import { TopBar } from './TopBar';

describe('TopBar', () => {
  it('moves the focus to the save status when "Thử lại" is pressed, as the button goes away', async () => {
    const user = userEvent.setup();
    const store = makeStore();
    const onRetrySave = vi.fn(() => {
      store.getState().markSaving();
    });
    renderEditor(
      <TopBar
        siteId={SITE_ID}
        pageId={PAGE_ID}
        onRetrySave={onRetrySave}
        onPreview={vi.fn()}
        previewPending={false}
        onOpenPublish={vi.fn()}
      />,
      { store },
    );
    act(() => {
      store.getState().markSaveFailed({ kind: 'retryable', message: 'Mất kết nối' });
    });

    await user.click(screen.getByRole('button', { name: 'Thử lại' }));
    expect(onRetrySave).toHaveBeenCalledOnce();
    expect(screen.queryByRole('button', { name: 'Thử lại' })).toBeNull();
    const status = screen
      .getAllByRole('status')
      .find((element) => element.textContent.includes('Đang lưu'));
    expect(status).toHaveFocus();
  });

  it('lets a Cộng tác viên send the draft for approval, and shows when it waits (ADR-023)', () => {
    const detail = pageDetail(undefined, {
      approval: {
        status: 'pending',
        id: '64b0000000000000000000a1',
        requestedBy: { id: '64b0000000000000000000c1', name: 'Minh' },
        revision: 3,
        note: '',
        sentAt: '2026-10-24T07:50:00.000Z',
      },
    });
    renderEditor(
      <TopBar
        siteId={SITE_ID}
        pageId={PAGE_ID}
        onRetrySave={vi.fn()}
        onPreview={vi.fn()}
        previewPending={false}
        onOpenPublish={vi.fn()}
      />,
      { store: makeStore({ role: 'contributor', detail }) },
    );
    expect(screen.getByRole('button', { name: 'Đang chờ duyệt' })).toBeInTheDocument();
    expect(screen.getByText('Chờ duyệt')).toBeInTheDocument();
  });
});
