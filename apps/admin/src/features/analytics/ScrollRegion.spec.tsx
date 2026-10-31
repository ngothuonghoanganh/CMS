import { act, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ScrollRegion } from './ScrollRegion';

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

/** jsdom lays nothing out: the box is `box.width` wide and its table 520 px. */
function mockWidths(box: { width: number }): void {
  vi.spyOn(Element.prototype, 'clientWidth', 'get').mockImplementation(function (this: Element) {
    return this.firstElementChild?.tagName === 'TABLE' ? box.width : 0;
  });
  vi.spyOn(Element.prototype, 'scrollWidth', 'get').mockImplementation(function (this: Element) {
    return this.firstElementChild?.tagName === 'TABLE' ? Math.max(box.width, 520) : 0;
  });
}

function Table() {
  return (
    <ScrollRegion label="Bảng nguồn truy cập">
      <table>
        <tbody>
          <tr>
            <th scope="row">facebook / cpc</th>
            <td>1.120</td>
          </tr>
        </tbody>
      </table>
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
});
