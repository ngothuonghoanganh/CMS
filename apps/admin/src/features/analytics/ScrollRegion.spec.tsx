import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ScrollRegion } from './ScrollRegion';

/**
 * Stands in for the browser's ResizeObserver, which jsdom lacks. `report` is a change of the
 * window's size, `resize` a change of one element's.
 */
class FakeResizeObserver {
  static observing = new Set<FakeResizeObserver>();
  static report(): void {
    for (const observer of FakeResizeObserver.observing) {
      observer.callback([], observer);
    }
  }
  static resize(target: Element): void {
    for (const observer of FakeResizeObserver.observing) {
      if (observer.targets.has(target)) {
        observer.callback([], observer);
      }
    }
  }
  private readonly targets = new Set<Element>();
  constructor(private readonly callback: ResizeObserverCallback) {}
  observe(target: Element): void {
    this.targets.add(target);
    FakeResizeObserver.observing.add(this);
  }
  unobserve(target: Element): void {
    this.targets.delete(target);
  }
  disconnect(): void {
    this.targets.clear();
    FakeResizeObserver.observing.delete(this);
  }
}

/** jsdom lays nothing out: the box is `box.width` wide and its table `box.table` (520 px). */
function mockWidths(box: { width: number; table?: number }): void {
  vi.spyOn(Element.prototype, 'clientWidth', 'get').mockImplementation(function (this: Element) {
    return this.firstElementChild?.tagName === 'TABLE' ? box.width : 0;
  });
  vi.spyOn(Element.prototype, 'scrollWidth', 'get').mockImplementation(function (this: Element) {
    return this.firstElementChild?.tagName === 'TABLE' ? Math.max(box.width, box.table ?? 520) : 0;
  });
}

function Rows() {
  return (
    <table>
      <tbody>
        <tr>
          <th scope="row">facebook / cpc</th>
          <td>1.120</td>
        </tr>
      </tbody>
    </table>
  );
}

function Table() {
  return (
    <ScrollRegion label="Bảng nguồn truy cập">
      <Rows />
    </ScrollRegion>
  );
}

function region(): HTMLElement | null {
  return screen.queryByRole('region', { name: 'Bảng nguồn truy cập' });
}

describe('ScrollRegion', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    FakeResizeObserver.observing.clear();
  });

  it('adds no tab stop where the table fits', () => {
    mockWidths({ width: 760 });
    render(<Table />);
    expect(region()).toBeNull();
    const box = screen.getByRole('table').parentElement;
    expect(box).not.toHaveAttribute('tabindex');
    expect(box).not.toHaveAttribute('role');
  });

  it('is a named region in the tab order while the table scrolls sideways', () => {
    mockWidths({ width: 343 });
    render(<Table />);
    expect(region()).toHaveAttribute('tabindex', '0');
  });

  it('follows the width of the window as it changes', () => {
    vi.stubGlobal('ResizeObserver', FakeResizeObserver);
    const box = { width: 760 };
    mockWidths(box);
    render(<Table />);
    expect(region()).toBeNull();

    // The window narrows to a phone's.
    box.width = 343;
    act(() => {
      FakeResizeObserver.report();
    });
    expect(region()).toHaveAttribute('tabindex', '0');

    box.width = 1024;
    act(() => {
      FakeResizeObserver.report();
    });
    expect(region()).toBeNull();
  });

  it('keeps the focus it holds when the table comes to fit, until the focus leaves', async () => {
    vi.stubGlobal('ResizeObserver', FakeResizeObserver);
    const user = userEvent.setup();
    const box = { width: 343 };
    mockWidths(box);
    render(
      <>
        <Table />
        <button type="button">Sau bảng</button>
      </>,
    );
    await user.tab();
    const focused = region();
    expect(focused).toHaveFocus();

    // The phone turns sideways: the table fits now.
    box.width = 760;
    act(() => {
      FakeResizeObserver.report();
    });
    expect(focused).toHaveFocus();
    expect(focused).toHaveAttribute('tabindex', '0');
    expect(region()).toBe(focused);

    await user.tab();
    expect(screen.getByRole('button', { name: 'Sau bảng' })).toHaveFocus();
    expect(region()).toBeNull();
    expect(screen.getByRole('table').parentElement).not.toHaveAttribute('tabindex');
  });

  it('keeps its focus while the window loses focus, then lets it go when focus moves on', async () => {
    vi.stubGlobal('ResizeObserver', FakeResizeObserver);
    const user = userEvent.setup();
    const box = { width: 343 };
    mockWidths(box);
    render(
      <>
        <Table />
        <button type="button">Sau bảng</button>
      </>,
    );
    await user.tab();
    const focused = screen.getByRole('region', { name: 'Bảng nguồn truy cập' });
    box.width = 760;
    act(() => {
      FakeResizeObserver.report();
    });

    // Another window takes focus: the region is blurred, yet it stays the page's active element.
    fireEvent.blur(focused);
    expect(focused).toHaveFocus();
    expect(focused).toHaveAttribute('tabindex', '0');
    expect(region()).toBe(focused);

    // Back in this window, focus returns to it; Tab then moves on and the table fits.
    fireEvent.focus(focused);
    await user.tab();
    expect(screen.getByRole('button', { name: 'Sau bảng' })).toHaveFocus();
    expect(region()).toBeNull();
  });

  it('measures a table that comes after the first render, as its width changes', async () => {
    vi.stubGlobal('ResizeObserver', FakeResizeObserver);
    const sizes = { width: 760, table: 520 };
    mockWidths(sizes);
    const { rerender } = render(
      <ScrollRegion label="Bảng nguồn truy cập">
        <p>Đang tải</p>
      </ScrollRegion>,
    );
    rerender(
      <ScrollRegion label="Bảng nguồn truy cập">
        <Rows />
      </ScrollRegion>,
    );
    // The box sees its new child once the DOM settles.
    await act(() => Promise.resolve());
    expect(region()).toBeNull();

    // More rows, a wider column: the new table outgrows its box.
    sizes.table = 900;
    act(() => {
      FakeResizeObserver.resize(screen.getByRole('table'));
    });
    expect(region()).toHaveAttribute('tabindex', '0');
  });
});
