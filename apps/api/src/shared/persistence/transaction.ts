import { Injectable } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import type { ClientSession, Connection } from 'mongoose';

/** A MongoDB transaction handle; repositories accept it to join the transaction. */
export type Tx = ClientSession;

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
