import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

// jsdom has no ResizeObserver; Radix measures a switch inside a form with it. Nothing resizes in
// jsdom, so an observer that never reports is what a browser would do here.
if (!('ResizeObserver' in globalThis)) {
  class ResizeObserverStub {
    observe = (): undefined => undefined;
    unobserve = (): undefined => undefined;
    disconnect = (): undefined => undefined;
  }
  Object.defineProperty(globalThis, 'ResizeObserver', {
    configurable: true,
    value: ResizeObserverStub,
  });
}

afterEach(() => {
  cleanup();
});
