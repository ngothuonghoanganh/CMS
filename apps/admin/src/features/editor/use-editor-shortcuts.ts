'use client';

import { getSectionDefinition } from '@plp/sections/schema';
import { useEffect } from 'react';
import { focusOutlineRow } from './focus-target';
import type { EditorStore } from './store';

/** Inputs, selects and canvas text keep their own keys (native undo, arrows, Alt combos). */
export function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) {
    return false;
  }
  if (target.closest('[contenteditable]:not([contenteditable="false"])')) {
    return true;
  }
  return ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName);
}

export type ShortcutAction = 'undo' | 'redo' | 'moveUp' | 'moveDown' | 'clearSelection';

/** Maps a key press to an editor action; null leaves the event to the browser. */
export function shortcutFor(
  event: Pick<KeyboardEvent, 'key' | 'ctrlKey' | 'metaKey' | 'shiftKey' | 'altKey' | 'target'>,
): ShortcutAction | null {
  if (event.key === 'Escape') {
    return 'clearSelection';
  }
  if (isTypingTarget(event.target)) {
    return null;
  }
  const key = event.key.toLowerCase();
  const modifier = event.ctrlKey || event.metaKey;
  if (modifier && !event.altKey && key === 'z') {
    return event.shiftKey ? 'redo' : 'undo';
  }
  if (event.ctrlKey && !event.shiftKey && !event.altKey && key === 'y') {
    return 'redo';
  }
  if (event.altKey && !modifier && !event.shiftKey) {
    if (event.key === 'ArrowUp') {
      return 'moveUp';
    }
    if (event.key === 'ArrowDown') {
      return 'moveDown';
    }
  }
  return null;
}

function refocus(element: Element | null) {
  if (!(element instanceof HTMLElement)) {
    return;
  }
  requestAnimationFrame(() => {
    if (element.isConnected && document.activeElement !== element) {
      element.focus();
    }
  });
}

/**
 * Editor keyboard shortcuts (ADR-008): Ctrl/⌘+Z undo, Ctrl/⌘+Shift+Z or Ctrl+Y redo, Alt+↑/↓
 * move the selected section, Escape clears the selection. Ignored inside dialogs and while typing.
 */
export function useEditorShortcuts(store: EditorStore, announce: (message: string) => void): void {
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.defaultPrevented) {
        return;
      }
      if (
        event.target instanceof Element &&
        event.target.closest('[role="dialog"], [role="alertdialog"]')
      ) {
        return;
      }
      const action = shortcutFor(event);
      if (action === null) {
        return;
      }
      const state = store.getState();
      switch (action) {
        case 'clearSelection': {
          const sectionId = state.selection.sectionId;
          if (sectionId !== null) {
            state.select(null);
            focusOutlineRow(sectionId);
          }
          return;
        }
        case 'undo':
          event.preventDefault();
          if (state.undo()) {
            announce('Đã hoàn tác.');
          }
          return;
        case 'redo':
          event.preventDefault();
          if (state.redo()) {
            announce('Đã làm lại.');
          }
          return;
        case 'moveUp':
        case 'moveDown': {
          const sections = state.draft.composition.sections;
          const index = sections.findIndex((section) => section.id === state.selection.sectionId);
          const section = sections[index];
          if (!section) {
            return;
          }
          event.preventDefault();
          const target = action === 'moveUp' ? index - 1 : index + 1;
          const focused = document.activeElement;
          const label = getSectionDefinition(section.type).label;
          if (state.moveSection(section.id, target)) {
            announce(`Đã chuyển ${label} tới vị trí ${target + 1} / ${sections.length}.`);
            refocus(focused);
          } else {
            announce(`Không thể chuyển ${label} ${action === 'moveUp' ? 'lên' : 'xuống'} nữa.`);
          }
          return;
        }
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [store, announce]);
}
