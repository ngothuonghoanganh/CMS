import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useRef, useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { Button } from '../Button/Button';
import { Dialog } from './Dialog';

function PublishFlow() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        onClick={() => {
          setOpen(true);
        }}
      >
        Xuất bản thay đổi
      </Button>
      <Dialog
        open={open}
        onOpenChange={setOpen}
        title="Xuất bản 4 thay đổi"
        description="lên go.smilecare.vn/uu-dai-thang-11"
        footerStart="Bản v12 vẫn được lưu."
        footer={
          <>
            <Button
              variant="secondary"
              onClick={() => {
                setOpen(false);
              }}
            >
              Hủy
            </Button>
            <Button>Xuất bản v13</Button>
          </>
        }
      >
        <p>Kiểm tra trước khi xuất bản</p>
      </Dialog>
    </>
  );
}

describe('Dialog', () => {
  it('opens as a named modal dialog with description, body and footer', async () => {
    const user = userEvent.setup();
    render(<PublishFlow />);
    await user.click(screen.getByRole('button', { name: 'Xuất bản thay đổi' }));
    const dialog = screen.getByRole('dialog', { name: 'Xuất bản 4 thay đổi' });
    expect(dialog).toHaveAccessibleDescription('lên go.smilecare.vn/uu-dai-thang-11');
    expect(screen.getByText('Kiểm tra trước khi xuất bản')).toBeVisible();
    expect(screen.getByText('Bản v12 vẫn được lưu.')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Xuất bản v13' })).toBeInTheDocument();
  });

  it('closes with Escape and returns focus to the opener (opened from state)', async () => {
    const user = userEvent.setup();
    render(<PublishFlow />);
    const opener = screen.getByRole('button', { name: 'Xuất bản thay đổi' });
    await user.click(opener);
    const dialog = screen.getByRole('dialog');
    expect(dialog).toContainElement(document.activeElement as HTMLElement);

    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(opener).toHaveFocus();
  });

  it('closes with the "Đóng" button and returns focus to its trigger', async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    render(
      <Dialog
        title="Thêm section"
        size="lg"
        onOpenChange={onOpenChange}
        trigger={<button type="button">Thêm section</button>}
      >
        <p>Danh sách section</p>
      </Dialog>,
    );
    const trigger = screen.getByRole('button', { name: 'Thêm section' });
    await user.click(trigger);
    expect(screen.getByRole('dialog', { name: 'Thêm section' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Đóng' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
    expect(onOpenChange.mock.calls).toEqual([[true], [false]]);
  });

  it('traps focus inside while open', async () => {
    const user = userEvent.setup();
    render(<PublishFlow />);
    await user.click(screen.getByRole('button', { name: 'Xuất bản thay đổi' }));
    const dialog = screen.getByRole('dialog');
    for (let step = 0; step < 6; step += 1) {
      await user.tab();
      expect(dialog).toContainElement(document.activeElement as HTMLElement);
    }
  });

  it('focuses the requested element first', async () => {
    function WithSearch() {
      const searchRef = useRef<HTMLInputElement>(null);
      return (
        <Dialog
          defaultOpen
          title="Thêm section"
          initialFocusRef={searchRef}
          headerActions={<input ref={searchRef} aria-label="Tìm section" />}
        >
          <button type="button">Hero</button>
        </Dialog>
      );
    }
    render(<WithSearch />);
    expect(await screen.findByRole('textbox', { name: 'Tìm section' })).toHaveFocus();
  });
});
