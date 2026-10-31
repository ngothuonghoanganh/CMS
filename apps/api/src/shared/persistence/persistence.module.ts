import { Global, Module } from '@nestjs/common';
import { IndexBuilder } from './indexes.js';
import { TransactionRunner } from './transaction.js';

@Global()
@Module({ providers: [TransactionRunner, IndexBuilder], exports: [TransactionRunner] })
export class PersistenceModule {}
