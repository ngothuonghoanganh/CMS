import { Injectable } from '@nestjs/common';
import type { HostSiteResponse, SiteAddressResponse } from '@plp/contracts';
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
  constructor(
    private readonly domains: DomainsRepository,
    private readonly sites: SitesRepository,
    private readonly siteHosts: SiteHosts,
  ) {}

  /**
   * Caddy's on-demand TLS asks before getting a certificate: yes only for a custom domain that is
   * verified and points here. The default addresses share one wildcard certificate, so creating
   * sites never asks the CA for anything and cannot use up its limits for the base domain.
   */
  async tlsAllowed(domain: string): Promise<void> {
    if ((await this.domains.findServing(bareHost(domain))) === null) {
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
