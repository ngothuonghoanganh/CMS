import { describe, expect, it } from 'vitest';

import { createAdminAntdTheme } from './admin-antd-theme';

describe('createAdminAntdTheme', () => {
  it.each(['dark', 'light'] as const)('maps CMS tokens in %s mode', (mode) => {
    const theme = createAdminAntdTheme(mode);

    expect(theme.cssVar).toEqual({ key: `cms-admin-${mode}`, prefix: 'cms-antd' });
    expect(theme.token?.colorPrimary).toBe('var(--cms-primary)');
    expect(theme.token?.colorBgBase).toBe('var(--cms-bg-canvas)');
    expect(theme.token?.fontFamily).toBe('var(--cms-font-sans)');
  });
});
