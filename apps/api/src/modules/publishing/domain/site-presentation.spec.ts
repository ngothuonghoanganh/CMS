import { changeItemSchema } from '@plp/contracts';
import { describe, expect, it } from 'vitest';
import { diffSitePresentation, type SitePresentation } from './site-presentation.js';

const LOGO = 'aaaaaaaaaaaaaaaaaaaaaaaa';
const SHARE = 'bbbbbbbbbbbbbbbbbbbbbbbb';

function presentation(overrides: Partial<SitePresentation> = {}): SitePresentation {
  return {
    name: 'Nha khoa Smile Care',
    themePresetId: 'mint',
    logoAssetId: LOGO,
    defaultShareImageAssetId: null,
    ...overrides,
  };
}

describe('diffSitePresentation', () => {
  it('finds nothing between equal settings', () => {
    expect(diffSitePresentation(presentation(), presentation())).toEqual([]);
  });

  it.each([
    ['the theme', { themePresetId: 'sunset' as const }, 'Giao diện site: giao diện'],
    ['the logo', { logoAssetId: 'cccccccccccccccccccccccc' }, 'Giao diện site: logo'],
    ['a removed logo', { logoAssetId: null }, 'Giao diện site: logo'],
    ['the site name', { name: 'Smile Care Quận 3' }, 'Giao diện site: tên site'],
    ['a new share image', { defaultShareImageAssetId: SHARE }, 'Giao diện site: ảnh chia sẻ'],
  ])('reports %s as one site chip', (_what, patch, label) => {
    const changes = diffSitePresentation(presentation(), presentation(patch));
    expect(changes).toEqual([{ kind: 'site', label, sectionId: null }]);
    expect(changes.map((change) => changeItemSchema.parse(change))).toEqual(changes);
  });

  it('lists several changes in a fixed order: theme, logo, name, share image', () => {
    const changes = diffSitePresentation(
      presentation(),
      presentation({
        name: 'Smile Care',
        defaultShareImageAssetId: SHARE,
        logoAssetId: null,
        themePresetId: 'indigo',
      }),
    );
    expect(changes.map((change) => change.label)).toEqual([
      'Giao diện site: giao diện',
      'Giao diện site: logo',
      'Giao diện site: tên site',
      'Giao diện site: ảnh chia sẻ',
    ]);
  });
});
