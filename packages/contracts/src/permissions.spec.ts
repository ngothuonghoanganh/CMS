import { describe, expect, it } from 'vitest';
import { roleCoversAllSites, roleSchema } from './auth.js';
import {
  can,
  holdersOf,
  onlyHoldersMessage,
  permissionGroups,
  permissionSchema,
  rolesWith,
} from './permissions.js';

/** Board 16 as a table: one letter per role, in the order of `roleSchema`. */
const BOARD: Record<string, string> = {
  'pages.view': 'yyyyyy',
  'pages.edit': 'yyyynn',
  'pages.publish': 'yyynnn',
  'pages.requestPublish': 'nnnynn',
  'publishApprovals.decide': 'yynnnn',
  'pages.manageLive': 'yyynnn',
  'leads.view': 'yynnyn',
  'leads.handle': 'yynnyn',
  'leads.export': 'yynnnn',
  'personalData.manage': 'yynnnn',
  'privacy.manage': 'yynnnn',
  'sites.manage': 'yynnnn',
  'domains.manage': 'yynnnn',
  'members.manage': 'yynnnn',
  'accessRequests.decide': 'ynnnnn',
  'workspace.transferOwnership': 'ynnnnn',
};

describe('the role matrix', () => {
  it.each(permissionSchema.options)('%s follows board 16', (permission) => {
    const row = roleSchema.options.map((role) => (can(role, permission) ? 'y' : 'n')).join('');
    expect(row).toBe(BOARD[permission]);
  });

  it('keeps leads and the export or deletion of personal data apart', () => {
    expect(can('support', 'leads.view')).toBe(true);
    expect(can('support', 'leads.export')).toBe(false);
    expect(can('support', 'personalData.manage')).toBe(false);
    expect(can('editor', 'leads.view')).toBe(false);
  });

  it('lets only roles that cannot publish ask to publish', () => {
    for (const role of rolesWith('pages.requestPublish')) {
      expect(can(role, 'pages.publish')).toBe(false);
    }
  });

  it('shows every permission exactly once on the board, asking as the cell of its row', () => {
    const rows = permissionGroups.flatMap((group) =>
      group.rows.flatMap((row) =>
        row.request === undefined ? [row.permission] : [row.permission, row.request],
      ),
    );
    expect([...rows].sort()).toEqual([...permissionSchema.options].sort());
  });

  it('gives only Chủ sở hữu and Quản trị the whole workspace', () => {
    expect(roleSchema.options.filter(roleCoversAllSites)).toEqual(['owner', 'admin']);
  });
});

describe('who may do it', () => {
  it('lists the roles most powerful first', () => {
    expect(rolesWith('leads.view')).toEqual(['owner', 'admin', 'support']);
  });

  it('names them for a refused action', () => {
    expect(holdersOf('leads.view')).toBe('Chủ sở hữu, Quản trị và Chăm sóc khách hàng');
    expect(onlyHoldersMessage('privacy.manage')).toBe(
      'Chỉ Chủ sở hữu và Quản trị được thực hiện thao tác này',
    );
  });
});
