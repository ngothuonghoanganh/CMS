import { describe, expect, it } from 'vitest';
import { deleteSiteRequestSchema, siteNameConfirms } from './site.js';

describe('siteNameConfirms', () => {
  it('matches the name typed again, whichever Unicode form carries its accents', () => {
    const composed = 'Nha khoa Smile Care Quận 1'.normalize('NFC');
    const decomposed = composed.normalize('NFD');
    expect(decomposed).not.toBe(composed);
    expect(siteNameConfirms(decomposed, composed)).toBe(true);
    expect(siteNameConfirms(composed, decomposed)).toBe(true);
    expect(siteNameConfirms(`  ${composed} `, composed)).toBe(true);
  });

  it('refuses another name, letter case or accent included', () => {
    expect(siteNameConfirms('nha khoa smile care quận 1', 'Nha khoa Smile Care Quận 1')).toBe(
      false,
    );
    expect(siteNameConfirms('Nha khoa Smile Care Quan 1', 'Nha khoa Smile Care Quận 1')).toBe(
      false,
    );
    expect(siteNameConfirms('', 'Nha khoa Smile Care')).toBe(false);
  });
});

describe('deleteSiteRequestSchema', () => {
  it('trims the typed name and bounds it like a site name', () => {
    expect(deleteSiteRequestSchema.parse({ confirmName: ' Bếp Nhà Mây ' })).toEqual({
      confirmName: 'Bếp Nhà Mây',
    });
    expect(deleteSiteRequestSchema.safeParse({ confirmName: 'x'.repeat(81) }).success).toBe(false);
    expect(deleteSiteRequestSchema.safeParse({}).success).toBe(false);
  });
});
