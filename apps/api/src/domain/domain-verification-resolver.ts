import { resolveTxt } from 'node:dns/promises';

export const DOMAIN_VERIFICATION_RESOLVER = Symbol('DOMAIN_VERIFICATION_RESOLVER');

export interface DomainVerificationResolver {
  resolveTxt(hostname: string): Promise<string[]>;
  registerTxt?(hostname: string, value: string): void;
}

export class NodeDomainVerificationResolver implements DomainVerificationResolver {
  async resolveTxt(hostname: string): Promise<string[]> {
    const records = await resolveTxt(hostname);
    return records.map((record) => record.join(''));
  }
}

export class InMemoryDomainVerificationResolver implements DomainVerificationResolver {
  private readonly records = new Map<string, string[]>();

  resolveTxt(hostname: string): Promise<string[]> {
    return Promise.resolve(this.records.get(hostname) ?? []);
  }

  registerTxt(hostname: string, value: string): void {
    this.records.set(hostname, [value]);
  }
}
