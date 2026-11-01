import type { DnsAnswers } from '../src/modules/domains/domain/domain-rules.js';
import { verificationName } from '../src/modules/domains/domain/domain-rules.js';
import { DnsUnavailableError, DomainDns } from '../src/modules/domains/domain-dns.js';
import { DomainTls, type TlsProbeResult } from '../src/modules/domains/domain-tls.js';

/** DNS a test writes: `set('go.smilecare.vn', { CNAME: [...] })`; unknown names answer nothing. */
export class FakeDomainDns extends DomainDns {
  private readonly zone = new Map<string, { CNAME?: string[]; A?: string[]; TXT?: string[] }>();
  private failing = false;
  /** Every domain asked about, in order. */
  readonly asked: string[] = [];

  set(name: string, records: { CNAME?: string[]; A?: string[]; TXT?: string[] }): void {
    this.zone.set(name, records);
  }

  clear(name: string): void {
    this.zone.delete(name);
  }

  /** The next questions fail as when a resolver times out, until `recover`. */
  fail(): void {
    this.failing = true;
  }

  recover(): void {
    this.failing = false;
  }

  answers(hostname: string): Promise<DnsAnswers> {
    this.asked.push(hostname);
    if (this.failing) {
      return Promise.reject(new DnsUnavailableError(hostname, { cause: new Error('timeout') }));
    }
    const own = this.zone.get(hostname);
    return Promise.resolve({
      cname: own?.CNAME ?? [],
      a: own?.A ?? [],
      txt: this.zone.get(verificationName(hostname))?.TXT ?? [],
    });
  }
}

/** HTTPS a test decides; valid by default once asked. */
export class FakeDomainTls extends DomainTls {
  result: TlsProbeResult = { ok: true, validUntil: new Date('2027-01-12T00:00:00.000Z') };

  probe(): Promise<TlsProbeResult> {
    return Promise.resolve(this.result);
  }
}

/** The records that make `hostname` point here and prove it is the domain's with `token`. */
export function pointHere(
  dns: FakeDomainDns,
  hostname: string,
  token: string,
  target = 'cname.payload.site',
): void {
  dns.set(hostname, { CNAME: [target] });
  dns.set(verificationName(hostname), { TXT: [`payload-verify=${token}`] });
}
