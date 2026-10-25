'use client';

import { Field, Input } from '@plp/ui';
import { type ReactNode, useState } from 'react';

export interface CommittedInputProps {
  label: ReactNode;
  /** The value in the draft. */
  value: string;
  /** Returns the problem with a value, or null when it may be saved. */
  validate: (text: string) => string | null;
  onCommit: (text: string) => void;
  placeholder?: string | undefined;
  help?: ReactNode;
  type?: 'text' | 'url' | 'tel';
  inputMode?: 'text' | 'url' | 'tel';
  mono?: boolean;
}

/**
 * An input whose value only reaches the draft once it is valid (on blur or Enter): a URL is
 * typed through invalid prefixes ("htt…"), and the draft must never hold an invalid link.
 * Undo or a reload from the server resets the text. The input itself stays mounted, so focus
 * stays in it after Enter commits.
 */
export function CommittedInput({
  label,
  value,
  validate,
  onCommit,
  placeholder,
  help,
  type = 'text',
  inputMode,
  mono = false,
}: CommittedInputProps) {
  const [text, setText] = useState(value);
  const [error, setError] = useState<string | null>(null);
  // The draft value changed (a commit, undo, or a reload from the server): show it.
  const [shownValue, setShownValue] = useState(value);
  if (shownValue !== value) {
    setShownValue(value);
    setText(value);
    setError(null);
  }

  function commit() {
    if (text === value) {
      setError(null);
      return;
    }
    const problem = validate(text);
    setError(problem);
    if (problem === null) {
      onCommit(text);
    }
  }

  return (
    <Field label={label} help={help} error={error ?? undefined}>
      <Input
        type={type}
        inputMode={inputMode}
        mono={mono}
        value={text}
        placeholder={placeholder}
        onChange={(event) => {
          setText(event.target.value);
          if (error !== null) {
            setError(validate(event.target.value));
          }
        }}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault();
            commit();
          }
        }}
      />
    </Field>
  );
}
