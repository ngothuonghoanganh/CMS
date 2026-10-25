import type { Metadata } from 'next';
import { parseLeadFilters, parseSelectedLead } from '../../../../../features/leads/filters';
import { LeadInbox } from '../../../../../features/leads/LeadInbox';
import { loadLeadInboxData } from '../../../../../features/leads/load-leads';
import { loadSiteContext } from '../../../../../features/shell/site-context';

interface LeadsPageProps {
  params: Promise<{ siteId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export async function generateMetadata({ params }: LeadsPageProps): Promise<Metadata> {
  const { site } = await loadSiteContext((await params).siteId);
  return { title: `Leads — ${site.name}` };
}

/** Screen 10: the lead inbox. The client keeps the filters and the open lead in the URL. */
export default async function LeadsPage({ params, searchParams }: LeadsPageProps) {
  const { site, membership, leadCounts } = await loadSiteContext((await params).siteId);
  const query = await searchParams;
  const filters = parseLeadFilters(query);
  const leadId = parseSelectedLead(query);
  const data = await loadLeadInboxData(site.id, filters, leadId);
  return (
    // Each server render (a sidebar link, a refresh) starts again from the URL.
    <LeadInbox
      key={data.loadedAt}
      site={site}
      canManage={membership.role === 'owner'}
      initialFilters={filters}
      initialLeadId={leadId}
      initialList={data.list}
      initialDetail={data.detail}
      pageRefs={data.pageRefs.items}
      leadCounts={leadCounts}
      loadedAt={data.loadedAt}
    />
  );
}
