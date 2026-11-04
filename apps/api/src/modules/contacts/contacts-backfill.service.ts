import { Injectable, Logger, type OnApplicationBootstrap } from '@nestjs/common';
import type { RetentionMonths } from '@plp/contracts';
import type { ObjectId } from '../../shared/persistence/object-id.js';
import type { WorkspaceRef } from '../../shared/persistence/workspace-databases.js';
import { LeadsRepository } from '../leads/leads.repository.js';
import { retentionOf } from '../sites/site.schema.js';
import { SitesRepository } from '../sites/sites.repository.js';
import { WorkspacesRepository } from '../workspaces/workspaces.repository.js';
import { ContactLinker } from './contact-linker.service.js';

const BATCH = 200;

/**
 * Gathers the leads stored before customer profiles existed (ADR-033), after startup, one
 * workspace and one batch at a time. Safe to run again and on several instances at once: a lead
 * joins a profile once (`LeadsRepository.linkContact`), by phone number.
 */
@Injectable()
export class ContactsBackfill implements OnApplicationBootstrap {
  private readonly logger = new Logger(ContactsBackfill.name);

  constructor(
    private readonly workspaces: WorkspacesRepository,
    private readonly leads: LeadsRepository,
    private readonly sites: SitesRepository,
    private readonly linker: ContactLinker,
  ) {}

  onApplicationBootstrap(): void {
    // In the background: the API serves meanwhile, and new leads join their profile on arrival.
    void this.runAll().catch((error: unknown) => {
      this.logger.error({ err: error }, 'Gathering earlier leads into contacts failed');
    });
  }

  async runAll(): Promise<void> {
    const until = new Date();
    for await (const workspaceId of this.workspaces.allIds()) {
      await this.runWorkspace({ workspaceId }, until);
    }
  }

  /** Every lead of the workspace stored up to `until` without a profile; returns how many joined. */
  async runWorkspace(ref: WorkspaceRef, until: Date): Promise<number> {
    const retention = new Map<string, RetentionMonths | 'gone'>();
    let after: { createdAt: Date; id: ObjectId } | null = null;
    let linked = 0;
    for (;;) {
      const batch = await this.leads.listUnlinked(ref, after, until, BATCH);
      for (const lead of batch) {
        if (lead.spam.suspected) {
          continue;
        }
        const key = lead.siteId.toHexString();
        let months = retention.get(key);
        if (months === undefined) {
          const site = await this.sites.findPublicPrivacy(ref, lead.siteId);
          months = site === null ? 'gone' : retentionOf(site.privacy);
          retention.set(key, months);
        }
        if (months === 'gone') {
          // The site's deletion removes its leads.
          continue;
        }
        const contact = await this.linker.link(ref, lead, months);
        if (contact !== null) {
          linked += 1;
          await this.linker.suggestFor(ref, contact, lead, new Date());
        }
      }
      const last = batch.at(-1);
      if (batch.length < BATCH || !last) {
        return linked;
      }
      after = { createdAt: last.createdAt, id: last._id };
    }
  }
}
