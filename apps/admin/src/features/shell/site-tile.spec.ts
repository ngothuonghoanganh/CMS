import { describe, expect, it } from 'vitest';
import { siteInitial, siteTileStyle } from './site-tile';

describe('site tile', () => {
  it('uses the first letter of the subdomain, as on the sidebar board', () => {
    expect(siteInitial({ subdomain: 'smilecare', name: 'Nha khoa Smile Care' })).toBe('S');
    expect(siteInitial({ subdomain: '', name: 'đào' })).toBe('Đ');
  });

  it('takes its colors from the site theme', () => {
    expect(siteTileStyle({ themePresetId: 'mint' })).toEqual({
      background: '#EAF6F3',
      color: '#0F5E55',
    });
  });
});
