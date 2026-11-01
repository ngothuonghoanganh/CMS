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
  const [editing, setEditing] = useState<string | null>(null);
  const [check, setCheck] = useState<SlugCheck>({ state: 'idle' });
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Only the answer for the latest text counts.
  const latest = useRef(0);
  // The draft's slug as this field last saw or wrote it.
  const knownSlug = useRef(committed);

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
    if (timer.current !== null) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    setEditing(null);
    setCheck({ state: 'idle' });
  }, [committed]);

  async function verify(slug: string, run: number) {
    try {
      const result = await queryClient.query(slugAvailabilityQuery(siteId, slug, pageId));
      if (run !== latest.current) {
        return;
      }
      if (result.available) {
        knownSlug.current = slug;
        onCommit(slug);
        setCheck({ state: 'available' });
      } else {
        setCheck({
          state: 'rejected',
          message: result.message ?? 'Đường dẫn này không dùng được, hãy chọn đường dẫn khác',
        });
      }
    } catch (error) {
      if (run !== latest.current) {
        return;
      }
      reportUnexpected('Checking the page slug failed', error);
      setCheck({ state: 'failed', message: problemMessage(error) });
    }
  }

  function update(value: string, delay: number) {
    const slug = normalizeSlugTyping(value);
    setEditing(slug);
    latest.current += 1;
    const run = latest.current;
    if (timer.current !== null) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    if (slug === committed || !isSlugComplete(slug)) {
      setCheck({ state: 'idle' });
      return;
    }
    const formatProblem = fieldError(slugSchema, slug);
    if (formatProblem !== undefined) {
      setCheck({ state: 'rejected', message: formatProblem });
      return;
    }
    setCheck({ state: 'checking' });
    if (delay === 0) {
      void verify(slug, run);
      return;
    }
    timer.current = setTimeout(() => {
      timer.current = null;
      void verify(slug, run);
    }, delay);
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
        if (timer.current !== null) {
          clearTimeout(timer.current);
          timer.current = null;
        }
        setEditing(null);
        setCheck({ state: 'idle' });
        return;
      }
      if (final !== editing) {
        update(final, 0);
      }
    },
  };
}
