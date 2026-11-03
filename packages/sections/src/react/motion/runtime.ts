/*
 * Runs the motion presets of a page (ADR-032). It only writes what React never renders: the
 * `data-motion` state of a section, the `--plp-m-*` place of its parts, the masks of a heading whose
 * lines rise and the passing values of a figure that counts up, which it takes back once the
 * section has entered. On a live page, sections visible when it starts stay as they are, so nothing
 * on screen hides or flashes; the others wait until a visitor scrolls to them, then run once. The
 * editor plays a page or one section on demand ("Chạy thử"), and its samples of a style at once.
 */

/** A section with motion: `SectionFrame` writes how it enters. */
const SECTION_SELECTOR = '[data-motion-enter]';
const PART_SELECTOR = '[data-m]';
const LINES_SELECTOR = 'h1[data-m], h2[data-m]';
/** A figure drawn for sighted visitors only; screen readers read its real value beside it. */
const COUNT_SELECTOR = '[data-m-count]';
const COUNT_MS = 1100;
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

/** A figure as written: "8.000+" is 8000, with "." between thousands and "+" after it. */
export interface Figure {
  prefix: string;
  value: number;
  decimals: number;
  groupMark: string | null;
  decimalMark: string;
  suffix: string;
}

/**
 * Reads a figure that can count up: one number, in groups of three digits or not, maybe with
 * decimals, between other text ("4,9/5", "Top 3", "100%", "24/7"). Null for anything else, which
 * then only enters like any other part.
 */
export function parseFigure(text: string): Figure | null {
  // What follows may name what the figure is out of ("/5", "/7"), but holds no other number.
  const match = /^(\D*?)(\d{1,3}(?:([.,])\d{3})+|\d+)(?:([.,])(\d+))?((?:\D|\/\d+)*)$/.exec(text);
  if (match === null) {
    return null;
  }
  const [, prefix = '', whole = '', groupMark, decimalMark, decimals = '', suffix = ''] = match;
  const digits = groupMark === undefined ? whole : whole.split(groupMark).join('');
  return {
    prefix,
    value: Number(`${digits}.${decimals || '0'}`),
    decimals: decimals.length,
    groupMark: groupMark ?? null,
    decimalMark: decimalMark ?? (groupMark === '.' ? ',' : '.'),
    suffix,
  };
}

/** `value` written the way the figure writes its own. */
export function formatFigure(figure: Figure, value: number): string {
  const [whole = '0', decimals = ''] = value.toFixed(figure.decimals).split('.');
  const grouped =
    figure.groupMark === null ? whole : whole.replace(/\B(?=(\d{3})+$)/g, figure.groupMark);
  return `${figure.prefix}${grouped}${decimals ? `${figure.decimalMark}${decimals}` : ''}${figure.suffix}`;
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

interface MotionController {
  /** Runs one section now; `onFinished` follows once it is left as it was. */
  run: (section: HTMLElement, onFinished?: () => void) => void;
  /** Stops every timer and puts every section back as it was. */
  stop: () => void;
}

/** How much slower than real time the editor's "Xem chậm" plays: the page's `--plp-m-speed`. */
function speedOf(root: HTMLElement, view: Window): number {
  const value = Number.parseFloat(view.getComputedStyle(root).getPropertyValue('--plp-m-speed'));
  return Number.isFinite(value) && value > 0 ? value : 1;
}

function motionController(root: HTMLElement, view: Window): MotionController {
  const timers = new Set<ReturnType<typeof setTimeout>>();
  const frames = new Set<number>();
  const restores = new Map<HTMLElement, (() => void)[]>();

  /**
   * Counts a figure up from 0 once its part starts, writing into the text node React rendered so
   * React keeps owning it, and ends on the exact text it started with.
   */
  function countUp(element: HTMLElement, delayMs: number, speed: number): (() => void) | null {
    const node = element.firstChild;
    const original = node?.nodeValue ?? null;
    const figure = original === null ? null : parseFigure(original);
    if (node === null || original === null || figure === null) {
      return null;
    }
    node.nodeValue = formatFigure(figure, 0);
    const start = view.performance.now() + delayMs * speed;
    const tick = (now: number) => {
      const progress = Math.min(1, Math.max(0, (now - start) / (COUNT_MS * speed)));
      node.nodeValue =
        progress >= 1 ? original : formatFigure(figure, figure.value * (1 - (1 - progress) ** 3));
      if (progress < 1) {
        frames.add(view.requestAnimationFrame(tick));
      }
    };
    frames.add(view.requestAnimationFrame(tick));
    return () => {
      node.nodeValue = original;
    };
  }

  function finish(section: HTMLElement) {
    for (const restore of restores.get(section) ?? []) {
      restore();
    }
    restores.delete(section);
    section.removeAttribute('data-motion');
  }

  function run(section: HTMLElement, onFinished?: () => void) {
    const parts = [...section.querySelectorAll<HTMLElement>(PART_SELECTOR)];
    const indexes = orderIndexes(parts, section.dataset['motionOrder']);
    parts.forEach((part, index) => {
      part.style.setProperty('--plp-m-i', String(indexes[index] ?? 0));
    });
    const accents = (section.dataset['motionAccents'] ?? '').split(' ');
    const phoneReduced =
      root.hasAttribute('data-motion-reduce-mobile') && root.clientWidth < PHONE_WIDTH_PX;
    const speed = speedOf(root, view);
    const duration = msOf(section, '--plp-m-dur');
    const step = msOf(section, '--plp-m-step');
    const undo: (() => void)[] = [];
    let lines = 0;
    if (accents.includes('lines') && !phoneReduced) {
      const split = [...section.querySelectorAll<HTMLElement>(LINES_SELECTOR)].map(splitLines);
      undo.push(...split.map((heading) => heading.restore));
      lines = Math.max(0, ...split.map((heading) => heading.lines));
    }
    let counting = 0;
    if (accents.includes('count')) {
      // Phones that reduce motion still count: the figure only changes in place.
      for (const element of section.querySelectorAll<HTMLElement>(COUNT_SELECTOR)) {
        const part = element.closest<HTMLElement>(PART_SELECTOR);
        const delay = (indexes[part === null ? -1 : parts.indexOf(part)] ?? 0) * step;
        const restore = countUp(element, delay, speed);
        if (restore !== null) {
          undo.push(restore);
          counting = Math.max(counting, delay + COUNT_MS);
        }
      }
    }
    restores.set(section, undo);
    section.setAttribute('data-motion', 'run');
    // The last part's delay, the longest of its animations (an image settles for 1.6 times the
    // duration, a line rises for 1.5), the last line's own delay, and the last figure counting.
    const total =
      Math.max(
        Math.max(0, ...indexes) * step + duration * 2 + lines * LINE_STEP_MS + step,
        counting,
      ) * speed;
    const timer = setTimeout(() => {
      timers.delete(timer);
      finish(section);
      onFinished?.();
    }, total);
    timers.add(timer);
  }

  function stop() {
    for (const timer of timers) {
      clearTimeout(timer);
    }
    timers.clear();
    for (const frame of frames) {
      view.cancelAnimationFrame(frame);
    }
    frames.clear();
    for (const section of root.querySelectorAll<HTMLElement>('[data-motion]')) {
      finish(section);
    }
  }

  return { run, stop };
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
  const motion = motionController(root, view);
  const observer = new view.IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting && entry.target instanceof view.HTMLElement) {
          observer.unobserve(entry.target);
          motion.run(entry.target);
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
    motion.stop();
  };
}

export interface PlayOptions {
  /** The editor's scrolling canvas, which the whole page scrolls through as a visitor would. */
  scrollRoot: HTMLElement;
  /** One section to run ("Chạy thử section này"), or null for the whole page. */
  sectionId: string | null;
  /** Every section played has entered and is left as it was. */
  onDone: () => void;
}

/** Time to scroll through one canvas height while the whole page plays. */
const SCROLL_PER_SCREEN_MS = 1400;

/**
 * "Chạy thử" in the editor (ADR-032): every moving section, on screen or not, enters as a visitor
 * would see it. The whole page plays from the top while the canvas scrolls down by itself; one
 * section plays where it is. Returns how to stop, which puts every section back as it was.
 */
export function playMotion(root: HTMLElement, options: PlayOptions): () => void {
  const view = root.ownerDocument.defaultView;
  const sections = [...root.querySelectorAll<HTMLElement>(SECTION_SELECTOR)].filter(
    (section) =>
      section.getClientRects().length > 0 &&
      (options.sectionId === null || section.id === `section-${options.sectionId}`),
  );
  if (view === null || typeof view.IntersectionObserver !== 'function' || sections.length === 0) {
    options.onDone();
    return () => undefined;
  }
  const motion = motionController(root, view);
  let left = sections.length;
  const entered = () => {
    left -= 1;
    if (left === 0) {
      options.onDone();
    }
  };
  for (const section of sections) {
    section.setAttribute('data-motion', 'wait');
  }

  const [only] = sections;
  if (options.sectionId !== null && only !== undefined) {
    only.scrollIntoView({ block: 'center' });
    motion.run(only, entered);
    return motion.stop;
  }

  const scroller = options.scrollRoot;
  scroller.scrollTop = 0;
  const observer = new view.IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting && entry.target instanceof view.HTMLElement) {
          observer.unobserve(entry.target);
          motion.run(entry.target, entered);
        }
      }
    },
    { root: scroller },
  );
  for (const section of sections) {
    observer.observe(section);
  }

  // The canvas scrolls down at a visitor's pace, easing in and out.
  const distance = scroller.scrollHeight - scroller.clientHeight;
  const duration =
    (distance / Math.max(1, scroller.clientHeight)) * SCROLL_PER_SCREEN_MS * speedOf(root, view);
  let frame: number | null = null;
  if (distance > 0) {
    const start = view.performance.now();
    const scroll = (now: number) => {
      const progress = Math.min(1, (now - start) / duration);
      const eased = progress < 0.5 ? 2 * progress ** 2 : 1 - (-2 * progress + 2) ** 2 / 2;
      scroller.scrollTop = distance * eased;
      frame = progress < 1 ? view.requestAnimationFrame(scroll) : null;
    };
    frame = view.requestAnimationFrame(scroll);
  }

  return () => {
    observer.disconnect();
    if (frame !== null) {
      view.cancelAnimationFrame(frame);
    }
    motion.stop();
  };
}

/** Plays every moving section inside `root` at once: the samples of a style in the editor. */
export function playSample(root: HTMLElement): () => void {
  const view = root.ownerDocument.defaultView;
  if (view === null) {
    return () => undefined;
  }
  const motion = motionController(root, view);
  for (const section of root.querySelectorAll<HTMLElement>(SECTION_SELECTOR)) {
    motion.run(section);
  }
  return motion.stop;
}
