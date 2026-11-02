import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { type ToastApi, type ToastOptions, ToastProvider, useToast } from './Toast';

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

interface Rect {
  top: number;
  left: number;
  width: number;
  height: number;
}

/**
 * jsdom lays nothing out. Here the window is 768 px tall and the stack is 380 px wide at the
 * right, each toast 60 px tall with 8 px between them; `controls` place the other elements.
 */
function mockLayout(controls: Record<string, Rect>): void {
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
    this: HTMLElement,
  ) {
    const toasts = this.tagName === 'OL' ? this.querySelectorAll(':scope > li').length : 0;
    const { top, left, width, height } =
      this.tagName === 'OL'
        ? { top: 0, left: 600, width: 380, height: Math.max(0, toasts * 68 - 8) }
        : (controls[this.textContent] ?? { top: 0, left: 0, width: 100, height: 36 });
    return DOMRect.fromRect({ x: left, y: top, width, height });
  });
}

/** Stands in for the browser's ResizeObserver, which jsdom lacks; `report` is a size change. */
class FakeResizeObserver {
  static observing = new Set<FakeResizeObserver>();
  static report(): void {
    for (const observer of FakeResizeObserver.observing) {
      observer.callback([], observer);
    }
  }
  constructor(private readonly callback: ResizeObserverCallback) {}
  observe(): void {
    FakeResizeObserver.observing.add(this);
  }
  unobserve(): void {
    FakeResizeObserver.observing.delete(this);
  }
  disconnect(): void {
    FakeResizeObserver.observing.delete(this);
  }
}

/** The toast API, for showing a toast without moving focus as clicking a button would. */
function captureApi(): { Capture: () => null; api: () => ToastApi } {
  let captured: ToastApi | null = null;
  return {
    Capture() {
      captured = useToast();
      return null;
    },
    api() {
      if (captured === null) {
        throw new Error('The toast API was not captured');
      }
      return captured;
    },
  };
}

function stackOf(): HTMLElement {
  const stack = screen.getByRole('region', { name: 'Thông báo' }).querySelector('ol');
  if (stack === null) {
    throw new Error('The toast region has no stack');
  }
  return stack;
}

/**
 * The stack decides its corner a frame after what moved. Running each frame at once makes the
 * corner final as soon as the change returns, with no real time to wait.
 */
function framesAtOnce(): void {
  vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
    callback(performance.now());
    return 0;
  });
  vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => undefined);
}

function placement(): string | null {
  return stackOf().getAttribute('data-placement');
}

function focus(name: string): void {
  act(() => {
    screen.getByRole('button', { name }).focus();
  });
}

describe('Toast', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    FakeResizeObserver.observing.clear();
  });

  it('moves to the top corner when a second toast makes the stack reach the focused control', () => {
    vi.stubGlobal('ResizeObserver', FakeResizeObserver);
    framesAtOnce();
    const { Capture, api } = captureApi();
    render(
      <ToastProvider>
        <Capture />
        <button type="button">Ghi chú</button>
      </ToastProvider>,
    );
    // One toast covers 692–752 px, two cover 624–752 px: only the second reaches the control.
    mockLayout({ 'Ghi chú': { top: 640, left: 700, width: 140, height: 36 } });
    focus('Ghi chú');
    act(() => {
      api().toast({ title: 'Đã lưu ghi chú' });
    });
    expect(placement()).toBe('bottom');

    act(() => {
      api().toast({ title: 'Đã chuyển trạng thái' });
    });
    expect(stackOf().querySelectorAll('li')).toHaveLength(2);
    // The browser reports the taller stack.
    act(() => {
      FakeResizeObserver.report();
    });
    expect(placement()).toBe('top');
  });

  it('moves to the top corner when scrolling brings the focused control under the stack', () => {
    const { Capture, api } = captureApi();
    render(
      <ToastProvider>
        <Capture />
        <div data-testid="list">
          <button type="button">Chuyển vào spam</button>
        </div>
      </ToastProvider>,
    );
    framesAtOnce();
    const control = { top: 400, left: 700, width: 140, height: 36 };
    mockLayout({ 'Chuyển vào spam': control });
    focus('Chuyển vào spam');
    act(() => {
      api().toast({ title: 'Đã lưu ghi chú' });
    });
    expect(placement()).toBe('bottom');

    // A scrolling list, not the page, carries the control down under the stack.
    control.top = 700;
    fireEvent.scroll(screen.getByTestId('list'));
    expect(placement()).toBe('top');

    control.top = 300;
    fireEvent.scroll(window);
    expect(placement()).toBe('bottom');
  });

  it('moves to the top corner when the window shrinks under the focused control', () => {
    const { Capture, api } = captureApi();
    render(
      <ToastProvider>
        <Capture />
        <button type="button">Lưu</button>
      </ToastProvider>,
    );
    framesAtOnce();
    mockLayout({ Lưu: { top: 600, left: 700, width: 100, height: 36 } });
    focus('Lưu');
    act(() => {
      api().toast({ title: 'Đã lưu' });
    });
    expect(placement()).toBe('bottom');

    // An on-screen keyboard takes 108 px: the stack now covers 584–644 px at the bottom.
    const height = window.innerHeight;
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 660 });
    try {
      fireEvent(window, new Event('resize'));
      expect(placement()).toBe('top');
    } finally {
      Object.defineProperty(window, 'innerHeight', { configurable: true, value: height });
    }
  });

  it('goes back to the bottom corner once no control has focus', () => {
    function Row({ removed }: { removed: boolean }) {
      return removed ? null : <button type="button">Chuyển vào spam</button>;
    }
    const { Capture, api } = captureApi();
    const view = (removed: boolean) => (
      <ToastProvider>
        <Capture />
        <button type="button">Ghi chú</button>
        <Row removed={removed} />
      </ToastProvider>
    );
    const { rerender } = render(view(false));
    framesAtOnce();
    mockLayout({
      'Chuyển vào spam': { top: 700, left: 700, width: 140, height: 36 },
      'Ghi chú': { top: 710, left: 560, width: 100, height: 36 },
    });
    focus('Chuyển vào spam');
    act(() => {
      api().toast({ title: 'Đã chuyển vào spam' });
    });
    expect(placement()).toBe('top');

    // The focused control is removed with its row: focus falls to the page.
    rerender(view(true));
    expect(document.activeElement).toBe(document.body);
    fireEvent.scroll(window);
    expect(placement()).toBe('bottom');

    // A control under the stack takes focus, then loses it to a click on no control.
    focus('Ghi chú');
    expect(placement()).toBe('top');
    act(() => {
      screen.getByRole('button', { name: 'Ghi chú' }).blur();
    });
    expect(placement()).toBe('bottom');
  });

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

  it('announces the title, the description and the action as separate sentences', async () => {
    const user = userEvent.setup();
    render(
      <ToastProvider>
        <Trigger
          label="Có mô tả"
          options={{
            title: 'Đã gửi lại email của “Ưu đãi niềng răng”',
            description: 'Lead đã được gửi tới 2 địa chỉ.',
            action: { label: 'Hoàn tác', onClick: () => undefined },
          }}
        />
        <Trigger label="Có dấu chấm" options={{ title: 'Đã lưu.', description: 'Logo mới' }} />
      </ToastProvider>,
    );
    /** What Radix reads out: a live region it fills for a second after a toast shows. */
    async function announced(): Promise<string> {
      return waitFor(() => {
        const live = screen
          .getAllByRole('status')
          .filter((element) => element.getAttribute('aria-live') === 'polite')
          .map((element) => element.textContent)
          .filter((text) => text !== 'Thông báo ' && text !== '');
        expect(live).toHaveLength(1);
        return live[0] ?? '';
      });
    }

    await user.click(screen.getByRole('button', { name: 'Có mô tả' }));
    expect(await announced()).toBe(
      'Thông báo Đã gửi lại email của “Ưu đãi niềng răng”. Lead đã được gửi tới 2 địa chỉ. Hoàn tác',
    );
    // What shows is unchanged: the separators are for assistive technology only.
    expect(screen.getByText('Đã gửi lại email của “Ưu đãi niềng răng”')).toHaveTextContent(
      /^Đã gửi lại email của “Ưu đãi niềng răng”$/,
    );
    await user.click(screen.getByRole('button', { name: 'Đóng' }));
    await waitFor(() => {
      expect(screen.queryByText('Lead đã được gửi tới 2 địa chỉ.')).not.toBeInTheDocument();
    });

    // A title that already ends a sentence is followed by a space only.
    await user.click(screen.getByRole('button', { name: 'Có dấu chấm' }));
    expect(await announced()).toBe('Thông báo Đã lưu. Logo mới');
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
