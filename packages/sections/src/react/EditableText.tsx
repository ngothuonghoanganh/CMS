'use client';

import { type ElementType, type KeyboardEvent, useLayoutEffect, useRef } from 'react';
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

  useLayoutEffect(() => {
    const element = ref.current;
    if (element && document.activeElement !== element && element.textContent !== value) {
      element.textContent = value;
    }
  }, [value]);

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
