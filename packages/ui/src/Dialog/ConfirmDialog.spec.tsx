import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
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
