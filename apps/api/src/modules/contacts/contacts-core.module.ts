import { Module } from '@nestjs/common';
import { WorkspaceCollectionsModule } from '../../shared/persistence/workspace-databases.js';
import { LeadsCoreModule } from '../leads/leads-core.module.js';
import { ContactLinker } from './contact-linker.service.js';
import { CONTACT_COLLECTION, MERGE_SUGGESTION_COLLECTION } from './contact.schema.js';
import { ContactRecordsRepository } from './contact-records.repository.js';
import { ContactsRepository } from './contacts.repository.js';
import { MergeSuggestionsRepository } from './merge-suggestions.repository.js';
import { CONTACT_EVENT_COLLECTION, MEETING_COLLECTION, TASK_COLLECTION } from './profile.schema.js';

/**
 * Customer profiles and their notes, tasks and meetings, without HTTP (ADR-033): the lead intake
 * and inbox join leads to them, the privacy settings recompute their expiry, a person's deletion
 * removes them.
 */
@Module({
  imports: [
    LeadsCoreModule,
    WorkspaceCollectionsModule.forFeature([
      CONTACT_COLLECTION,
      MERGE_SUGGESTION_COLLECTION,
      CONTACT_EVENT_COLLECTION,
      TASK_COLLECTION,
      MEETING_COLLECTION,
    ]),
  ],
  providers: [
    ContactsRepository,
    MergeSuggestionsRepository,
    ContactRecordsRepository,
    ContactLinker,
  ],
  exports: [
    ContactsRepository,
    MergeSuggestionsRepository,
    ContactRecordsRepository,
    ContactLinker,
  ],
})
export class ContactsCoreModule {}
