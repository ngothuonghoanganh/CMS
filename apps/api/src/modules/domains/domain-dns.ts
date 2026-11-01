import { Resolver } from 'node:dns/promises';
import { readFile } from 'node:fs/promises';
import { z } from 'zod';
import type { DnsAnswers } from './domain/domain-rules.js';
import { verificationName } from './domain/domain-rules.js';

/** DNS could not answer (timeout, server failure): the last check stands and is tried again. */
export class DnsUnavailableError extends Error {
  constructor(hostname: string, options: { cause: unknown }) {
    super(`DNS could not be asked about ${hostname}`, options);
    this.name = 'DnsUnavailableError';
  }
}

/**
 * Asks DNS what a domain and its ownership record hold (ADR-022). An abstract class so it can be
 * the injection token: the network in production, a zone file in development and E2E, a fake in
 * integration tests.
 */
export abstract class DomainDns {
  abstract answers(hostname: string): Promise<DnsAnswers>;
}

/** "No such name" and "no record of that type" are empty answers, not failures. */
const EMPTY_CODES = new Set(['ENOTFOUND', 'ENODATA', 'ENONAME', 'NXDOMAIN']);

function emptyOnMissing<T>(hostname: string, query: Promise<T[]>): Promise<T[]> {
  return query.catch((error: unknown) => {
    const code = typeof error === 'object' && error !== null && 'code' in error ? error.code : null;
    if (typeof code === 'string' && EMPTY_CODES.has(code)) {
      return [];
    }
    throw new DnsUnavailableError(hostname, { cause: error });
  });
}

/** The public DNS, through the system's resolvers, 5 seconds a question at most. */
export class NetworkDomainDns extends DomainDns {
  private readonly resolver = new Resolver({ timeout: 5000, tries: 2 });

  async answers(hostname: string): Promise<DnsAnswers> {
    const [cname, a, txt] = await Promise.all([
      emptyOnMissing(hostname, this.resolver.resolveCname(hostname)),
      emptyOnMissing(hostname, this.resolver.resolve4(hostname)),
      emptyOnMissing(hostname, this.resolver.resolveTxt(verificationName(hostname))),
    ]);
    return { cname, a, txt: txt.map((chunks) => chunks.join('')) };
  }
}

const zoneSchema = z.record(
  z.string(),
  z.object({
    CNAME: z.array(z.string()).default([]),
    A: z.array(z.string()).default([]),
    TXT: z.array(z.string()).default([]),
  }),
);

/**
 * Answers from a JSON file, read at every question so a test can change it: `{ "<name>": {
 * "CNAME": [], "A": [], "TXT": [] } }`. Development and E2E only (ADR-022).
 */
export class ZoneFileDomainDns extends DomainDns {
  constructor(private readonly path: string) {
    super();
  }

  async answers(hostname: string): Promise<DnsAnswers> {
    let zone: z.infer<typeof zoneSchema>;
    try {
      zone = zoneSchema.parse(JSON.parse(await readFile(this.path, 'utf8')));
    } catch (error) {
      if (
        typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        error.code === 'ENOENT'
      ) {
        zone = {};
      } else {
        throw new DnsUnavailableError(hostname, { cause: error });
      }
    }
    const own = zone[hostname];
    return {
      cname: own?.CNAME ?? [],
      a: own?.A ?? [],
      txt: zone[verificationName(hostname)]?.TXT ?? [],
    };
  }
}
