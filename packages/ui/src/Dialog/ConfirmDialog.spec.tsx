import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useRef, useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { DropdownMenu, DropdownMenuItem } from '../DropdownMenu/DropdownMenu';
import { ConfirmDialog, type ConfirmDialogProps } from './ConfirmDialog';

type Overrides = Partial<Omit<ConfirmDialogProps, 'open' | 'onOpenChange'>>;

function Harness({ overrides = {} }: { overrides?: Overrides }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => {
          setOpen(true);
        }}
      >
        Gỡ xuất bản
      </button>
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title="Gỡ trang khỏi site?"
        description="Khách truy cập sẽ thấy trang không tồn tại."
        confirmLabel="Gỡ xuất bản"
        tone="danger"
        onConfirm={vi.fn()}
        {...overrides}
      />
    </>
  );
}

async function openDialog(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: 'Gỡ xuất bản' }));
  return screen.getByRole('alertdialog', { name: 'Gỡ trang khỏi site?' });
}

describe('ConfirmDialog', () => {
  it('is an alertdialog that confirms without a reason by default', async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    render(<Harness overrides={{ onConfirm }} />);
    const dialog = await openDialog(user);
    expect(dialog).toHaveAccessibleDescription('Khách truy cập sẽ thấy trang không tồn tại.');
    expect(screen.getByRole('button', { name: 'Hủy' })).toHaveFocus();
    await user.click(screen.getAllByRole('button', { name: 'Gỡ xuất bản' }).at(-1) as HTMLElement);
    expect(onConfirm).toHaveBeenCalledWith('');
  });

  it('requires a reason when configured and passes it trimmed', async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    render(<Harness overrides={{ onConfirm, reason: { maxLength: 300 } }} />);
    const dialog = await openDialog(user);
    const reason = screen.getByRole('textbox', { name: 'Lý do · ghi vào nhật ký hoạt động' });
    expect(reason).toHaveFocus();
    expect(reason).toHaveAttribute('aria-required', 'true');
    expect(reason).toHaveAccessibleDescription('0 / 300');

    const confirm = dialog.querySelector('button[aria-describedby]');
    expect(confirm).toHaveTextContent('Gỡ xuất bản');
    expect(confirm).toBeDisabled();
    expect(confirm).toHaveAccessibleDescription('Nhập lý do để tiếp tục.');

    await user.type(reason, '   ');
    expect(confirm).toBeDisabled();

    await user.type(reason, 'Giá ưu đãi mới chưa được duyệt ');
    const enabled = screen.getAllByRole('button', { name: 'Gỡ xuất bản' }).at(-1) as HTMLElement;
    expect(enabled).toBeEnabled();
    expect(screen.queryByText('Nhập lý do để tiếp tục.')).not.toBeInTheDocument();
    await user.click(enabled);
    expect(onConfirm).toHaveBeenCalledWith('Giá ưu đãi mới chưa được duyệt');
  });

  it('cancels with Escape and "Hủy", returning focus to the opener', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const opener = screen.getByRole('button', { name: 'Gỡ xuất bản' });
    await openDialog(user);
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(opener).toHaveFocus();

    await openDialog(user);
    await user.click(screen.getByRole('button', { name: 'Hủy' }));
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(opener).toHaveFocus();
  });

  it('returns focus to the menu trigger when opened from a menu item', async () => {
    const user = userEvent.setup();
    function MenuHarness() {
      const [open, setOpen] = useState(false);
      return (
        <>
          <DropdownMenu
            trigger={
              <button type="button" aria-label="Tùy chọn khác cho Trang chủ">
                …
              </button>
            }
          >
            <DropdownMenuItem
              onSelect={() => {
                setOpen(true);
              }}
            >
              Gỡ xuất bản
            </DropdownMenuItem>
          </DropdownMenu>
          <ConfirmDialog
            open={open}
            onOpenChange={setOpen}
            title="Gỡ trang khỏi site?"
            confirmLabel="Gỡ xuất bản"
            reason={{}}
            onConfirm={vi.fn()}
          />
        </>
      );
    }
    render(<MenuHarness />);
    const trigger = screen.getByRole('button', { name: 'Tùy chọn khác cho Trang chủ' });
    for (const close of ['{Escape}', 'Hủy']) {
      await user.click(trigger);
      await user.click(await screen.findByRole('menuitem', { name: 'Gỡ xuất bản' }));
      expect(await screen.findByRole('alertdialog', { name: 'Gỡ trang khỏi site?' })).toBeVisible();
      expect(screen.getByRole('textbox')).toHaveFocus();
      if (close === 'Hủy') {
        await user.click(screen.getByRole('button', { name: 'Hủy' }));
      } else {
        await user.keyboard(close);
      }
      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
      expect(trigger).toHaveFocus();
    }
  });

  it('falls back to a provided element when the confirmed action removed the opener', async () => {
    const user = userEvent.setup();
    function RefHarness() {
      const [open, setOpen] = useState(false);
      const [done, setDone] = useState(false);
      const fallback = useRef<HTMLParagraphElement>(null);
      return (
        <>
          <p ref={fallback} tabIndex={-1}>
            Bản nháp
          </p>
          {done ? null : (
            <button
              type="button"
              onClick={() => {
                setOpen(true);
              }}
            >
              Quay về bản live
            </button>
          )}
          <ConfirmDialog
            open={open}
            onOpenChange={setOpen}
            title="Quay về bản live?"
            confirmLabel="Xác nhận"
            fallbackFocusRef={fallback}
            onConfirm={() => {
              setDone(true);
              setOpen(false);
            }}
          />
        </>
      );
    }
    render(<RefHarness />);
    const opener = screen.getByRole('button', { name: 'Quay về bản live' });
    await user.click(opener);
    await user.keyboard('{Escape}');
    // The opener still exists: focus goes back to it.
    expect(opener).toHaveFocus();

    await user.click(opener);
    await user.click(screen.getByRole('button', { name: 'Xác nhận' }));
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(screen.getByText('Bản nháp')).toHaveFocus();
  });

  it('starts with an empty reason every time it opens', async () => {
    const user = userEvent.setup();
    render(<Harness overrides={{ reason: {} }} />);
    await openDialog(user);
    await user.type(screen.getByRole('textbox'), 'Sai giá');
    await user.keyboard('{Escape}');
    await openDialog(user);
    expect(screen.getByRole('textbox')).toHaveValue('');
  });

  it('cannot be dismissed while pending and shows the error', async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    render(
      <ConfirmDialog
        open
        onOpenChange={onOpenChange}
        title="Khôi phục v11 thành bản live?"
        confirmLabel="Khôi phục v11"
        pending
        error="Trang vừa được xuất bản bởi người khác. Tải lại để xem bản mới nhất."
        onConfirm={vi.fn()}
      />,
    );
    expect(screen.getByRole('alert')).toHaveTextContent('Trang vừa được xuất bản bởi người khác.');
    expect(screen.getByRole('button', { name: 'Khôi phục v11' })).toHaveAttribute(
      'aria-busy',
      'true',
    );
    expect(screen.getByRole('button', { name: 'Hủy' })).toBeDisabled();
    await user.keyboard('{Escape}');
    expect(onOpenChange).not.toHaveBeenCalled();
    expect(screen.getByRole('alertdialog')).toBeInTheDocument();
  });
});
