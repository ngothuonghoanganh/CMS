// @vitest-environment node
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/** Declarations by selector; rules inside @container blocks add to the top-level ones. */
function declarations(file: string): Map<string, string> {
  const css = readFileSync(new URL(file, import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  const bySelector = new Map<string, string>();
  for (const [, selectors = '', body = ''] of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    for (const selector of selectors.split(',').map((part) => part.trim())) {
      bySelector.set(selector, `${bySelector.get(selector) ?? ''}${body}`);
    }
  }
  return bySelector;
}

const frame = declarations('./frame.module.css');
const hero = declarations('./sections/Hero.module.css');

describe('placeholder of an empty text on the canvas', () => {
  it('draws the field name in a scheme text color at full opacity, slanted', () => {
    const placeholder = frame.get('.editable:empty::before') ?? '';
    // themes.spec holds these roles to AA on the background and the surface of every scheme.
    expect(placeholder).toMatch(/(?<![\w-])color:\s*var\(--plp-(heading|text|muted|link)\);/);
    expect(placeholder).toMatch(/(?<![\w-])font-style:\s*italic;/);
  });

  it('never fades a placeholder, wherever it is drawn', () => {
    const placeholders = [...frame, ...hero].filter(([selector]) =>
      selector.endsWith(':empty::before'),
    );
    expect(placeholders.length).toBeGreaterThanOrEqual(5);
    for (const [selector, body] of placeholders) {
      expect(body, selector).not.toMatch(/opacity|filter|color-mix|rgba|transparent/);
    }
  });

  it('keeps the color of the text it stands for in a button and over a Hero photo', () => {
    expect(frame.get('.button .editable:empty::before') ?? '').toMatch(
      /(?<![\w-])color:\s*inherit;/,
    );
    for (const field of ['heading', 'subheading', 'eyebrow']) {
      expect(hero.get(`.overPhoto .${field}:empty::before`) ?? '').toMatch(
        /(?<![\w-])color:\s*inherit;/,
      );
    }
  });
});
