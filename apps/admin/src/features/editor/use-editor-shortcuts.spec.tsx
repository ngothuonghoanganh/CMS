import { renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { makeStore, sectionIds } from './test-fixtures';
import { isTypingTarget, shortcutFor, useEditorShortcuts } from './use-editor-shortcuts';

function press(init: KeyboardEventInit, target: EventTarget = document.body) {
  const event = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init });
  target.dispatchEvent(event);
  return event;
}

afterEach(() => {
  document.body.innerHTML = '';
});

describe('editor shortcuts', () => {
  it('maps keys to actions', () => {
    const body = document.body;
    const key = (init: Partial<KeyboardEvent>) =>
      shortcutFor({
        key: '',
        ctrlKey: false,
        metaKey: false,
        shiftKey: false,
        altKey: false,
        target: body,
        ...init,
      });
    expect(key({ key: 'z', ctrlKey: true })).toBe('undo');
    expect(key({ key: 'z', metaKey: true })).toBe('undo');
    expect(key({ key: 'Z', ctrlKey: true, shiftKey: true })).toBe('redo');
    expect(key({ key: 'y', ctrlKey: true })).toBe('redo');
    expect(key({ key: 'ArrowUp', altKey: true })).toBe('moveUp');
    expect(key({ key: 'ArrowDown', altKey: true })).toBe('moveDown');
    expect(key({ key: 'Escape' })).toBe('clearSelection');
    expect(key({ key: 'z' })).toBeNull();
    expect(key({ key: 'ArrowUp' })).toBeNull();
  });

  it('leaves typing targets alone except for Escape', () => {
    const input = document.createElement('input');
    const editable = document.createElement('div');
    editable.setAttribute('contenteditable', 'plaintext-only');
    const inner = document.createElement('span');
    editable.append(inner);
    document.body.append(input, editable);
    expect(isTypingTarget(input)).toBe(true);
    expect(isTypingTarget(inner)).toBe(true);
    expect(isTypingTarget(document.body)).toBe(false);
    const base = { ctrlKey: true, metaKey: false, shiftKey: false, altKey: false };
    expect(shortcutFor({ ...base, key: 'z', target: input })).toBeNull();
    expect(shortcutFor({ ...base, key: 'Escape', target: input })).toBe('clearSelection');
  });

  it('undoes, redoes, moves the selection and clears it', () => {
    const store = makeStore();
    const announce = vi.fn();
    renderHook(() => {
      useEditorShortcuts(store, announce);
    });
    store.getState().setSpacing('hero00000001', 'compact');
    expect(press({ key: 'z', ctrlKey: true }).defaultPrevented).toBe(true);
    expect(store.getState().draft.composition.sections[1]?.spacing).toBe('normal');
    press({ key: 'z', ctrlKey: true, shiftKey: true });
    expect(store.getState().draft.composition.sections[1]?.spacing).toBe('compact');
    expect(announce).toHaveBeenLastCalledWith('Đã làm lại.');

    store.getState().select('hero00000001');
    press({ key: 'ArrowDown', altKey: true });
    expect(sectionIds(store)[2]).toBe('hero00000001');
    expect(announce).toHaveBeenLastCalledWith('Đã chuyển Hero tới vị trí 3 / 5.');
    press({ key: 'ArrowUp', altKey: true });
    press({ key: 'ArrowUp', altKey: true });
    expect(sectionIds(store)[1]).toBe('hero00000001');
    expect(announce).toHaveBeenLastCalledWith('Không thể chuyển Hero lên nữa.');

    press({ key: 'Escape' });
    expect(store.getState().selection.sectionId).toBeNull();
  });

  it('ignores shortcuts inside inputs and dialogs', () => {
    const store = makeStore();
    renderHook(() => {
      useEditorShortcuts(store, vi.fn());
    });
    store.getState().setSpacing('hero00000001', 'compact');
    const input = document.createElement('input');
    const dialog = document.createElement('div');
    dialog.setAttribute('role', 'dialog');
    const button = document.createElement('button');
    dialog.append(button);
    document.body.append(input, dialog);
    expect(press({ key: 'z', ctrlKey: true }, input).defaultPrevented).toBe(false);
    press({ key: 'z', ctrlKey: true }, button);
    expect(store.getState().draft.composition.sections[1]?.spacing).toBe('compact');
  });

  it('returns focus to the structure row when Escape closes the panel under the focus', async () => {
    const store = makeStore();
    renderHook(() => {
      useEditorShortcuts(store, vi.fn());
    });
    const row = document.createElement('button');
    row.dataset.structureControl = 'hero00000001:select';
    const field = document.createElement('input');
    document.body.append(row, field);
    store.getState().select('hero00000001');
    field.focus();
    press({ key: 'Escape' }, field);
    field.remove();
    await new Promise((resolve) => requestAnimationFrame(resolve));
    expect(document.activeElement).toBe(row);
  });
});
