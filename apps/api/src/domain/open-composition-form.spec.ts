import { describe, expect, it } from 'vitest';
import {
  OpenCompositionPayloadSchema,
  instantiateOpenCompositionRecipe,
} from '@payload/contracts';

import { findResolvedForm } from './open-composition-form';

describe('Open Composition form adapter', () => {
  it('projects composable field behaviors into the stable submission contract', () => {
    const document = instantiateOpenCompositionRecipe(
      'contact-form',
      (source) => `fresh-${source}`,
    );
    const payload = OpenCompositionPayloadSchema.parse({
      version: 8,
      metadata: { documentTitle: 'Composable form' },
      root: document.root,
      behaviors: document.behaviors,
    });
    const form = findResolvedForm(payload.root, 'fresh-form', payload.behaviors);
    expect(form?.props.fields.map((field) => field.id)).toEqual([
      'name',
      'email',
      'message',
    ]);
    expect(form?.props.fields[1]).toMatchObject({
      type: 'email',
      name: 'email',
      required: true,
    });
    expect(form?.props.submitLabel).toBe('Submit');
  });
});
