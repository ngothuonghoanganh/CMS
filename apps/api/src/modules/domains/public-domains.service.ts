import { Injectable } from '@nestjs/common';
import type { HostSiteResponse, SiteAddressResponse } from '@plp/contracts';
import { baseDomainOf, type Env } from '../../config/env.js';
import { InjectEnv } from '../../shared/env.js';
import { notFound } from '../../shared/errors.js';
import { SitesRepository } from '../sites/sites.repository.js';
import { DomainsRepository } from './domains.repository.js';
import { SiteHosts } from './site-hosts.js';

const HOST_NOT_SERVED = 'Không có site ở tên miền này';

function bareHost(value: string): string {
  return value.trim().toLowerCase().replace(/\.$/, '');
}

/**
 * What the edge and the renderer ask about hosts (ADR-022): whether to get a certificate, which
 * site a custom domain serves, and the primary address the others redirect to.
 */
@Injectable()
export class PublicDomainsService {
  private readonly baseDomain: string;

  constructor(
    @InjectEnv() env: Env,
    private readonly domains: DomainsRepository,
    private readonly sites: SitesRepository,
    private readonly siteHosts: SiteHosts,
  ) {
    this.baseDomain = baseDomainOf(env);
  }

  /**
   * Caddy's on-demand TLS asks before getting a certificate: yes for a site's default address and
   * for a custom domain that is verified and points here, no for anything else.
   */
  async tlsAllowed(domain: string): Promise<void> {
    const host = bareHost(domain);
    const suffix = `.${this.baseDomain}`;
    if (host.endsWith(suffix)) {
      const label = host.slice(0, -suffix.length);
      if (!label.includes('.') && (await this.sites.subdomainExists(label))) {
        return;
      }
      throw notFound(HOST_NOT_SERVED);
    }
    if ((await this.domains.findServing(host)) === null) {
      throw notFound(HOST_NOT_SERVED);
    }
  }

  async hostSite(host: string): Promise<HostSiteResponse> {
    const domain = await this.domains.findServing(bareHost(host));
    const site = domain === null ? null : await this.sites.findSubdomain(domain.siteId);
    if (site === null) {
      throw notFound(HOST_NOT_SERVED);
    }
    return { subdomain: site.subdomain };
  }

  /** The primary host, only while it is active: a broken one is never redirected to. */
  async siteAddress(subdomain: string): Promise<SiteAddressResponse> {
    const site = await this.sites.findBySubdomain(subdomain);
    if (site === null) {
      throw notFound('Không tìm thấy site');
    }
    return { primaryHost: await this.siteHosts.activePrimaryHost(site) };
  }
}
