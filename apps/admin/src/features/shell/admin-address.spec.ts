import { describe, expect, it } from 'vitest';
import { addressOf, addressRedirect, type WorkspaceAddresses } from './admin-address';

const addresses: WorkspaceAddresses = {
  template: 'https://{slug}.app.example.vn',
  commonOrigin: 'https://app.example.vn',
};

describe('admin addresses (ADR-025)', () => {
  it('is one address without a template', () => {
    expect(addressOf(null, 'may-xanh.app.example.vn')).toEqual({ kind: 'single' });
  });

  it('tells a workspace address from the common one', () => {
    expect(addressOf(addresses, 'may-xanh.app.example.vn')).toEqual({
      kind: 'workspace',
      slug: 'may-xanh',
      addresses,
    });
    expect(addressOf(addresses, 'app.example.vn')).toEqual({ kind: 'common', addresses });
    // Any other host is treated as the common address, never as a workspace.
    expect(addressOf(addresses, 'evil.test').kind).toBe('common');
  });

  it('never reads the common address as a workspace, whatever the template', () => {
    const sameLevel = {
      template: 'https://{slug}.example.vn',
      commonOrigin: 'https://portal.example.vn',
    };
    expect(addressOf(sameLevel, 'portal.example.vn').kind).toBe('common');
    expect(addressOf(sameLevel, 'PORTAL.example.vn').kind).toBe('common');
    expect(addressOf(sameLevel, 'smile.example.vn').kind).toBe('workspace');
    // Reserved names are never workspaces either (ADR-025).
    expect(addressOf(sameLevel, 'app.example.vn').kind).toBe('common');
    expect(addressOf(sameLevel, 'api.example.vn').kind).toBe('common');
  });

  it('opens a workspace screen at its own address, with the same path', () => {
    const common = addressOf(addresses, 'app.example.vn');
    const other = addressOf(addresses, 'smile.app.example.vn');
    const here = addressOf(addresses, 'may-xanh.app.example.vn');

    expect(addressRedirect(common, 'may-xanh', '/sites/1/leads?lead=2')).toBe(
      'https://may-xanh.app.example.vn/sites/1/leads?lead=2',
    );
    expect(addressRedirect(other, 'may-xanh', '/workspaces/1/members')).toBe(
      'https://may-xanh.app.example.vn/workspaces/1/members',
    );
    expect(addressRedirect(here, 'may-xanh', '/sites/1')).toBeNull();
    expect(addressRedirect({ kind: 'single' }, 'may-xanh', '/sites/1')).toBeNull();
  });

  it('never turns the path into another host', () => {
    const common = addressOf(addresses, 'app.example.vn');
    for (const path of ['//evil.test/x', '/\\evil.test', 'https://evil.test', '']) {
      expect(addressRedirect(common, 'may-xanh', path)).toBe('https://may-xanh.app.example.vn/');
    }
  });
});
