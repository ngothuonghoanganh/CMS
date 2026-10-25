import { Readable } from 'node:stream';
import { Injectable } from '@nestjs/common';
import {
  LEAD_EXPORT_MAX_ROWS,
  LEAD_PERSON_EXPORT_MAX,
  type LeadFilters,
  type PersonExportFile,
  type PersonExportRequest,
  vnDayOf,
} from '@plp/contracts';
import { ActivityRepository } from '../activity/activity.repository.js';
import type { AuthenticatedUser } from '../auth/authenticated-user.js';
import { PagesRepository } from '../pages/pages.repository.js';
import { ReleasesRepository } from '../publishing/releases.repository.js';
import { SitesService } from '../sites/sites.service.js';
import { AccessService } from '../workspaces/access.service.js';
import {
  CSV_BOM,
  csvRecord,
  LEAD_CSV_HEADER,
  leadCsvFields,
  PERSON_CSV_HEADER,
  personCsvFields,
} from './domain/lead-csv.js';
import { leadCriteria } from './domain/lead-filters.js';
import { LeadAccessService, personOfLead } from './lead-access.service.js';
import { consentOf, pageTitleOf, toPersonExportLead } from './lead-dto.js';
import type { LeadRecord } from './lead.schema.js';
import { LeadsRepository } from './leads.repository.js';

/** A file an export answers with; the controller sends `body` as an attachment. */
export interface LeadFile {
  filename: string;
  contentType: string;
  body: Readable | string;
  /** More leads matched than the file holds. */
  truncated: boolean;
}

const CSV_TYPE = 'text/csv; charset=utf-8';
/** Rows are written in chunks of about this many characters rather than one write per row. */
const CSV_CHUNK = 64 * 1024;

async function* leadCsvChunks(
  leads: AsyncIterable<LeadRecord>,
  titles: ReadonlyMap<string, string>,
): AsyncGenerator<string> {
  let chunk = CSV_BOM + csvRecord(LEAD_CSV_HEADER);
  for await (const lead of leads) {
    chunk += csvRecord(leadCsvFields(lead, pageTitleOf(titles, lead.pageId)));
    if (chunk.length >= CSV_CHUNK) {
      yield chunk;
      chunk = '';
    }
  }
  yield chunk;
}

/**
 * Lead exports, owner only (ADR-017, ADR-018). Each export is recorded in the activity log with
 * how many leads it held, never what they contained.
 */
@Injectable()
export class LeadExportService {
  constructor(
    private readonly sites: SitesService,
    private readonly access: AccessService,
    private readonly leadAccess: LeadAccessService,
    private readonly leads: LeadsRepository,
    private readonly pages: PagesRepository,
    private readonly releases: ReleasesRepository,
    private readonly activity: ActivityRepository,
  ) {}

  /**
   * "Xuất Excel / CSV": the leads matching the inbox filters, newest first, at most
   * `LEAD_EXPORT_MAX_ROWS`, streamed from the database. Counting and reading both stop at the
   * moment the export started, so `truncated` describes exactly the file sent.
   */
  async exportLeads(
    user: AuthenticatedUser,
    siteId: string,
    filters: LeadFilters,
  ): Promise<LeadFile> {
    const { scope, site } = await this.sites.access(user, siteId);
    this.access.requireOwner(scope);
    const now = new Date();
    const criteria = leadCriteria(filters, now);
    const [matched, pages] = await Promise.all([
      this.leads.countMatching(scope, site._id, criteria, LEAD_EXPORT_MAX_ROWS + 1, now),
      this.pages.listTitlesForSite(scope, site._id),
    ]);
    const count = Math.min(matched, LEAD_EXPORT_MAX_ROWS);
    // Before the file streams: a download that breaks halfway still counts as an export.
    await this.activity.record(scope, {
      siteId: site._id,
      type: 'lead.exported',
      data: { count },
    });
    const titles = new Map(pages.map((page) => [page._id.toHexString(), page.title]));
    const rows = this.leads.streamMatching(scope, site._id, criteria, now, LEAD_EXPORT_MAX_ROWS);
    return {
      filename: `leads-${site.subdomain}-${vnDayOf(now)}.csv`,
      contentType: CSV_TYPE,
      body: Readable.from(leadCsvChunks(rows, titles)),
      truncated: matched > LEAD_EXPORT_MAX_ROWS,
    };
  }

  /**
   * "Xuất dữ liệu người này": every lead of the person in the site (at most
   * `LEAD_PERSON_EXPORT_MAX`), with the consent text each one agreed to, as JSON or CSV.
   */
  async exportPerson(
    user: AuthenticatedUser,
    leadId: string,
    request: PersonExportRequest,
  ): Promise<LeadFile> {
    const { scope, site, lead } = await this.leadAccess.access(user, leadId);
    this.access.requireOwner(scope);
    const now = new Date();
    const leads = await this.leads.listPerson(
      scope,
      site._id,
      personOfLead(lead),
      LEAD_PERSON_EXPORT_MAX + 1,
    );
    const included = leads.slice(0, LEAD_PERSON_EXPORT_MAX);
    const [titles, captures] = await Promise.all([
      this.pages.findTitles(
        scope,
        included.map((item) => item.pageId),
      ),
      this.releases.findLeadCaptures(
        scope,
        included.map((item) => item.releaseId),
      ),
    ]);
    await this.activity.record(scope, {
      siteId: site._id,
      type: 'lead.exported',
      data: { count: included.length },
    });
    const filename = `du-lieu-ca-nhan-${site.subdomain}-${vnDayOf(now)}`;
    const truncated = leads.length > LEAD_PERSON_EXPORT_MAX;
    if (request.format === 'csv') {
      const rows = included.map((item) => {
        const capture = consentOf(captures, item);
        return csvRecord(
          personCsvFields(item, pageTitleOf(titles, item.pageId), {
            version: capture.consentVersion,
            requiredText: capture.requiredText,
          }),
        );
      });
      return {
        filename: `${filename}.csv`,
        contentType: CSV_TYPE,
        body: CSV_BOM + csvRecord(PERSON_CSV_HEADER) + rows.join(''),
        truncated,
      };
    }
    const file: PersonExportFile = {
      exportedAt: now.toISOString(),
      site: site.name,
      leads: included.map((item) =>
        toPersonExportLead(item, pageTitleOf(titles, item.pageId), consentOf(captures, item)),
      ),
    };
    return {
      filename: `${filename}.json`,
      contentType: 'application/json; charset=utf-8',
      body: JSON.stringify(file, null, 2),
      truncated,
    };
  }
}
