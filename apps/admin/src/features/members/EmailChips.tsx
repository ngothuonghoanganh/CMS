'use client';

import { CloseIcon, type FieldControlProps } from '@plp/ui';
import { type ClipboardEvent, type KeyboardEvent, useRef, useState } from 'react';
import { cx } from '../shell/cx';
import {
  inviteEmailProblem,
  inviteEmailProblemLabels,
  type KnownEmails,
  normalizeEmail,
  splitEmailInput,
} from './member-presentation';
import styles from './Members.module.css';

/** The emails of "Mời thành viên": those already made into chips, and the one being typed. */
export interface EmailChipsValue {
  emails: string[];
  draft: string;
}

export interface EmailChipsProps {
  /** From the surrounding `Field`: the input's id, label, help and error. */
  control: FieldControlProps;
  value: EmailChipsValue;
  known: KnownEmails;
  onChange: (value: EmailChipsValue) => void;
}

/**
 * Emails as chips (board 15, ADR-021): a comma, a space, Enter or a paste ends one. Each chip says
 * at once when the email is not valid, already a member or already invited. Backspace in the empty
 * input, or the chip's button, removes a chip; both are announced.
 */
export function EmailChips({ control, value, known, onChange }: EmailChipsProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [announcement, setAnnouncement] = useState('');
  const { emails, draft } = value;

  function describe(email: string): string {
    const problem = inviteEmailProblem(email, known);
    return problem === null ? email : `${email} (${inviteEmailProblemLabels[problem]})`;
  }

  function add(found: readonly string[], rest: string) {
    const fresh = [...new Set(found)].filter((email) => !emails.includes(email));
    onChange({ emails: [...emails, ...fresh], draft: rest });
    if (found.length > 0) {
      setAnnouncement(
        fresh.length > 0
          ? `Đã thêm ${fresh.map(describe).join(', ')}.`
          : `${found.join(', ')} đã có trong danh sách.`,
      );
    }
  }

  function remove(email: string) {
    onChange({ emails: emails.filter((item) => item !== email), draft });
    setAnnouncement(`Đã bỏ ${email}.`);
  }

  /** The email being typed becomes a chip. */
  function commit() {
    const email = normalizeEmail(draft);
    add(email === '' ? [] : [email], '');
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    // An input method may still be composing a character.
    if (event.nativeEvent.isComposing) {
      return;
    }
    if (event.key === 'Enter' && draft.trim() !== '') {
      // Enter ends the email; a second Enter, with nothing typed, sends the form.
      event.preventDefault();
      commit();
      return;
    }
    const last = emails.at(-1);
    // A held Backspace repeats: it empties the input as typing does, then stops at the chips
    // instead of removing them all, one per repeat.
    if (event.key === 'Backspace' && draft === '' && last !== undefined && !event.repeat) {
      event.preventDefault();
      remove(last);
    }
  }

  function onPaste(event: ClipboardEvent<HTMLInputElement>) {
    const pasted = event.clipboardData.getData('text');
    if (pasted === '') {
      return;
    }
    // A pasted list is complete: every email in it, the last one too, becomes a chip.
    event.preventDefault();
    const input = event.currentTarget;
    const start = input.selectionStart ?? draft.length;
    const end = input.selectionEnd ?? draft.length;
    const { complete, rest } = splitEmailInput(draft.slice(0, start) + pasted + draft.slice(end));
    const last = normalizeEmail(rest);
    add(last === '' ? complete : [...complete, last], '');
  }

  return (
    <>
      <div
        className={cx(
          styles.chipsFrame,
          control['aria-invalid'] === true && styles.chipsFrameInvalid,
        )}
      >
        {emails.length === 0 ? null : (
          <ul className={styles.chips} aria-label="Địa chỉ đã nhập">
            {emails.map((email) => {
              const problem = inviteEmailProblem(email, known);
              return (
                <li key={email} className={cx(styles.chip, problem !== null && styles.chipProblem)}>
                  <span>
                    {email}
                    {problem === null ? null : ` · ${inviteEmailProblemLabels[problem]}`}
                  </span>
                  <button
                    type="button"
                    className={styles.chipRemove}
                    aria-label={`Bỏ ${email}`}
                    onClick={() => {
                      remove(email);
                      // The button goes away with its chip: typing continues in the input.
                      inputRef.current?.focus();
                    }}
                  >
                    <CloseIcon size={14} />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        <input
          {...control}
          ref={inputRef}
          type="text"
          inputMode="email"
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          className={styles.chipsInput}
          placeholder={emails.length === 0 ? 'Thêm email, cách nhau bằng dấu phẩy' : undefined}
          value={draft}
          onChange={(event) => {
            const { complete, rest } = splitEmailInput(event.target.value);
            add(complete, rest);
          }}
          onKeyDown={onKeyDown}
          onPaste={onPaste}
          onBlur={(event) => {
            // The window lost the focus (another app, another tab), not the input: it keeps the
            // focus and the half-typed email for when the user comes back.
            if (document.activeElement === event.currentTarget) {
              return;
            }
            commit();
          }}
        />
      </div>
      {/* Mounted from the start, so each change is read out (a region mounted with its text is
          not reliably announced). */}
      <p className={styles.srOnly} role="status">
        {announcement}
      </p>
    </>
  );
}
