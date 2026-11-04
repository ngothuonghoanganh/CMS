import { Module } from '@nestjs/common';
import { WorkspaceCollectionsModule } from '../../shared/persistence/workspace-databases.js';
import { LeadsCoreModule } from '../leads/leads-core.module.js';
import { ContactLinker } from './contact-linker.service.js';
import { CONTACT_COLLECTION, MERGE_SUGGESTION_COLLECTION } from './contact.schema.js';
import { ContactsRepository } from './contacts.repository.js';
import { MergeSuggestionsRepository } from './merge-suggestions.repository.js';

/**
 * Customer profiles without HTTP (ADR-033): the lead intake and inbox join leads to them, the
 * privacy settings recompute their expiry, a person's deletion removes them.
 */
@Module({
  imports: [
    LeadsCoreModule,
    WorkspaceCollectionsModule.forFeature([CONTACT_COLLECTION, MERGE_SUGGESTION_COLLECTION]),
  ],
  providers: [ContactsRepository, MergeSuggestionsRepository, ContactLinker],
  exports: [ContactsRepository, MergeSuggestionsRepository, ContactLinker],
})
export class ContactsCoreModule {}
