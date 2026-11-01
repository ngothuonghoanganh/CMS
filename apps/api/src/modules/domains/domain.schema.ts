import type { RecordState } from '@plp/contracts';
import { Schema, type Types } from 'mongoose';

export const DOMAIN_MODEL = 'Domain';
export const DOMAINS_SITE_HOSTNAME_INDEX = 'domains_site_hostname_unique';
/** One owner per hostname: only one record of a hostname is ever verified (ADR-022). */
export const DOMAINS_OWNER_INDEX = 'domains_verified_hostname_unique';

export type HttpsState = 'ok' | 'pending' | 'failed' | 'unchecked';

/** What the last check of a domain saw. */
export interface DomainCheck {
  at: Date | null;
  /** The TXT record that proves ownership. */
  txt: RecordState;
  /** The CNAME or A records that point the domain here. */
  routing: RecordState;
  /** CNAME and A answers for the domain itself, for "Đang có" (board 14). */
  found: { type: 'CNAME' | 'A'; value: string }[];
  https: HttpsState;
  httpsValidUntil: Date | null;
  /** Since when DNS has been right but HTTPS not: past an hour the domain needs attention. */
  httpsFailingSince: Date | null;
}

export const EMPTY_CHECK: DomainCheck = {
  at: null,
  txt: 'missing',
  routing: 'missing',
  found: [],
  https: 'pending',
  httpsValidUntil: null,
  httpsFailingSince: null,
};

/** A custom domain of a site (ADR-022). */
export interface DomainRecord {
  _id: Types.ObjectId;
  workspaceId: Types.ObjectId;
  siteId: Types.ObjectId;
  hostname: string;
  /** The value of the ownership TXT record is `payload-verify=<token>`. */
  token: string;
  addedBy: Types.ObjectId;
  createdAt: Date;
  /** Ownership proven by the TXT record; the record is then the hostname's only owner. */
  verifiedAt: Date | null;
  check: DomainCheck;
  activeSince: Date | null;
  lostSince: Date | null;
  /** Automatic checks run quickly for a while after this, then slow down and stop. */
  watchSince: Date;
  /** When an instance checks the domain next; null once automatic checks stopped. */
  nextCheckAt: Date | null;
  /**
   * When it was last made the site's primary address. Written in that transaction, so a move or a
   * removal of the domain at the same moment conflicts with it instead of leaving the site's
   * primary address on a domain that is gone.
   */
  primarySetAt?: Date | null;
}

export const domainSchema = new Schema<DomainRecord>(
  {
    workspaceId: { type: Schema.Types.ObjectId, required: true },
    siteId: { type: Schema.Types.ObjectId, required: true },
    hostname: { type: String, required: true },
    token: { type: String, required: true },
    addedBy: { type: Schema.Types.ObjectId, required: true },
    createdAt: { type: Date, required: true },
    verifiedAt: { type: Date, default: null },
    check: {
      at: { type: Date, default: null },
      txt: { type: String, enum: ['missing', 'ok', 'wrong'], required: true },
      routing: { type: String, enum: ['missing', 'ok', 'wrong'], required: true },
      found: {
        type: [{ _id: false, type: { type: String }, value: { type: String } }],
        default: [],
      },
      https: { type: String, enum: ['ok', 'pending', 'failed', 'unchecked'], required: true },
      httpsValidUntil: { type: Date, default: null },
      httpsFailingSince: { type: Date, default: null },
    },
    activeSince: { type: Date, default: null },
    lostSince: { type: Date, default: null },
    watchSince: { type: Date, required: true },
    nextCheckAt: { type: Date, default: null },
    primarySetAt: { type: Date, default: null },
  },
  { collection: 'domains', versionKey: false },
);
domainSchema.index({ siteId: 1, hostname: 1 }, { unique: true, name: DOMAINS_SITE_HOSTNAME_INDEX });
domainSchema.index(
  { hostname: 1 },
  {
    unique: true,
    name: DOMAINS_OWNER_INDEX,
    partialFilterExpression: { verifiedAt: { $type: 'date' } },
  },
);
domainSchema.index({ nextCheckAt: 1 });
