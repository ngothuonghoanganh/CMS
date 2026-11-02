import { Injectable } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { type ClientSession, type Connection, mongo } from 'mongoose';

/** A MongoDB transaction handle; repositories accept it to join the transaction. */
export type Tx = ClientSession;

/**
 * Whether a transaction that failed may still have committed: the driver gave up learning the
 * result of its commit (`UnknownTransactionCommitResult`). Every other failure comes before the
 * commit, and nothing of the transaction was stored. Work done outside the database for it, such
 * as copied images, is then kept: a committed record may name it, and a leftover is only a file
 * nothing names (ADR-030).
 */
export function commitMayHaveApplied(error: unknown): boolean {
  return error instanceof mongo.MongoError && error.hasErrorLabel('UnknownTransactionCommitResult');
}

/**
 * Runs a unit of work in a MongoDB transaction (requires a replica set, ADR-006). The callback may
 * run more than once on transient errors, so it must not have side effects outside the database.
 */
@Injectable()
export class TransactionRunner {
  constructor(@InjectConnection() private readonly connection: Connection) {}

  run<T>(work: (tx: Tx) => Promise<T>): Promise<T> {
    return this.connection.transaction(work);
  }
}
