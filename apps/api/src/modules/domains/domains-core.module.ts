import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { DOMAIN_MODEL, domainSchema } from './domain.schema.js';
import { DomainsRepository } from './domains.repository.js';
import { SiteHosts } from './site-hosts.js';

/** Domain persistence, and the hosts of a site for lead intake and page views (ADR-022). */
@Module({
  imports: [MongooseModule.forFeature([{ name: DOMAIN_MODEL, schema: domainSchema }])],
  providers: [DomainsRepository, SiteHosts],
  exports: [DomainsRepository, SiteHosts],
})
export class DomainsCoreModule {}
