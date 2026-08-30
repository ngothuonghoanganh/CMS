import { describe, expect, it } from 'vitest';

import { resolveInspectorStyleValue } from './inspector-value';

describe('resolveInspectorStyleValue', () => {
  it('returns the authored desktop value as effective', () => {
    expect(
      resolveInspectorStyleValue({ base: { padding: '32px' } }, 'padding', 'desktop'),
    ).toEqual({
      authoredValue: '32px',
      effectiveValue: '32px',
      inherited: false,
      sourceViewport: 'desktop',
    });
  });

  it('resolves inherited tablet and mobile values', () => {
    const style = { base: { padding: '32px' }, tablet: undefined, mobile: undefined };
    expect(resolveInspectorStyleValue(style, 'padding', 'tablet')).toEqual({
      effectiveValue: '32px',
      inherited: true,
      sourceViewport: 'desktop',
    });
    expect(resolveInspectorStyleValue(style, 'padding', 'mobile')).toEqual({
      effectiveValue: '32px',
      inherited: true,
      sourceViewport: 'desktop',
    });
  });

  it('prefers the nearest authored override and exposes reset state', () => {
    const style = {
      base: { padding: '32px' },
      tablet: { padding: '24px' },
      mobile: undefined,
    };
    expect(resolveInspectorStyleValue(style, 'padding', 'mobile')).toEqual({
      effectiveValue: '24px',
      inherited: true,
      sourceViewport: 'tablet',
    });
    expect(resolveInspectorStyleValue(style, 'padding', 'tablet')).toEqual({
      authoredValue: '24px',
      effectiveValue: '24px',
      inherited: false,
      sourceViewport: 'tablet',
    });
  });
});
