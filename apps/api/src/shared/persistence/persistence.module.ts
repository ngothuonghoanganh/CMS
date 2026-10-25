import { Global, Module } from '@nestjs/common';
import { TransactionRunner } from './transaction.js';

@Global()
@Module({ providers: [TransactionRunner], exports: [TransactionRunner] })
export class PersistenceModule {}
