import { describe, expect, it } from 'vitest';

import { isEditableTarget } from './builder-interaction';

describe('builder keyboard target guard', () => {
  it('recognizes native form controls and semantic textboxes', () => {
    const input = {
      isContentEditable: false,
      closest: () => ({ getAttribute: () => null }),
    } as unknown as EventTarget;
    const textbox = {
      isContentEditable: false,
      closest: () => ({ getAttribute: () => null }),
    } as unknown as EventTarget;

    expect(isEditableTarget(input)).toBe(true);
    expect(isEditableTarget(textbox)).toBe(true);
  });

  it('recognizes contenteditable descendants and ignores ordinary controls', () => {
    const child = {
      isContentEditable: true,
      closest: () => null,
    } as unknown as EventTarget;
    const button = {
      isContentEditable: false,
      closest: () => null,
    } as unknown as EventTarget;

    expect(isEditableTarget(child)).toBe(true);
    expect(isEditableTarget(button)).toBe(false);
  });

  it('does not treat explicitly disabled contenteditable as editable', () => {
    const element = {
      isContentEditable: false,
      closest: () => ({ getAttribute: () => 'false' }),
    } as unknown as EventTarget;

    expect(isEditableTarget(element)).toBe(false);
  });
});
