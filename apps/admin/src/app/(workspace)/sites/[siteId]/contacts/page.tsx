import { holdersOf } from '@plp/contracts';
import type { Metadata } from 'next';
import { ContactsScreen } from '../../../../../features/contacts/ContactsScreen';
import { loadContactsData } from '../../../../../features/contacts/load-contacts';
import { siteHref } from '../../../../../features/shell/navigation';
import { NoPermission } from '../../../../../features/shell/NoPermission';
import { loadSiteContext } from '../../../../../features/shell/site-context';

interface ContactsPageProps {
  params: Promise<{ siteId: string }>;
}

export async function generateMetadata({ params }: ContactsPageProps): Promise<Metadata> {
  const { site } = await loadSiteContext((await params).siteId);
  return { title: `Khách hàng — ${site.name}` };
}

/** Screen 22: the customers of the site (ADR-033). */
export default async function ContactsPage({ params }: ContactsPageProps) {
  const { site, membership, leadCounts } = await loadSiteContext((await params).siteId);
  // The site context loads no lead counts for roles without `leads.view` (ADR-020).
  if (leadCounts === null) {
    return (
      <NoPermission
        title="Bạn chưa có quyền xem khách hàng"
        membership={membership}
        holders={`Chỉ ${holdersOf('leads.view')} xem được khách hàng của site.`}
        back={{ href: siteHref(site.id), label: 'Về danh sách trang' }}
        requestAccess
      />
    );
  }
  const data = await loadContactsData(site.id);
  return (
    // Each server render (a sidebar link, a refresh) starts again from the first page.
    <ContactsScreen
      key={data.loadedAt}
      site={site}
      role={membership.role}
      initialList={data.list}
      initialOptions={data.options}
      loadedAt={data.loadedAt}
    />
  );
}
