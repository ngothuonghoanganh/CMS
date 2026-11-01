import { randomBytes } from 'node:crypto';
import {
  type DomainRecord as DomainRecordDto,
  type DomainStatus,
  domainKind,
  type RecordState,
  VERIFICATION_RECORD_LABEL,
  VERIFICATION_VALUE_PREFIX,
} from '@plp/contracts';
import type { DomainCheck, DomainRecord } from '../domain.schema.js';

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

/** HTTPS may fail this long after DNS is right before the domain needs attention. */
export const HTTPS_GRACE_MS = HOUR_MS;

/** Where the edge expects domains: the CNAME target and the IPv4 addresses for A records. */
export interface DomainTargets {
  cnameTarget: string;
  ipv4: readonly string[];
}

/** What DNS answered for a domain and its ownership record. */
export interface DnsAnswers {
  cname: readonly string[];
  a: readonly string[];
  /** TXT records of `_payload.<hostname>`, each as its strings joined. */
  txt: readonly string[];
}

export function newDomainToken(): string {
  return randomBytes(16).toString('hex');
}

export function verificationName(hostname: string): string {
  return `${VERIFICATION_RECORD_LABEL}.${hostname}`;
}

function bare(name: string): string {
  return name.trim().toLowerCase().replace(/\.$/, '');
}

/** The records to add at the provider, with what the last check saw of each (board 14). */
export function expectedRecords(
  domain: Pick<DomainRecord, 'hostname' | 'token' | 'check'>,
  targets: DomainTargets,
): DomainRecordDto[] {
  const routing: DomainRecordDto[] =
    domainKind(domain.hostname) === 'apex'
      ? (targets.ipv4.length === 0 ? ['[IP CỦA HỆ THỐNG CHƯA CẤU HÌNH]'] : targets.ipv4).map(
          (ip) => ({ type: 'A', name: domain.hostname, value: ip, state: domain.check.routing }),
        )
      : [
          {
            type: 'CNAME',
            name: domain.hostname,
            value: targets.cnameTarget,
            state: domain.check.routing,
          },
        ];
  return [
    ...routing,
    {
      type: 'TXT',
      name: verificationName(domain.hostname),
      value: `${VERIFICATION_VALUE_PREFIX}${domain.token}`,
      state: domain.check.txt,
    },
  ];
}

/**
 * Judges the answers: the domain points here by a CNAME to the target, or by A records all of
 * which are the edge's; ownership is proven by the TXT value with the record's own token.
 */
export function evaluateDns(
  token: string,
  answers: DnsAnswers,
  targets: DomainTargets,
): Pick<DomainCheck, 'txt' | 'routing' | 'found'> {
  const cname = answers.cname.map(bare);
  const a = answers.a.map((ip) => ip.trim());
  const routing: RecordState =
    cname.length === 0 && a.length === 0
      ? 'missing'
      : cname.includes(bare(targets.cnameTarget)) ||
          (cname.length === 0 && a.every((ip) => targets.ipv4.includes(ip)))
        ? 'ok'
        : 'wrong';
  const values = answers.txt.map((value) => value.trim());
  const txt: RecordState =
    values.length === 0
      ? 'missing'
      : values.includes(`${VERIFICATION_VALUE_PREFIX}${token}`)
        ? 'ok'
        : values.some((value) => value.startsWith(VERIFICATION_VALUE_PREFIX))
          ? 'wrong'
          : 'missing';
  return {
    txt,
    routing,
    found: [
      ...cname.map((value) => ({ type: 'CNAME' as const, value })),
      ...a.map((value) => ({ type: 'A' as const, value })),
    ],
  };
}

/** Where a domain stands, as the legend of board 13 names it (ADR-022). */
export function domainStatus(
  domain: Pick<DomainRecord, 'verifiedAt' | 'check' | 'activeSince'>,
  ownedElsewhere: boolean,
  now: Date,
): DomainStatus {
  const { check } = domain;
  if (domain.verifiedAt === null) {
    if (ownedElsewhere) {
      return 'taken';
    }
    return check.txt === 'wrong' || check.routing === 'wrong' ? 'misconfigured' : 'pending_dns';
  }
  if (check.routing !== 'ok') {
    if (domain.activeSince !== null) {
      return 'lost';
    }
    return check.routing === 'wrong' ? 'misconfigured' : 'pending_dns';
  }
  if (check.https === 'ok' || check.https === 'unchecked') {
    return 'active';
  }
  if (
    check.httpsFailingSince !== null &&
    now.getTime() - check.httpsFailingSince.getTime() > HTTPS_GRACE_MS
  ) {
    return 'needs_attention';
  }
  return 'issuing';
}

/**
 * When to check again: a verified domain every 10 minutes; one waiting for DNS every minute for an
 * hour after it was added or "Kiểm tra ngay", then every 10 minutes, and not by itself after 7 days.
 */
export function nextCheckAt(
  domain: Pick<DomainRecord, 'verifiedAt' | 'watchSince'>,
  now: Date,
): Date | null {
  if (domain.verifiedAt !== null) {
    return new Date(now.getTime() + 10 * MINUTE_MS);
  }
  const watched = now.getTime() - domain.watchSince.getTime();
  if (watched < HOUR_MS) {
    return new Date(now.getTime() + MINUTE_MS);
  }
  return watched < 7 * DAY_MS ? new Date(now.getTime() + 10 * MINUTE_MS) : null;
}

/** The domain serves pages: verified and pointing here (HTTPS is the edge's business). */
export function servesPages(domain: Pick<DomainRecord, 'verifiedAt' | 'check'>): boolean {
  return domain.verifiedAt !== null && domain.check.routing === 'ok';
}
