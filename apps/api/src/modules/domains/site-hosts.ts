import { Injectable } from '@nestjs/common';
import { type Env, siteOrigin } from '../../config/env.js';
import { InjectEnv } from '../../shared/env.js';
import type { SiteRecord } from '../sites/site.schema.js';
import { domainStatus, servesPages } from './domain/domain-rules.js';
import { DomainsRepository } from './domains.repository.js';

/** Every host a site answers on: a referrer from one of them is the site itself (ADR-022). */
@Injectable()
export class SiteHosts {
  constructor(
    @InjectEnv() private readonly env: Env,
    private readonly domains: DomainsRepository,
  ) {}

  /** The primary custom domain while it is active: a broken one is never redirected to. */
  async activePrimaryHost(site: Pick<SiteRecord, 'primaryDomain'>): Promise<string | null> {
    if (!site.primaryDomain) {
      return null;
    }
    const domain = await this.domains.findById(site.primaryDomain.domainId);
    return domain !== null &&
      servesPages(domain) &&
      domainStatus(domain, false, new Date()) === 'active'
      ? domain.hostname
      : null;
  }

  async of(site: Pick<SiteRecord, '_id' | 'subdomain'>): Promise<string[]> {
    return [
      new URL(siteOrigin(this.env, site.subdomain)).host,
      ...(await this.domains.servingHostnames(site._id)),
    ];
  }
}
