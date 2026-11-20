import { describe, expect, it } from 'vitest';
import { toObjectId } from '../../../shared/persistence/object-id.js';
import {
  methodSetupReference,
  parseInvoiceReference,
  parseMethodSetupReference,
} from './billing-references.js';

const WORKSPACE = toObjectId('674000000000000000000001');
const USER = toObjectId('674000000000000000000002');

describe('gateway references', () => {
  it('name the workspace and the member of a card setup', () => {
    const reference = methodSetupReference(WORKSPACE, USER);
    expect(reference).toBe('ws_674000000000000000000001_by_674000000000000000000002');
    const parsed = parseMethodSetupReference(reference);
    expect(parsed?.workspaceId.equals(WORKSPACE)).toBe(true);
    expect(parsed?.userId.equals(USER)).toBe(true);
  });

  it('name the invoice of a charge', () => {
    expect(parseInvoiceReference('674000000000000000000abc')?.toHexString()).toBe(
      '674000000000000000000abc',
    );
  });

  it('name nothing otherwise', () => {
    for (const reference of [
      '',
      'ws_1_by_2',
      `${methodSetupReference(WORKSPACE, USER)}x`,
      'HD-2026-000001',
    ]) {
      expect(parseMethodSetupReference(reference)).toBeNull();
    }
    expect(parseInvoiceReference(methodSetupReference(WORKSPACE, USER))).toBeNull();
    expect(parseInvoiceReference('674000000000000000000ABC')).toBeNull();
  });
});
