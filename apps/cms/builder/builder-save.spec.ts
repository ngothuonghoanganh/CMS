import { describe, expect, it } from 'vitest';

import { saveStatusAfterAcknowledgement } from './builder-save';

describe('builder save acknowledgement', () => {
  it('marks the document saved when no mutation followed the request', () => {
    expect(saveStatusAfterAcknowledgement(4, 4)).toBe('saved');
  });

  it('keeps the document unsaved when a newer mutation followed the request', () => {
    expect(saveStatusAfterAcknowledgement(4, 5)).toBe('unsaved');
  });
});
