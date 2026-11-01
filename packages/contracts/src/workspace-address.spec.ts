import { describe, expect, it } from 'vitest';
import {
  slugOfHost,
  slugOfOrigin,
  workspaceOrigin,
  workspaceSlugSchema,
} from './workspace-address.js';

const TEMPLATE = 'https://{slug}.app.example.vn';
const LOCAL = 'http://{slug}.app.e2e.test:3100';

describe('workspace addresses (ADR-025)', () => {
  it('accepts slugs of 3 to 40 letters, digits and inner dashes only', () => {
    for (const slug of ['abc', 'may-xanh-agency', 'a1b', 'x'.repeat(40)]) {
      expect(workspaceSlugSchema.safeParse(slug).success).toBe(true);
    }
    for (const slug of ['ab', 'x'.repeat(41), '-abc', 'abc-', 'Abc', 'a.b', 'mây', 'a_b']) {
      expect(workspaceSlugSchema.safeParse(slug).success).toBe(false);
    }
  });

  it('builds the origin of a workspace from the template', () => {
    expect(workspaceOrigin(TEMPLATE, 'may-xanh')).toBe('https://may-xanh.app.example.vn');
    expect(workspaceOrigin(LOCAL, 'smile')).toBe('http://smile.app.e2e.test:3100');
    expect(() => workspaceOrigin(TEMPLATE, 'evil.example.com/x')).toThrow();
  });

  it('reads the slug back from a host, and nothing from any other host', () => {
    expect(slugOfHost(TEMPLATE, 'may-xanh.app.example.vn')).toBe('may-xanh');
    expect(slugOfHost(TEMPLATE, 'MAY-XANH.app.example.vn')).toBe('may-xanh');
    expect(slugOfHost(LOCAL, 'smile.app.e2e.test:3100')).toBe('smile');
    expect(slugOfHost(LOCAL, 'smile.app.e2e.test:3101')).toBeNull();
    expect(slugOfHost(TEMPLATE, 'app.example.vn')).toBeNull();
    expect(slugOfHost(TEMPLATE, 'a.b.app.example.vn')).toBeNull();
    expect(slugOfHost(TEMPLATE, 'may-xanh.app.example.vn.evil.com')).toBeNull();
    expect(slugOfHost(TEMPLATE, 'may-xanh.app.example.vnx')).toBeNull();
  });

  it('reads the slug from an origin only with the template’s protocol', () => {
    expect(slugOfOrigin(TEMPLATE, 'https://may-xanh.app.example.vn')).toBe('may-xanh');
    expect(slugOfOrigin(TEMPLATE, 'http://may-xanh.app.example.vn')).toBeNull();
    expect(slugOfOrigin(TEMPLATE, 'https://may-xanh.app.example.vn/path')).toBeNull();
    expect(slugOfOrigin(TEMPLATE, 'null')).toBeNull();
    expect(slugOfOrigin(LOCAL, 'http://smile.app.e2e.test:3100')).toBe('smile');
  });

  it('refuses a template whose slug is not in the host', () => {
    expect(() => slugOfHost('https://app.example.vn/{slug}', 'app.example.vn')).toThrow(
      'outside the host',
    );
  });
});
