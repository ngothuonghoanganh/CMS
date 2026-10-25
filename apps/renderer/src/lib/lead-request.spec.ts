import { describe, expect, it } from 'vitest';
import { escapeHtml, leadResultHtml, safeBackPath } from './lead-result-page';
import {
  checkLeadRequest,
  leadProblemsOf,
  leadRequestCandidate,
  leadSourceFrom,
} from './lead-request';

describe('leadSourceFrom', () => {
  it('reads campaign tags from the page address and keeps the referrer', () => {
    expect(
      leadSourceFrom(
        'https://smilecare.payload.site/uu-dai?utm_source=zalo&utm_medium=oa&utm_campaign=t11',
        'https://zalo.me/',
      ),
    ).toEqual({
      utmSource: 'zalo',
      utmMedium: 'oa',
      utmCampaign: 't11',
      referrer: 'https://zalo.me/',
    });
  });

  it('has no tags without a page address and drops an empty referrer', () => {
    expect(leadSourceFrom(null, '')).toEqual({
      utmSource: null,
      utmMedium: null,
      utmCampaign: null,
      referrer: null,
    });
  });
});

describe('leadRequestCandidate and checkLeadRequest', () => {
  const form = new Map([
    ['releaseId', 'c'.repeat(24)],
    ['name', 'Nguyễn Thu Hà'],
    ['phone', '0901 234 567'],
    ['website', ''],
  ]);
  const extras = {
    submissionId: null,
    elapsedMs: null,
    source: leadSourceFrom(null, null),
  };

  it('reads an unticked consent box as no consent, which the check refuses', () => {
    const candidate = leadRequestCandidate((name) => form.get(name) ?? null, extras);
    expect(candidate).toMatchObject({ consent: false, marketing: false, email: '', message: '' });
    const check = checkLeadRequest(candidate);
    expect(check.ok).toBe(false);
    expect(check.ok ? [] : leadProblemsOf(check.issues)).toEqual({
      fields: { consent: 'Bạn cần đồng ý để gửi đăng ký' },
      other: [],
    });
  });

  it('accepts the form once the box is ticked', () => {
    const ticked = new Map([...form, ['consent', 'yes']]);
    expect(
      checkLeadRequest(leadRequestCandidate((name) => ticked.get(name) ?? null, extras)),
    ).toEqual({ ok: true });
  });

  it('keeps the first message per field and the rest for the form', () => {
    expect(
      leadProblemsOf([
        { path: ['phone'], code: 'custom', message: 'A' },
        { path: ['phone'], code: 'custom', message: 'B' },
        { path: ['releaseId'], code: 'invalid_string', message: 'Mã định danh không hợp lệ' },
      ]),
    ).toEqual({ fields: { phone: 'A' }, other: ['Mã định danh không hợp lệ'] });
  });
});

describe('lead result page', () => {
  it('escapes every value it shows', () => {
    expect(escapeHtml(`<script>"x"&'y'</script>`)).toBe(
      '&lt;script&gt;&quot;x&quot;&amp;&#39;y&#39;&lt;/script&gt;',
    );
    const html = leadResultHtml('invalid', '/uu-dai', ['<b>Số điện thoại</b>']);
    expect(html).toContain('<li>&lt;b&gt;Số điện thoại&lt;/b&gt;</li>');
    expect(html).not.toContain('<b>');
  });

  it.each([
    ['/uu-dai', '/uu-dai'],
    ['/', '/'],
    ['//evil.example', '/'],
    ['https://evil.example/', '/'],
    ['/uu-dai?x=1', '/'],
    [null, '/'],
  ])('links back to %j as %j', (value, expected) => {
    expect(safeBackPath(value)).toBe(expected);
  });
});
