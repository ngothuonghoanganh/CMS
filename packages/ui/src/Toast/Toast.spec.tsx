import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { type ToastOptions, ToastProvider, useToast } from './Toast';

function Trigger({ options, label = 'Hiện thông báo' }: { options: ToastOptions; label?: string }) {
  const { toast } = useToast();
  return (
    <button
      type="button"
      onClick={() => {
        toast(options);
      }}
    >
      {label}
    </button>
  );
}

describe('Toast', () => {
  it('moves to the top corner while the focused control is under the bottom one', async () => {
    const user = userEvent.setup();
    render(
      <ToastProvider>
        <Trigger options={{ title: 'Đã lưu ghi chú' }} />
        <button type="button">Chuyển vào spam</button>
      </ToastProvider>,
    );
    // jsdom lays nothing out: the stack sits at the bottom right of a 768 px tall window, and
    // "Chuyển vào spam" under it.
    const boxes: Record<string, { top: number; left: number; width: number; height: number }> = {
      OL: { top: 692, left: 600, width: 380, height: 60 },
      'Chuyển vào spam': { top: 700, left: 700, width: 140, height: 36 },
    };
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
      this: HTMLElement,
    ) {
      const { top, left, width, height } = boxes[this.tagName] ??
        boxes[this.textContent] ?? { top: 0, left: 0, width: 100, height: 36 };
      return DOMRect.fromRect({ x: left, y: top, width, height });
    });
    await user.click(screen.getByRole('button', { name: 'Hiện thông báo' }));
    const stack = screen.getByRole('region', { name: 'Thông báo' }).querySelector('ol');
    expect(stack).toHaveAttribute('data-placement', 'bottom');

    screen.getByRole('button', { name: 'Chuyển vào spam' }).focus();
    await waitFor(() => {
      expect(stack).toHaveAttribute('data-placement', 'top');
    });
    screen.getByRole('button', { name: 'Hiện thông báo' }).focus();
    await waitFor(() => {
      expect(stack).toHaveAttribute('data-placement', 'bottom');
    });
    vi.restoreAllMocks();
  });

  it('shows the toast inside the "Thông báo" region', async () => {
    const user = userEvent.setup();
    render(
      <ToastProvider>
        <Trigger
          options={{ title: 'Đã lưu cài đặt site', description: 'Logo mới đã được áp dụng.' }}
        />
      </ToastProvider>,
    );
    const region = screen.getByRole('region', { name: 'Thông báo' });
    await user.click(screen.getByRole('button', { name: 'Hiện thông báo' }));
    expect(region).toHaveTextContent('Đã lưu cài đặt site');
    expect(region).toHaveTextContent('Logo mới đã được áp dụng.');
  });

  it('calls the action back and closes ("Hoàn tác")', async () => {
    const user = userEvent.setup();
    const onUndo = vi.fn();
    render(
      <ToastProvider>
        <Trigger
          options={{
            title: 'Đã khôi phục v11',
            tone: 'success',
            action: { label: 'Hoàn tác', onClick: onUndo },
          }}
        />
      </ToastProvider>,
    );
    await user.click(screen.getByRole('button', { name: 'Hiện thông báo' }));
    await user.click(screen.getByRole('button', { name: 'Hoàn tác' }));
    expect(onUndo).toHaveBeenCalledTimes(1);
    await waitFor(() => {
      expect(screen.queryByText('Đã khôi phục v11')).not.toBeInTheDocument();
    });
  });

  it('closes with the "Đóng" button', async () => {
    const user = userEvent.setup();
    render(
      <ToastProvider>
        <Trigger options={{ title: 'Đã sao chép' }} />
      </ToastProvider>,
    );
    await user.click(screen.getByRole('button', { name: 'Hiện thông báo' }));
    expect(screen.getByText('Đã sao chép')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Đóng' }));
    await waitFor(() => {
      expect(screen.queryByText('Đã sao chép')).not.toBeInTheDocument();
    });
  });

  it('dismisses by id and keeps at most three toasts', async () => {
    const user = userEvent.setup();
    function Many() {
      const { toast, dismiss } = useToast();
      return (
        <>
          <button
            type="button"
            onClick={() => {
              for (const n of [1, 2, 3, 4]) {
                toast({ title: `Thông báo ${n}` });
              }
            }}
          >
            Bốn thông báo
          </button>
          <button
            type="button"
            onClick={() => {
              dismiss(toast({ title: 'Tạm thời' }));
            }}
          >
            Hiện rồi ẩn
          </button>
        </>
      );
    }
    render(
      <ToastProvider>
        <Many />
      </ToastProvider>,
    );
    await user.click(screen.getByRole('button', { name: 'Bốn thông báo' }));
    expect(screen.queryByText('Thông báo 1')).not.toBeInTheDocument();
    expect(screen.getByText('Thông báo 4')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Hiện rồi ẩn' }));
    expect(screen.queryByText('Tạm thời')).not.toBeInTheDocument();
  });

  it('fails loudly outside the provider', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    expect(() => render(<Trigger options={{ title: 'x' }} />)).toThrow(/ToastProvider/);
    spy.mockRestore();
  });
});
