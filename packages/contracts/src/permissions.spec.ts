import { describe, expect, it } from 'vitest';
import { roleCoversAllSites, roleSchema } from './auth.js';
import { planFeatureOf } from './billing.js';
import {
  can,
  holdersOf,
  onlyHoldersMessage,
  type Permission,
  permissionGroups,
  permissionKinds,
  permissionSchema,
  refusedWhileReadOnly,
  rolesWith,
} from './permissions.js';

/** Board 16 as a table: one letter per role, in the order of `roleSchema`. */
const BOARD: Record<string, string> = {
  'pages.view': 'yyyyyy',
  'pages.edit': 'yyyynn',
  'templates.manage': 'yyynnn',
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
  'automations.view': 'yynnyn',
  'automations.manage': 'yynnnn',
  'members.manage': 'yynnnn',
  'accessRequests.decide': 'ynnnnn',
  'workspace.transferOwnership': 'ynnnnn',
  'billing.view': 'yynnnn',
  'billing.manage': 'ynnnnn',
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

describe('a read-only workspace (ADR-035)', () => {
  /** "Bị chặn" of ADR-035; inviting is `members.manage`, as are changing roles and custom roles. */
  const REFUSED: Permission[] = [
    'pages.edit',
    'templates.manage',
    'pages.publish',
    'pages.requestPublish',
    'publishApprovals.decide',
    'leads.handle',
    'sites.manage',
    'domains.manage',
    'privacy.manage',
    'automations.manage',
    'members.manage',
    'accessRequests.decide',
  ];

  it('refuses the writes ADR-035 blocks and keeps the others', () => {
    expect(permissionSchema.options.filter(refusedWhileReadOnly).sort()).toEqual(
      [...REFUSED].sort(),
    );
    // "Vẫn được": pointer moves, personal data duties, the ownership and every billing operation.
    for (const permission of [
      'pages.manageLive',
      'leads.export',
      'personalData.manage',
      'workspace.transferOwnership',
      'billing.manage',
    ] as const) {
      expect(refusedWhileReadOnly(permission), permission).toBe(false);
    }
  });

  it('flags every permission, every view as a read', () => {
    expect(Object.keys(permissionKinds).sort()).toEqual([...permissionSchema.options].sort());
    for (const permission of [
      'pages.view',
      'leads.view',
      'automations.view',
      'billing.view',
    ] as const) {
      expect(permissionKinds[permission]).toBe('read');
    }
  });
});

describe('board 16 for plans (ADR-035)', () => {
  it('keeps changing the plan and paying with Chủ sở hữu, and shows the plan to Quản trị', () => {
    expect(rolesWith('billing.manage')).toEqual(['owner']);
    expect(rolesWith('billing.view')).toEqual(['owner', 'admin']);
  });

  it('marks the automation rows "Theo gói"', () => {
    const marked = permissionSchema.options.filter((permission) => planFeatureOf(permission));
    expect(marked).toEqual(['automations.view', 'automations.manage']);
    expect(planFeatureOf('automations.manage')).toBe('automation');
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
