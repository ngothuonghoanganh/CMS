import { type Connection, Types } from 'mongoose';
import { describe, expect, it } from 'vitest';
import { MAX_MASTER_DB_NAME_LENGTH, WorkspaceDatabases } from './workspace-databases.js';

function master(name: string): Connection {
  return { name } as Connection;
}

/** MongoDB refuses a database name of 64 bytes or more. */
const MONGODB_NAME_LIMIT = 64;

describe('WorkspaceDatabases', () => {
  it('names a workspace database after the master and the workspace', () => {
    const id = new Types.ObjectId('64b000000000000000000001');
    expect(new WorkspaceDatabases(master('plp')).nameOf(id)).toBe(
      'plp_ws_64b000000000000000000001',
    );
  });

  it('accepts the longest master name whose workspace databases MongoDB still takes', () => {
    const databases = new WorkspaceDatabases(master('p'.repeat(MAX_MASTER_DB_NAME_LENGTH)));
    expect(databases.nameOf(new Types.ObjectId()).length).toBeLessThan(MONGODB_NAME_LIMIT);
  });

  it('refuses a master name that would make workspace database names too long', () => {
    expect(() => new WorkspaceDatabases(master('p'.repeat(MAX_MASTER_DB_NAME_LENGTH + 1)))).toThrow(
      `longer than ${MAX_MASTER_DB_NAME_LENGTH} characters`,
    );
  });

  it('counts the master name in bytes, as MongoDB does', () => {
    expect(() => new WorkspaceDatabases(master('đ'.repeat(18)))).toThrow(
      `longer than ${MAX_MASTER_DB_NAME_LENGTH} characters`,
    );
  });
});
