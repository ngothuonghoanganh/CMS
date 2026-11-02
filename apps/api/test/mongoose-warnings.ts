import { afterAll, afterEach, beforeAll } from 'vitest';

/**
 * Mongoose reports a deprecated option with a process warning (code `MONGOOSE`) and carries on.
 * The test that caused one fails, so the option is replaced rather than scrolled past.
 */
const warnings: string[] = [];

function collect(warning: Error): void {
  if ('code' in warning && warning.code === 'MONGOOSE') {
    warnings.push(warning.message);
  }
}

beforeAll(() => {
  process.on('warning', collect);
});

afterEach(() => {
  const seen = warnings.splice(0);
  if (seen.length > 0) {
    throw new Error(`Mongoose warned: ${[...new Set(seen)].join(' | ')}`);
  }
});

afterAll(() => {
  process.off('warning', collect);
});
