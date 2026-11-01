// @vitest-environment node
import { readdirSync, readFileSync } from 'node:fs';
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
const leadForm = declarations('./sections/LeadForm.module.css');

/** Every rule of the canvas frame and of each section, by selector. */
const everyRule = [
  ...frame,
  ...readdirSync(new URL('./sections/', import.meta.url))
    .filter((file) => file.endsWith('.module.css'))
    .flatMap((file) => [...declarations(`./sections/${file}`)]),
];

describe('placeholder of an empty text on the canvas', () => {
  it('draws the field name in a scheme text color at full opacity, slanted', () => {
    const placeholder = frame.get('.editable:empty::before') ?? '';
    // themes.spec holds these roles to AA on the background and the surface of every scheme.
    expect(placeholder).toMatch(/(?<![\w-])color:\s*var\(--plp-(heading|text|muted|link)\);/);
    expect(placeholder).toMatch(/(?<![\w-])font-style:\s*italic;/);
  });

  it('never fades a placeholder or its empty text, wherever it is drawn', () => {
    // An empty element passes its opacity on to its placeholder, so its rules count too.
    const empty = everyRule.filter(
      ([selector]) => selector.includes(':empty') && !selector.includes(':not(:empty)'),
    );
    expect(empty.length).toBeGreaterThanOrEqual(5);
    for (const [selector, body] of empty) {
      expect(body, selector).not.toMatch(/opacity|filter|color-mix|rgba|transparent/);
      for (const [, color = ''] of body.matchAll(/(?<![\w-])color:\s*([^;]+);/g)) {
        expect(color, selector).toMatch(/^(inherit|var\(--plp-(heading|text|muted|link)\))$/);
      }
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

describe('send button of the lead form', () => {
  it('shows that a lead is on its way, since it stays enabled while sending', () => {
    const busy = leadForm.get(".submit[aria-busy='true']") ?? '';
    expect(busy).toMatch(/(?<![\w-])cursor:\s*progress;/);
    expect(busy).toMatch(/(?<![\w-])opacity:\s*0\.\d+;/);
  });
});
