/*
 * Runs the motion presets of a page (ADR-032). It only writes what React never renders: the
 * `data-motion` state of a section, the `--plp-m-*` place of its parts, and the masks of a heading
 * whose lines rise, which it takes out again once the section has entered. Sections visible when it
 * starts stay as they are, so nothing on screen hides or flashes; the others wait until a visitor
 * scrolls to them, then run once.
 */

/** A section with motion: `SectionFrame` writes how it enters. */
const SECTION_SELECTOR = '[data-motion-enter]';
const PART_SELECTOR = '[data-m]';
const LINES_SELECTOR = 'h1[data-m], h2[data-m]';
/** A section starts once its top passes this share of the viewport's height from the bottom. */
const START_MARGIN = '0px 0px -15% 0px';
/** Parts this close to the same top sit in one row. */
const ROW_TOLERANCE_PX = 4;
/** Below this page width, "Giảm chuyển động trên điện thoại" applies (§2.1 rule 2). */
const PHONE_WIDTH_PX = 768;
const LINE_STEP_MS = 110;

export interface MotionOptions {
  /** The scrolling element sections enter; null is the viewport. */
  scrollRoot?: Element | null;
}

function msOf(element: HTMLElement, property: string): number {
  const value = Number.parseFloat(element.style.getPropertyValue(property));
  return Number.isFinite(value) ? value : 0;
}

/** Row of each element by its top, row 0 first. */
function rowsOf(elements: readonly HTMLElement[]): number[] {
  const tops = elements.map((element) => element.getBoundingClientRect().top);
  const rows: number[] = [];
  for (const top of [...tops].sort((a, b) => a - b)) {
    const last = rows[rows.length - 1];
    if (last === undefined || top - last > ROW_TOLERANCE_PX) {
      rows.push(top);
    }
  }
  return tops.map((top) => rows.findIndex((row) => Math.abs(top - row) <= ROW_TOLERANCE_PX));
}

/**
 * The place of each part in the section's order: all at once, one after another in page order, or
 * row by row with a pause between rows.
 */
export function orderIndexes(parts: readonly HTMLElement[], order: string | undefined): number[] {
  if (order === 'stagger') {
    return parts.map((_part, index) => index);
  }
  if (order === 'rows') {
    return rowsOf(parts).map((row) => row * 2);
  }
  return parts.map(() => 0);
}

/**
 * Wraps each word of a heading in a mask and numbers its line, so the lines rise one after another.
 * Returns how to put the heading back as it was, with its own text nodes, which React owns.
 */
export function splitLines(heading: HTMLElement): { lines: number; restore: () => void } {
  const original = [...heading.childNodes];
  const text = heading.textContent;
  const ownLabel = heading.getAttribute('aria-label');
  const doc = heading.ownerDocument;
  const words: HTMLElement[] = [];
  const pieces = text.split(/(\s+)/).filter((piece) => piece !== '');
  heading.replaceChildren(
    ...pieces.map((piece) => {
      if (/^\s+$/.test(piece)) {
        return doc.createTextNode(piece);
      }
      const mask = doc.createElement('span');
      mask.setAttribute('data-m-mask', '');
      const word = doc.createElement('span');
      word.setAttribute('data-m-word', '');
      word.textContent = piece;
      mask.append(word);
      words.push(word);
      return mask;
    }),
  );
  // Screen readers read the heading whole, not word by word, while it is split.
  heading.setAttribute('aria-label', text);
  heading.setAttribute('data-m-lines', '');
  const rows = rowsOf(words);
  words.forEach((word, index) => {
    word.style.setProperty('--plp-m-line', String(rows[index] ?? 0));
  });
  return {
    lines: Math.max(0, ...rows) + 1,
    restore: () => {
      heading.replaceChildren(...original);
      heading.removeAttribute('data-m-lines');
      if (ownLabel === null) {
        heading.removeAttribute('aria-label');
      } else {
        heading.setAttribute('aria-label', ownLabel);
      }
    },
  };
}

/**
 * Starts the page's motion inside `root` (the element `PageView` marks `data-motion-root`) and
 * returns how to stop it: every section then shows as it is.
 */
export function startMotion(root: HTMLElement, options: MotionOptions = {}): () => void {
  const view = root.ownerDocument.defaultView;
  if (
    view === null ||
    typeof view.IntersectionObserver !== 'function' ||
    view.matchMedia('(prefers-reduced-motion: reduce)').matches
  ) {
    return () => undefined;
  }
  const timers = new Set<ReturnType<typeof setTimeout>>();
  const restores = new Map<HTMLElement, (() => void)[]>();

  function finish(section: HTMLElement) {
    for (const restore of restores.get(section) ?? []) {
      restore();
    }
    restores.delete(section);
    section.removeAttribute('data-motion');
  }

  function run(section: HTMLElement) {
    const parts = [...section.querySelectorAll<HTMLElement>(PART_SELECTOR)];
    const indexes = orderIndexes(parts, section.dataset['motionOrder']);
    parts.forEach((part, index) => {
      part.style.setProperty('--plp-m-i', String(indexes[index] ?? 0));
    });
    const accents = (section.dataset['motionAccents'] ?? '').split(' ');
    const phoneReduced =
      root.hasAttribute('data-motion-reduce-mobile') && root.clientWidth < PHONE_WIDTH_PX;
    let lines = 0;
    if (accents.includes('lines') && !phoneReduced) {
      const split = [...section.querySelectorAll<HTMLElement>(LINES_SELECTOR)].map(splitLines);
      restores.set(
        section,
        split.map((heading) => heading.restore),
      );
      lines = Math.max(0, ...split.map((heading) => heading.lines));
    }
    section.setAttribute('data-motion', 'run');
    const speed = Number.parseFloat(root.style.getPropertyValue('--plp-m-speed')) || 1;
    const duration = msOf(section, '--plp-m-dur');
    const step = msOf(section, '--plp-m-step');
    // The last part's delay, the longest of its animations (an image settles for 1.6 times the
    // duration, a line rises for 1.5), and the last line's own delay.
    const total =
      (Math.max(0, ...indexes) * step + duration * 2 + lines * LINE_STEP_MS + step) * speed;
    const timer = setTimeout(() => {
      timers.delete(timer);
      finish(section);
    }, total);
    timers.add(timer);
  }

  const observer = new view.IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting && entry.target instanceof view.HTMLElement) {
          observer.unobserve(entry.target);
          run(entry.target);
        }
      }
    },
    { root: options.scrollRoot ?? null, rootMargin: START_MARGIN },
  );

  const viewport = options.scrollRoot?.getBoundingClientRect() ?? {
    top: 0,
    bottom: view.innerHeight,
  };
  for (const section of root.querySelectorAll<HTMLElement>(SECTION_SELECTOR)) {
    const rect = section.getBoundingClientRect();
    if (rect.top < viewport.bottom && rect.bottom > viewport.top) {
      continue;
    }
    section.setAttribute('data-motion', 'wait');
    observer.observe(section);
  }

  return () => {
    observer.disconnect();
    for (const timer of timers) {
      clearTimeout(timer);
    }
    timers.clear();
    for (const section of root.querySelectorAll<HTMLElement>('[data-motion]')) {
      finish(section);
    }
  };
}
