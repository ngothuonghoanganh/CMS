import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { DATA_REQUEST_MODEL, dataRequestSchema } from './data-request.schema.js';
import { DataRequestsRepository } from './data-requests.repository.js';

/**
 * Data request persistence, without HTTP. Deleting a person's data from the inbox masks their
 * requests too (ADR-017), so the leads module needs the repository without the module that
 * depends on it.
 */
@Module({
  imports: [MongooseModule.forFeature([{ name: DATA_REQUEST_MODEL, schema: dataRequestSchema }])],
  providers: [DataRequestsRepository],
  exports: [DataRequestsRepository],
})
export class DataRequestsCoreModule {}
