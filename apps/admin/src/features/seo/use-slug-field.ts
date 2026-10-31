'use client';

import { slugSchema } from '@plp/contracts';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { problemMessage, reportUnexpected } from '../shell/problem-message';
import { fieldError } from '../shell/use-schema-form';
import { finalizeSlug, isSlugComplete, normalizeSlugTyping } from './seo-presentation';
import { SLUG_CHECK_DELAY_MS, slugAvailabilityQuery } from './slug-availability';

export type SlugCheck =
  /** Nothing to check: the saved slug, or a slug still being typed. */
  | { state: 'idle' }
  | { state: 'checking' }
  | { state: 'available' }
  /** Wrong format, reserved or used by another page. */
  | { state: 'rejected'; message: string }
  /** The check itself failed (network, server). */
  | { state: 'failed'; message: string };

/** The slug the field holds cannot reach the draft: it is refused, or could not be checked. */
export class SlugNotCommittedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SlugNotCommittedError';
  }
}

export interface SlugFieldOptions {
  siteId: string;
  pageId: string;
  /** The slug in the draft. */
  committed: string;
  /** Writes a slug into the draft; called only for slugs the server reported as free. */
  onCommit: (slug: string) => void;
  /** Ends the merged undo step of the typing. */
  onDone: () => void;
  delayMs?: number;
}

export interface SlugField {
  /** What the input shows. */
  text: string;
  check: SlugCheck;
  change: (value: string) => void;
  blur: () => void;
  /**
   * The field holds a slug the draft does not have yet (typed, being checked, or refused): leaving
   * now would drop it. Reads the latest typing, so event handlers can ask between renders.
   */
  isPending: () => boolean;
  /**
   * Before leaving: checks the slug the field holds now, without waiting for the typing pause, and
   * resolves once the draft has it (at once when nothing is pending). Rejects with
   * `SlugNotCommittedError` when the slug is refused or the check fails.
   */
  commit: () => Promise<void>;
}

/** A check sent to the server and not answered yet. */
interface SentCheck {
  run: number;
  outcome: Promise<SlugCheck>;
}

/**
 * The page slug of the SEO form. Typing is normalized and buffered; a slug reaches the draft only
 * after the server confirmed it is free, so autosave never sends a slug another page uses. When the
 * draft gets another slug from elsewhere (a conflict reload), the field shows it and drops the
 * typing.
 */
export function useSlugField({
  siteId,
  pageId,
  committed,
  onCommit,
  onDone,
  delayMs = SLUG_CHECK_DELAY_MS,
}: SlugFieldOptions): SlugField {
  const queryClient = useQueryClient();
  const [editing, setEditingText] = useState<string | null>(null);
  const [check, setCheck] = useState<SlugCheck>({ state: 'idle' });
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Only the answer for the latest text counts.
  const latest = useRef(0);
  // The draft's slug as this field last saw or wrote it.
  const knownSlug = useRef(committed);
  // What the input holds, for `isPending` and `commit` between renders.
  const typed = useRef<string | null>(null);
  const sent = useRef<SentCheck | null>(null);

  function setEditing(value: string | null) {
    typed.current = value;
    setEditingText(value);
  }

  function cancelTimer() {
    if (timer.current !== null) {
      clearTimeout(timer.current);
      timer.current = null;
    }
  }

  useEffect(
    () => () => {
      if (timer.current !== null) {
        clearTimeout(timer.current);
      }
    },
    [],
  );

  useEffect(() => {
    if (committed === knownSlug.current) {
      return;
    }
    // Replaced from elsewhere: the typed text and its check are about the old draft, and an answer
    // still on its way must not write that text over the new one.
    knownSlug.current = committed;
    latest.current += 1;
    sent.current = null;
    cancelTimer();
    setEditing(null);
    setCheck({ state: 'idle' });
  }, [committed]);

  async function verify(slug: string, run: number): Promise<SlugCheck> {
    let outcome: SlugCheck;
    try {
      const result = await queryClient.query(slugAvailabilityQuery(siteId, slug, pageId));
      outcome = result.available
        ? { state: 'available' }
        : {
            state: 'rejected',
            message: result.message ?? 'Đường dẫn này không dùng được, hãy chọn đường dẫn khác',
          };
    } catch (error) {
      if (run !== latest.current) {
        return { state: 'idle' };
      }
      reportUnexpected('Checking the page slug failed', error);
      outcome = { state: 'failed', message: problemMessage(error) };
    }
    if (run !== latest.current) {
      return outcome;
    }
    sent.current = null;
    if (outcome.state === 'available') {
      knownSlug.current = slug;
      onCommit(slug);
    }
    setCheck(outcome);
    return outcome;
  }

  function update(value: string, delay: number) {
    const slug = normalizeSlugTyping(value);
    setEditing(slug);
    latest.current += 1;
    const run = latest.current;
    sent.current = null;
    cancelTimer();
    if (slug === knownSlug.current || !isSlugComplete(slug)) {
      setCheck({ state: 'idle' });
      return;
    }
    const formatProblem = fieldError(slugSchema, slug);
    if (formatProblem !== undefined) {
      setCheck({ state: 'rejected', message: formatProblem });
      return;
    }
    setCheck({ state: 'checking' });
    const send = () => {
      sent.current = { run, outcome: verify(slug, run) };
    };
    if (delay === 0) {
      send();
      return;
    }
    timer.current = setTimeout(() => {
      timer.current = null;
      send();
    }, delay);
  }

  function isPending(): boolean {
    const text = typed.current;
    return text !== null && finalizeSlug(text) !== knownSlug.current;
  }

  async function commit(): Promise<void> {
    // Typing during the check, or a reload of the draft, changes what is pending: look again.
    for (;;) {
      const text = typed.current;
      if (text === null || !isPending()) {
        return;
      }
      const final = finalizeSlug(text);
      const formatProblem = fieldError(slugSchema, final);
      if (formatProblem !== undefined) {
        throw new SlugNotCommittedError(formatProblem);
      }
      // A check of this very text on its way is awaited; anything else (a pause not over yet, an
      // unfinished "uu-dai-", a refused or failed check) is checked again now.
      if (sent.current === null || text !== final) {
        update(final, 0);
      }
      const pending = sent.current;
      if (pending === null) {
        return;
      }
      const outcome = await pending.outcome;
      if (pending.run !== latest.current) {
        continue;
      }
      if (outcome.state === 'rejected' || outcome.state === 'failed') {
        throw new SlugNotCommittedError(outcome.message);
      }
      return;
    }
  }

  return {
    text: editing ?? committed,
    check,
    change(value) {
      update(value, delayMs);
    },
    blur() {
      onDone();
      if (editing === null) {
        return;
      }
      const final = finalizeSlug(editing);
      if (final === committed) {
        // Back to the saved slug: show the draft's value again.
        latest.current += 1;
        sent.current = null;
        cancelTimer();
        setEditing(null);
        setCheck({ state: 'idle' });
        return;
      }
      if (final !== editing) {
        update(final, 0);
      }
    },
    isPending,
    commit,
  };
}
