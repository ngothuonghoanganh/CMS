'use client';

import { type ElementType, type KeyboardEvent, useLayoutEffect, useRef, useState } from 'react';
import frame from './frame.module.css';

export interface EditableTextProps {
  as: ElementType;
  className: string | undefined;
  value: string;
  multiline: boolean;
  placeholder: string;
  onCommit: (value: string) => void;
}

/**
 * Plain-text editing on the canvas. The DOM text is the editing buffer; the value is committed on
 * blur or Enter (single line), so one edit becomes one undo step.
 */
export function EditableText({
  as: Tag,
  className,
  value,
  multiline,
  placeholder,
  onCommit,
}: EditableTextProps) {
  const ref = useRef<HTMLElement>(null);
  // Bumped by every commit: the host may keep `value` as it was (text cut back to a full field's
  // limit, whitespace the commit normalized away) and then nothing else rewrites the element.
  const [commits, setCommits] = useState(0);

  useLayoutEffect(() => {
    const element = ref.current;
    // Chromium leaves a <br> in a field emptied by editing: the text matches an empty value, but
    // the element is not `:empty`, so its placeholder would not show.
    if (
      element &&
      document.activeElement !== element &&
      (element.textContent !== value || element.firstElementChild !== null)
    ) {
      element.textContent = value;
    }
  }, [value, commits]);

  function commit() {
    const element = ref.current;
    if (!element) {
      return;
    }
    const raw = element.innerText.replace(/\u00a0/g, ' ');
    const next = multiline
      ? raw.replace(/\n{3,}/g, '\n\n').trim()
      : raw.replace(/\s+/g, ' ').trim();
    if (next !== value) {
      onCommit(next);
    }
    setCommits((count) => count + 1);
  }

  function onKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (event.key === 'Enter' && !multiline) {
      event.preventDefault();
      ref.current?.blur();
    }
    if (event.key === 'Escape') {
      if (ref.current) {
        ref.current.textContent = value;
      }
      ref.current?.blur();
    }
  }

  return (
    <Tag
      ref={ref}
      className={[className, frame.editable].filter(Boolean).join(' ')}
      contentEditable="plaintext-only"
      suppressContentEditableWarning
      role="textbox"
      aria-multiline={multiline}
      aria-label={placeholder}
      data-placeholder={placeholder}
      onBlur={commit}
      onKeyDown={onKeyDown}
    />
  );
}
