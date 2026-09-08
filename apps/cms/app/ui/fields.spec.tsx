import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { TextField } from './fields';

describe('shared field metadata', () => {
  it('renders required and recommended state consistently', () => {
    const markup = renderToStaticMarkup(
      <TextField
        label="Button text"
        onChange={() => undefined}
        recommended
        required
        value="Button"
      />,
    );

    expect(markup).toContain('Button text');
    expect(markup).toContain('ui-field-required');
    expect(markup).toContain('ui-field-recommended');
    expect(markup).toContain('required=""');
    expect(markup).toContain('aria-label="Button text"');
  });
});
