import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

// jsdom has no pointer-capture API; Radix calls it while handling pointer events (toast swipe,
// menus). The stubs behave like a browser where nothing has captured the pointer. Specs that run
// in the node environment (tokens) have no DOM at all.
if ('Element' in globalThis) {
  for (const method of ['hasPointerCapture', 'setPointerCapture', 'releasePointerCapture']) {
    if (!Reflect.has(Element.prototype, method)) {
      Object.defineProperty(Element.prototype, method, {
        configurable: true,
        value: method === 'hasPointerCapture' ? () => false : () => undefined,
      });
    }
  }
}

afterEach(() => {
  cleanup();
});
