import { Module } from '@nestjs/common';
import { type Env, tlsCheckEnabled } from '../../config/env.js';
import { ENV } from '../../shared/env.js';
import { AuthModule } from '../auth/auth.module.js';
import { EmailModule } from '../notifications/email.module.js';
import { RevalidationModule } from '../revalidation/revalidation.module.js';
import { SitesCoreModule } from '../sites/sites-core.module.js';
import { DomainChecker } from './domain-checker.service.js';
import { DomainDns, NetworkDomainDns, ZoneFileDomainDns } from './domain-dns.js';
import { DomainMonitor } from './domain-monitor.service.js';
import { DomainTls, NetworkDomainTls } from './domain-tls.js';
import { DomainsCoreModule } from './domains-core.module.js';
import { DomainsController } from './domains.controller.js';
import { DomainsService } from './domains.service.js';
import { PublicDomainsController } from './public-domains.controller.js';
import { PublicDomainsService } from './public-domains.service.js';

/** Custom domains (ADR-022): the admin's endpoints, the edge's and renderer's, the checks. */
@Module({
  imports: [AuthModule, DomainsCoreModule, EmailModule, RevalidationModule, SitesCoreModule],
  controllers: [DomainsController, PublicDomainsController],
  providers: [
    {
      provide: DomainDns,
      inject: [ENV],
      useFactory: (env: Env): DomainDns =>
        env.DOMAIN_DNS_ZONE_FILE === undefined
          ? new NetworkDomainDns()
          : new ZoneFileDomainDns(env.DOMAIN_DNS_ZONE_FILE),
    },
    {
      provide: DomainTls,
      inject: [ENV],
      // parseEnv requires an edge address whenever HTTPS is checked; unchecked, no probe runs.
      useFactory: (env: Env): DomainTls =>
        new NetworkDomainTls(tlsCheckEnabled(env) ? (env.CUSTOM_DOMAIN_IPV4[0] ?? '') : ''),
    },
    DomainChecker,
    DomainsService,
    PublicDomainsService,
    DomainMonitor,
  ],
  exports: [DomainChecker, DomainMonitor],
})
export class DomainsModule {}
