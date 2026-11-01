import { act, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { makeStore, PAGE_ID, SITE_ID } from './test-fixtures';
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
});
