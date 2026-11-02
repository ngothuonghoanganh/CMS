import { describe, expect, it } from 'vitest';
import { toObjectId } from '../../../shared/persistence/object-id.js';
import {
  scopeAfterChange,
  scopeDto,
  type TemplateScopeRecord,
  templateUsableIn,
  templateVisibleTo,
  visibleSiteIds,
} from './template-scope.js';

const SMILE = toObjectId('64b000000000000000000001');
const KITCHEN = toObjectId('64b000000000000000000002');
const SPA = toObjectId('64b000000000000000000003');

const everywhere: TemplateScopeRecord = { kind: 'workspace' };
const smileAndSpa: TemplateScopeRecord = { kind: 'sites', siteIds: [SMILE, SPA] };

describe('who sees a workspace template', () => {
  it('is every member for the whole workspace, and every member of the whole workspace', () => {
    expect(templateVisibleTo(everywhere, [KITCHEN])).toBe(true);
    expect(templateVisibleTo(smileAndSpa, null)).toBe(true);
    expect(templateVisibleTo({ kind: 'sites', siteIds: [] }, null)).toBe(true);
  });

  it('is a member kept to some sites only when one of theirs may use it', () => {
    expect(templateVisibleTo(smileAndSpa, [SPA])).toBe(true);
    expect(templateVisibleTo(smileAndSpa, [KITCHEN])).toBe(false);
    expect(templateVisibleTo(smileAndSpa, [])).toBe(false);
  });
});

describe('where a workspace template may be used', () => {
  it('is every site, or the sites chosen', () => {
    expect(templateUsableIn(everywhere, KITCHEN)).toBe(true);
    expect(templateUsableIn(smileAndSpa, SMILE)).toBe(true);
    expect(templateUsableIn(smileAndSpa, KITCHEN)).toBe(false);
  });

  it('names only the sites the member sees', () => {
    expect(visibleSiteIds(everywhere, [SMILE])).toBeNull();
    expect(visibleSiteIds(smileAndSpa, null)).toEqual([SMILE.toHexString(), SPA.toHexString()]);
    expect(visibleSiteIds(smileAndSpa, [SPA, KITCHEN])).toEqual([SPA.toHexString()]);
    expect(scopeDto(smileAndSpa, [SPA])).toEqual({
      kind: 'sites',
      siteIds: [SPA.toHexString()],
    });
    expect(scopeDto(everywhere, [SPA])).toEqual({ kind: 'workspace' });
  });
});

describe('scopeAfterChange', () => {
  it('takes the sites chosen by a member of the whole workspace', () => {
    expect(scopeAfterChange({ kind: 'sites', siteIds: [KITCHEN] }, smileAndSpa, null)).toEqual({
      ok: true,
      scope: { kind: 'sites', siteIds: [KITCHEN] },
    });
    expect(scopeAfterChange({ kind: 'sites', siteIds: [KITCHEN] }, everywhere, null)).toEqual({
      ok: true,
      scope: { kind: 'sites', siteIds: [KITCHEN] },
    });
    expect(scopeAfterChange({ kind: 'workspace' }, smileAndSpa, [SPA])).toEqual({
      ok: true,
      scope: everywhere,
    });
  });

  it('keeps the sites a member kept to some sites does not see', () => {
    expect(
      scopeAfterChange({ kind: 'sites', siteIds: [KITCHEN] }, smileAndSpa, [KITCHEN, SPA]),
    ).toEqual({ ok: true, scope: { kind: 'sites', siteIds: [KITCHEN, SMILE] } });
  });

  it('refuses a site that is not the member’s', () => {
    expect(scopeAfterChange({ kind: 'sites', siteIds: [SMILE] }, null, [SPA])).toEqual({
      ok: false,
      reason: 'site_not_yours',
    });
  });

  it('refuses a member kept to some sites taking a template away from the sites they do not see', () => {
    expect(scopeAfterChange({ kind: 'sites', siteIds: [SPA] }, everywhere, [SPA])).toEqual({
      ok: false,
      reason: 'narrows_workspace',
    });
    // A template of their own sites they may limit, and a new one too.
    expect(scopeAfterChange({ kind: 'sites', siteIds: [SPA] }, smileAndSpa, [SPA])).toEqual({
      ok: true,
      scope: { kind: 'sites', siteIds: [SPA, SMILE] },
    });
    expect(scopeAfterChange({ kind: 'sites', siteIds: [SPA] }, null, [SPA])).toEqual({
      ok: true,
      scope: { kind: 'sites', siteIds: [SPA] },
    });
  });
});
