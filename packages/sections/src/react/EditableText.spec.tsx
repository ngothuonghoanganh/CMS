// @vitest-environment jsdom
import { act, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';
import { EditableText } from './EditableText.js';

// jsdom lays nothing out and has no innerText; for text without line elements it equals
// textContent, which is what these specs type.
Object.defineProperty(HTMLElement.prototype, 'innerText', {
  configurable: true,
  get(this: HTMLElement) {
    return this.textContent;
  },
});
Reflect.set(globalThis, 'IS_REACT_ACT_ENVIRONMENT', true);

/** The Hero heading's limit, and a heading that fills it. */
const LIMIT = 80;
const FULL_HEADING =
  'Nha khoa Smile Care: khám tổng quát miễn phí, đặt lịch trong 30 giây, không chờ.';

/**
 * Keeps the text like the editor's `updateContent`: a commit is cut to the field's limit, and a
 * commit cut back to the current text changes nothing, so nothing re-renders.
 */
function Host({ initial, multiline }: { initial: string; multiline: boolean }) {
  const [value, setValue] = useState(initial);
  return (
    <EditableText
      as="p"
      className={undefined}
      value={value}
      multiline={multiline}
      placeholder="Tiêu đề"
      onCommit={(next) => {
        const kept = next.slice(0, LIMIT);
        if (kept !== value) {
          setValue(kept);
        }
      }}
    />
  );
}

/** A text whose value only the host changes: undo, the properties panel, a reload. */
function Controlled({ value }: { value: string }) {
  return (
    <EditableText
      as="p"
      className={undefined}
      value={value}
      multiline={false}
      placeholder="Tiêu đề"
      onCommit={() => undefined}
    />
  );
}

let root: Root | null = null;

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  document.body.replaceChildren();
});

function renderText(initial: string, multiline = false): HTMLElement {
  const container = document.createElement('div');
  document.body.append(container);
  const created = createRoot(container);
  root = created;
  act(() => {
    created.render(<Host initial={initial} multiline={multiline} />);
  });
  const element = container.querySelector<HTMLElement>('[role="textbox"]');
  if (!element) {
    throw new Error('EditableText rendered no textbox');
  }
  return element;
}

/** Edits like the canvas: the DOM text is the buffer, committed when the field loses focus. */
function type(element: HTMLElement, text: string) {
  act(() => {
    element.focus();
  });
  element.textContent = text;
  act(() => {
    element.blur();
  });
}

describe('EditableText', () => {
  it('shows the stored text again when a full field drops what was typed past its limit', () => {
    expect(FULL_HEADING).toHaveLength(LIMIT);
    const element = renderText(FULL_HEADING);

    type(element, `${FULL_HEADING} và thêm chữ`);

    expect(element.textContent).toBe(FULL_HEADING);
  });

  it('shows the stored text again when the commit only removed extra blank lines', () => {
    const description = 'Khám tổng quát miễn phí.\n\nĐặt lịch trong 30 giây.';
    const element = renderText(description, true);

    type(element, description.replace('\n\n', '\n\n\n\n'));

    expect(element.textContent).toBe(description);
  });

  it('shows the placeholder of a text emptied on the canvas', () => {
    const element = renderText('Ưu đãi tháng 11');
    act(() => {
      element.focus();
    });
    // What Chromium leaves in a plaintext-only element once its text is deleted.
    element.innerHTML = '<br>';
    act(() => {
      element.blur();
    });

    expect(element.matches(':empty')).toBe(true);
  });

  it('follows a value the host changed', () => {
    const container = document.createElement('div');
    document.body.append(container);
    const created = createRoot(container);
    root = created;
    act(() => {
      created.render(<Controlled value="Bản cũ" />);
    });
    act(() => {
      created.render(<Controlled value="Bản mới" />);
    });

    expect(container.querySelector('[role="textbox"]')?.textContent).toBe('Bản mới');
  });

  it('keeps what is being typed when the window loses focus, until the field does', () => {
    const element = renderText(FULL_HEADING);
    act(() => {
      element.focus();
    });
    element.textContent = `${FULL_HEADING} và thêm chữ`;
    // Switching to another app blurs the page but leaves the field focused, and React commits.
    act(() => {
      element.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
    });
    expect(element.textContent).toBe(`${FULL_HEADING} và thêm chữ`);

    act(() => {
      element.blur();
    });
    expect(element.textContent).toBe(FULL_HEADING);
  });
});
