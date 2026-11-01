import { Global, Module } from '@nestjs/common';
import { IndexBuilder } from './indexes.js';
import { TransactionRunner } from './transaction.js';
import { WorkspaceDatabases } from './workspace-databases.js';

@Global()
@Module({
  providers: [TransactionRunner, IndexBuilder, WorkspaceDatabases],
  exports: [TransactionRunner, WorkspaceDatabases],
})
export class PersistenceModule {}
