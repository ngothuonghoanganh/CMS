import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useRef, useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { Button } from '../Button/Button';
import { ToastProvider, useToast } from '../Toast/Toast';
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

  it('covers the window with a back arrow that closes it too (board 39)', async () => {
    const user = userEvent.setup();
    render(
      <Dialog
        title="Phong cách chuyển động"
        size="full"
        backLabel="Quay lại cài đặt trang"
        trigger={<button type="button">So sánh</button>}
      >
        <p>Sáu phong cách</p>
      </Dialog>,
    );
    const trigger = screen.getByRole('button', { name: 'So sánh' });
    await user.click(trigger);
    expect(screen.getByRole('button', { name: 'Đóng' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Quay lại cài đặt trang' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it('returns focus to the element that opened it, not to its trigger', async () => {
    const user = userEvent.setup();
    function TwoOpeners() {
      const [open, setOpen] = useState(false);
      return (
        <>
          <Button
            onClick={() => {
              setOpen(true);
            }}
          >
            Thêm section ở đây
          </Button>
          <Dialog
            open={open}
            onOpenChange={setOpen}
            title="Thêm section"
            trigger={<button type="button">Thêm section</button>}
          >
            <p>Danh sách section</p>
          </Dialog>
        </>
      );
    }
    render(<TwoOpeners />);
    const opener = screen.getByRole('button', { name: 'Thêm section ở đây' });
    await user.click(opener);
    await user.keyboard('{Escape}');

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(opener).toHaveFocus();
  });

  it('returns focus to the opener after focusing a requested element inside', async () => {
    const user = userEvent.setup();
    function WithSearchOpened() {
      const [open, setOpen] = useState(false);
      const searchRef = useRef<HTMLInputElement>(null);
      return (
        <>
          <Button
            onClick={() => {
              setOpen(true);
            }}
          >
            Thêm section
          </Button>
          <Dialog
            open={open}
            onOpenChange={setOpen}
            title="Thêm section"
            initialFocusRef={searchRef}
            headerActions={<input ref={searchRef} aria-label="Tìm section" />}
          >
            <button type="button">Hero</button>
          </Dialog>
        </>
      );
    }
    render(<WithSearchOpened />);
    const opener = screen.getByRole('button', { name: 'Thêm section' });
    await user.click(opener);
    expect(screen.getByRole('textbox', { name: 'Tìm section' })).toHaveFocus();
    await user.keyboard('{Escape}');

    expect(opener).toHaveFocus();
  });

  it('focuses the fallback when what was chosen in it removed the opener', async () => {
    const user = userEvent.setup();
    function ReplacingChoice() {
      const [open, setOpen] = useState(false);
      const [chosen, setChosen] = useState(false);
      const fallback = useRef<HTMLParagraphElement>(null);
      return (
        <>
          <p ref={fallback} tabIndex={-1}>
            Ảnh đã chọn
          </p>
          {chosen ? null : (
            <Button
              onClick={() => {
                setOpen(true);
              }}
            >
              Chọn ảnh
            </Button>
          )}
          <Dialog
            open={open}
            onOpenChange={setOpen}
            title="Thư viện ảnh"
            fallbackFocusRef={fallback}
          >
            <Button
              onClick={() => {
                setChosen(true);
                setOpen(false);
              }}
            >
              Phòng khám
            </Button>
          </Dialog>
        </>
      );
    }
    render(<ReplacingChoice />);
    await user.click(screen.getByRole('button', { name: 'Chọn ảnh' }));
    await user.click(screen.getByRole('button', { name: 'Phòng khám' }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByText('Ảnh đã chọn')).toHaveFocus();
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

  it('closes once on Escape when it is the top layer', async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    render(
      <Dialog open onOpenChange={onOpenChange} title="Nơi nhận lead">
        <Button>Thêm</Button>
      </Dialog>,
    );
    await user.keyboard('{Escape}');
    expect(onOpenChange).toHaveBeenCalledTimes(1);
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('closes on Escape while a toast shows, which would otherwise take the key', async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    function SavedInDialog() {
      const { toast } = useToast();
      return (
        <Dialog open onOpenChange={onOpenChange} title="Nơi nhận lead">
          <Button
            onClick={() => {
              toast({ tone: 'success', title: 'Đã gửi thư xác nhận' });
            }}
          >
            Thêm
          </Button>
        </Dialog>
      );
    }
    render(
      <ToastProvider>
        <SavedInDialog />
      </ToastProvider>,
    );
    await user.click(screen.getByRole('button', { name: 'Thêm' }));
    expect(await screen.findByText('Đã gửi thư xác nhận')).toBeInTheDocument();

    await user.keyboard('{Escape}');

    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(onOpenChange).toHaveBeenCalledTimes(1);
  });
});
