import { Injectable } from '@nestjs/common';
import type { RetentionMonths } from '@plp/contracts';
import type { ObjectId } from '../../shared/persistence/object-id.js';
import { type Tx, TransactionRunner } from '../../shared/persistence/transaction.js';
import type { WorkspaceRef } from '../../shared/persistence/workspace-databases.js';
import type { LeadRecord } from '../leads/lead.schema.js';
import { LeadsRepository } from '../leads/leads.repository.js';
import type { ContactRecord } from './contact.schema.js';
import { ContactRecordsRepository } from './contact-records.repository.js';
import { ContactsRepository, type LeadForContact } from './contacts.repository.js';
import { daysApart, namePageWindow, pairExpiry } from './domain/contact-rules.js';
import { MergeSuggestionsRepository } from './merge-suggestions.repository.js';
import { LeadAlreadyLinkedError, OpportunityFlow } from './opportunity-flow.service.js';

/** At most this many other profiles are checked for "Có thể trùng" per lead. */
const DUPLICATE_CANDIDATES_MAX = 20;

export { LeadAlreadyLinkedError };

function forContact(lead: LeadRecord): LeadForContact {
  return {
    name: lead.fields.name,
    phone: lead.fields.phone,
    email: lead.fields.email,
    marketing: lead.consent.marketing && lead.consent.marketingWithdrawnAt === null,
    pageId: lead.pageId,
    source: lead.source.source,
    medium: lead.source.medium,
    at: lead.createdAt,
  };
}

/**
 * Gathers a site's leads into customer profiles (ADR-033): by phone number, in the transaction of
 * the lead or of its own, then looks for profiles that may be the same person.
 */
@Injectable()
export class ContactLinker {
  constructor(
    private readonly contacts: ContactsRepository,
    private readonly suggestions: MergeSuggestionsRepository,
    private readonly leads: LeadsRepository,
    private readonly records: ContactRecordsRepository,
    private readonly flow: OpportunityFlow,
    private readonly transactions: TransactionRunner,
  ) {}

  /**
   * Joins the lead to its profile and its profile's open opportunity in the caller's transaction
   * (ADR-033). Never for suspected spam. `backfill` is a lead stored before K3, whose status moves
   * the opportunity.
   */
  async linkIn(
    ref: WorkspaceRef,
    lead: LeadRecord,
    months: RetentionMonths,
    tx: Tx,
    backfill = false,
  ): Promise<ContactRecord> {
    const contact = await this.contacts.upsertFromLead(
      ref,
      lead.siteId,
      forContact(lead),
      months,
      tx,
    );
    if (!(await this.leads.linkContact(ref, lead._id, contact._id, tx))) {
      throw new LeadAlreadyLinkedError();
    }
    // The lead is an interaction: the profile's notes and tasks keep living with it.
    await this.records.alignExpiry(ref, lead.siteId, contact._id, contact.expiresAt, tx);
    await this.flow.joinLead(ref, lead, contact, tx, backfill);
    return contact;
  }

  /**
   * Joins a stored lead to its profile in a transaction of its own: a lead moved out of spam, or
   * one the backfill reaches. Null when it had joined one already.
   */
  async link(
    ref: WorkspaceRef,
    lead: LeadRecord,
    months: RetentionMonths,
    backfill = false,
  ): Promise<ContactRecord | null> {
    try {
      return await this.transactions.run((tx) => this.linkIn(ref, lead, months, tx, backfill));
    } catch (error) {
      if (error instanceof LeadAlreadyLinkedError) {
        return null;
      }
      throw error;
    }
  }

  /**
   * The backfill of a lead that joined its profile before K3: it joins the profile's open
   * opportunity now. False when it had joined one already, or its profile is gone.
   */
  async joinOpportunity(
    ref: WorkspaceRef,
    lead: LeadRecord,
    contactId: ObjectId,
  ): Promise<boolean> {
    try {
      return await this.transactions.run(async (tx) => {
        const contact = await this.contacts.findById(ref, lead.siteId, contactId, tx);
        if (contact === null) {
          return false;
        }
        await this.flow.joinLead(ref, lead, contact, tx, true);
        return true;
      });
    } catch (error) {
      if (error instanceof LeadAlreadyLinkedError) {
        return false;
      }
      throw error;
    }
  }

  /**
   * Pairs the profile with others of the site (ADR-033): the same email with another phone
   * number, or the same name with a lead on the same page within 7 days. A pair suggested before,
   * dismissed or not, is left as it is.
   */
  async suggestFor(
    ref: WorkspaceRef,
    contact: ContactRecord,
    lead: Pick<LeadRecord, 'pageId' | 'createdAt'> | null,
    at: Date,
  ): Promise<void> {
    const siteId = contact.siteId;
    if (contact.search.email !== null) {
      const sameEmail = await this.contacts.findByEmail(
        ref,
        siteId,
        contact.search.email,
        contact._id,
        DUPLICATE_CANDIDATES_MAX,
      );
      for (const other of sameEmail) {
        if (other.phone !== contact.phone) {
          await this.pair(ref, siteId, contact, other, { kind: 'email' }, at);
        }
      }
    }
    if (lead === null) {
      return;
    }
    const sameName = await this.contacts.findByName(
      ref,
      siteId,
      contact.search.name,
      contact._id,
      DUPLICATE_CANDIDATES_MAX,
    );
    if (sameName.length === 0) {
      return;
    }
    const hits = await this.leads.findOnPage(
      ref,
      siteId,
      lead.pageId,
      sameName.map((other) => other._id),
      namePageWindow(lead.createdAt),
      DUPLICATE_CANDIDATES_MAX,
    );
    const seen = new Set<string>();
    for (const hit of hits) {
      const otherId = hit.contactId;
      if (!otherId || seen.has(otherId.toHexString())) {
        continue;
      }
      seen.add(otherId.toHexString());
      const other = sameName.find((candidate) => candidate._id.equals(otherId));
      if (other) {
        await this.pair(
          ref,
          siteId,
          contact,
          other,
          {
            kind: 'name_page',
            pageId: lead.pageId,
            days: daysApart(lead.createdAt, hit.createdAt),
          },
          at,
        );
      }
    }
  }

  private pair(
    ref: WorkspaceRef,
    siteId: ObjectId,
    contact: Pick<ContactRecord, '_id' | 'expiresAt'>,
    other: Pick<ContactRecord, '_id' | 'expiresAt'>,
    reason: Parameters<MergeSuggestionsRepository['suggest']>[4],
    at: Date,
  ): Promise<void> {
    return this.suggestions.suggest(
      ref,
      siteId,
      contact._id,
      other._id,
      reason,
      at,
      pairExpiry(contact.expiresAt, other.expiresAt),
    );
  }
}
