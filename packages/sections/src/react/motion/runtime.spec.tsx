// @vitest-environment jsdom
import {
  type Composition,
  DEFAULT_PAGE_MOTION,
  type PageMotion,
  type SectionInstance,
  type SectionType,
  sectionTypes,
} from '@plp/contracts';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createSectionInstance } from '../../schema/registry.js';
import type { RenderContext } from '../context.js';
import { PageView } from '../PageView.js';
import { orderIndexes, splitLines, startMotion } from './runtime.js';

const VIEWPORT_HEIGHT = 768;

let nextId = 0;
function section(type: SectionType, variant?: string): SectionInstance {
  nextId += 1;
  return createSectionInstance(type, variant, `run${String(nextId).padStart(8, '0')}`);
}

const ctx: RenderContext = {
  mode: 'live',
  site: { name: 'Smile Care', logo: null },
  images: {},
  pagePaths: {},
  leadCapture: null,
};

/** Positions jsdom does not lay out: each element's top and height, by element. */
const boxes = new Map<Element, { top: number; height: number }>();

function place(element: Element | null | undefined, top: number, height = 400) {
  if (!element) {
    throw new Error('Nothing to place');
  }
  boxes.set(element, { top, height });
}

class FakeObserver {
  static last: FakeObserver | null = null;
  readonly observed = new Set<Element>();
  constructor(
    readonly callback: IntersectionObserverCallback,
    readonly options: IntersectionObserverInit,
  ) {
    FakeObserver.last = this;
  }
  observe(target: Element) {
    this.observed.add(target);
  }
  unobserve(target: Element) {
    this.observed.delete(target);
  }
  disconnect() {
    this.observed.clear();
  }
  /** A visitor scrolls `target` into view. */
  enter(target: Element) {
    this.callback(
      [{ target, isIntersecting: true } as unknown as IntersectionObserverEntry],
      this as unknown as IntersectionObserver,
    );
  }
}

function setReducedMotion(reduce: boolean) {
  vi.stubGlobal(
    'matchMedia',
    vi.fn((query: string) => ({ matches: reduce && query.includes('reduce') })),
  );
}

function mount(motion: Partial<PageMotion>, sections: SectionInstance[]): HTMLElement {
  const composition: Composition = {
    version: 1,
    motion: { ...DEFAULT_PAGE_MOTION, ...motion },
    sections,
  };
  document.body.innerHTML = renderToStaticMarkup(
    <PageView composition={composition} themePresetId="mint" ctx={ctx} />,
  );
  const root = document.querySelector<HTMLElement>('[data-motion-root]');
  if (!root) {
    throw new Error('The page does not move');
  }
  return root;
}

function sectionEl(target: SectionInstance): HTMLElement {
  const element = document.getElementById(`section-${target.id}`);
  if (!element) {
    throw new Error(`No section ${target.id}`);
  }
  return element;
}

beforeEach(() => {
  boxes.clear();
  FakeObserver.last = null;
  vi.useFakeTimers();
  vi.stubGlobal('IntersectionObserver', FakeObserver);
  vi.stubGlobal('innerHeight', VIEWPORT_HEIGHT);
  setReducedMotion(false);
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
    this: HTMLElement,
  ) {
    const box = boxes.get(this) ?? { top: 0, height: 0 };
    return { top: box.top, bottom: box.top + box.height } as DOMRect;
  });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  document.body.innerHTML = '';
});

describe('startMotion', () => {
  it('leaves what is on screen as it is and holds the sections further down until they enter', () => {
    const benefits = section('benefits', 'grid');
    const faq = section('faq');
    const root = mount({ style: 'smooth' }, [section('navbar'), section('hero'), benefits, faq]);
    place(sectionEl(benefits), 600);
    place(sectionEl(faq), 1400);

    startMotion(root);

    expect(sectionEl(benefits).hasAttribute('data-motion')).toBe(false);
    expect(sectionEl(faq).getAttribute('data-motion')).toBe('wait');
    expect([...(FakeObserver.last?.observed ?? [])]).toEqual([sectionEl(faq)]);

    FakeObserver.last?.enter(sectionEl(faq));
    expect(sectionEl(faq).getAttribute('data-motion')).toBe('run');
    expect(FakeObserver.last?.observed.size).toBe(0);
    const places = [...sectionEl(faq).querySelectorAll<HTMLElement>('[data-m]')].map((part) =>
      part.style.getPropertyValue('--plp-m-i'),
    );
    expect(places).toEqual(places.map((_place, index) => String(index)));

    vi.runAllTimers();
    expect(sectionEl(faq).hasAttribute('data-motion')).toBe(false);
  });

  it('does nothing on a device that asks for less motion, or without IntersectionObserver', () => {
    const faq = section('faq');
    setReducedMotion(true);
    const root = mount({ style: 'smooth' }, [section('navbar'), section('hero'), faq]);
    place(sectionEl(faq), 2000);
    startMotion(root);
    expect(sectionEl(faq).hasAttribute('data-motion')).toBe(false);
    expect(FakeObserver.last).toBeNull();

    setReducedMotion(false);
    vi.stubGlobal('IntersectionObserver', undefined);
    startMotion(root);
    expect(sectionEl(faq).hasAttribute('data-motion')).toBe(false);
  });

  it('raises the heading line by line, then gives it back its own text', () => {
    const faq = section('faq');
    const root = mount({ style: 'smooth' }, [section('navbar'), section('hero'), faq]);
    place(sectionEl(faq), 2000);
    const heading = sectionEl(faq).querySelector('h2');
    const text = heading?.firstChild;
    startMotion(root);

    FakeObserver.last?.enter(sectionEl(faq));
    expect(heading?.hasAttribute('data-m-lines')).toBe(true);
    expect(heading?.querySelectorAll('[data-m-mask] > [data-m-word]').length).toBeGreaterThan(1);
    expect(heading?.getAttribute('aria-label')).toBe(text?.textContent);

    vi.runAllTimers();
    expect(heading?.firstChild).toBe(text);
    expect(heading?.childNodes.length).toBe(1);
    expect(heading?.hasAttribute('aria-label')).toBe(false);
  });

  it('keeps headings whole on a phone when the page reduces motion there', () => {
    const faq = section('faq');
    const root = mount({ style: 'smooth', reduceOnMobile: true }, [
      section('navbar'),
      section('hero'),
      faq,
    ]);
    place(sectionEl(faq), 2000);
    vi.spyOn(root, 'clientWidth', 'get').mockReturnValue(390);
    startMotion(root);
    FakeObserver.last?.enter(sectionEl(faq));
    expect(sectionEl(faq).getAttribute('data-motion')).toBe('run');
    expect(sectionEl(faq).querySelector('[data-m-word]')).toBeNull();
  });

  it('shows every section as it is once stopped', () => {
    const faq = section('faq');
    const cta = section('cta_band');
    const root = mount({ style: 'luxe' }, [section('navbar'), section('hero'), faq, cta]);
    place(sectionEl(faq), 2000);
    place(sectionEl(cta), 3000);
    const heading = sectionEl(faq).querySelector('h2');
    const text = heading?.firstChild;
    const stop = startMotion(root);
    FakeObserver.last?.enter(sectionEl(faq));

    stop();
    expect(root.querySelectorAll('[data-motion]').length).toBe(0);
    expect(heading?.firstChild).toBe(text);
    expect(FakeObserver.last?.observed.size).toBe(0);
  });
});

describe('orderIndexes', () => {
  it('starts every part at once, one after another, or row by row', () => {
    document.body.innerHTML = '<p></p><p></p><p></p><p></p>';
    const parts = [...document.querySelectorAll<HTMLElement>('p')];
    parts.forEach((part, index) => {
      place(part, index < 2 ? 100 : 300, 50);
    });
    expect(orderIndexes(parts, 'together')).toEqual([0, 0, 0, 0]);
    expect(orderIndexes(parts, 'stagger')).toEqual([0, 1, 2, 3]);
    expect(orderIndexes(parts, 'rows')).toEqual([0, 0, 2, 2]);
  });
});

describe('splitLines', () => {
  it('numbers the line of each word by where it sits', () => {
    document.body.innerHTML = '<h2>Niềng răng  trong suốt</h2>';
    const heading = document.querySelector('h2');
    if (!heading) {
      throw new Error('No heading');
    }
    // Words land on two lines once split: the first two on top.
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
      this: HTMLElement,
    ) {
      const index = [...heading.querySelectorAll('[data-m-word]')].indexOf(this);
      const top = index < 2 ? 0 : 40;
      return { top, bottom: top + 40 } as DOMRect;
    });
    const { lines, restore } = splitLines(heading);
    const words = [...heading.querySelectorAll<HTMLElement>('[data-m-word]')];
    expect(words.map((word) => word.textContent)).toEqual(['Niềng', 'răng', 'trong', 'suốt']);
    expect(words.map((word) => word.style.getPropertyValue('--plp-m-line'))).toEqual([
      '0',
      '0',
      '1',
      '1',
    ]);
    expect(lines).toBe(2);
    expect(heading.textContent).toBe('Niềng răng  trong suốt');
    restore();
    expect(heading.innerHTML).toBe('Niềng răng  trong suốt');
  });
});

describe('parts of a section', () => {
  it('are marked in every section that can move, and never hold one another', () => {
    for (const type of sectionTypes) {
      if (type === 'navbar') {
        continue;
      }
      const target = section(type);
      // A Hero after another section is not the first of the body, so it may move too.
      mount({ style: 'smooth' }, [section('navbar'), section('faq'), target]);
      const element = sectionEl(target);
      expect(element.querySelectorAll('[data-m]').length, type).toBeGreaterThan(0);
      expect(element.querySelectorAll('[data-m] [data-m]').length, type).toBe(0);
    }
  });
});
