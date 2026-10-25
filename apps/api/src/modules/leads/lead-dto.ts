import {
  type CappedCount,
  LEAD_COUNT_CAP,
  type LeadDetail,
  type LeadListItem,
  leadSourceLabel,
  leadDeviceLabels,
  leadStatusLabels,
  type PersonExportFile,
} from '@plp/contracts';
import type { ObjectId } from '../../shared/persistence/object-id.js';
import type { LeadCapture } from '../publishing/domain/lead-capture.js';
import type { LeadRecord } from './lead.schema.js';
import type { LeadListRow } from './leads.repository.js';

export const LEAD_NOT_FOUND = 'Không tìm thấy lead';

/** Counts ask for one more than the cap, so a full count tells that more leads match. */
export const CAPPED_COUNT_LIMIT = LEAD_COUNT_CAP + 1;

export function toCappedCount(counted: number): CappedCount {
  return counted > LEAD_COUNT_CAP
    ? { count: LEAD_COUNT_CAP, capped: true }
    : { count: counted, capped: false };
}

/**
 * The title of a lead's page. Pages cannot be deleted, so a missing one means the data was edited
 * by hand.
 */
export function pageTitleOf(titles: ReadonlyMap<string, string>, pageId: ObjectId): string {
  const title = titles.get(pageId.toHexString());
  if (title === undefined) {
    throw new Error(`Lead refers to missing page ${pageId.toHexString()}`);
  }
  return title;
}

/**
 * The consent snapshot of a lead's release (ADR-017). Intake only accepts forms whose release has
 * one, and releases are immutable, so a missing one means the data was edited by hand.
 */
export function consentOf(
  captures: ReadonlyMap<string, { leadCapture?: LeadCapture | null }>,
  lead: Pick<LeadRecord, '_id' | 'releaseId'>,
): LeadCapture {
  const capture = captures.get(lead.releaseId.toHexString())?.leadCapture ?? null;
  if (capture === null) {
    throw new Error(
      `Lead ${lead._id.toHexString()} has no consent snapshot in release ${lead.releaseId.toHexString()}`,
    );
  }
  return capture;
}

export function toLeadListItem(row: LeadListRow, pageTitle: string): LeadListItem {
  return {
    id: row._id.toHexString(),
    name: row.fields.name,
    phone: row.fields.phone,
    page: { id: row.pageId.toHexString(), title: pageTitle },
    source: { ...row.source },
    status: row.status,
    createdAt: row.createdAt.toISOString(),
  };
}

export interface LeadDetailInput {
  pageTitle: string;
  capture: LeadCapture;
  personLeads: CappedCount;
}

function consentEvidence(
  lead: LeadRecord,
  capture: LeadCapture,
): LeadDetail['consent'] & PersonExportFile['leads'][number]['consent'] {
  return {
    at: lead.consent.at.toISOString(),
    version: capture.consentVersion,
    controllerName: capture.controllerName,
    policyUrl: capture.policyUrl,
    requiredText: capture.requiredText,
    marketingText: capture.marketingText,
    marketing: lead.consent.marketing,
    marketingWithdrawnAt: lead.consent.marketingWithdrawnAt?.toISOString() ?? null,
  };
}

export function toLeadDetail(lead: LeadRecord, input: LeadDetailInput): LeadDetail {
  return {
    id: lead._id.toHexString(),
    name: lead.fields.name,
    phone: lead.fields.phone,
    email: lead.fields.email,
    message: lead.fields.message,
    page: { id: lead.pageId.toHexString(), title: input.pageTitle },
    releaseVersion: lead.releaseVersion,
    source: { ...lead.source },
    device: lead.device,
    status: lead.status,
    note: lead.note,
    spam: { suspected: lead.spam.suspected, reasons: [...lead.spam.reasons] },
    consent: consentEvidence(lead, input.capture),
    createdAt: lead.createdAt.toISOString(),
    expiresAt: lead.expiresAt?.toISOString() ?? null,
    personLeads: input.personLeads,
  };
}

/** One lead of a person's JSON export, in words a person reads (ADR-017). */
export function toPersonExportLead(
  lead: LeadRecord,
  pageTitle: string,
  capture: LeadCapture,
): PersonExportFile['leads'][number] {
  return {
    createdAt: lead.createdAt.toISOString(),
    name: lead.fields.name,
    phone: lead.fields.phone,
    email: lead.fields.email,
    message: lead.fields.message,
    page: pageTitle,
    pageVersion: lead.releaseVersion,
    source: leadSourceLabel(lead.source),
    campaign: lead.source.campaign,
    device: leadDeviceLabels[lead.device],
    status: leadStatusLabels[lead.status],
    note: lead.note,
    consent: consentEvidence(lead, capture),
  };
}
