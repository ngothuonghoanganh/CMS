import { holdersOf } from '@plp/contracts';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { ApiError } from '../../../../../../lib/api-core';
import { ContactProfileScreen } from '../../../../../../features/contacts/profile/ContactProfileScreen';
import { loadContactProfileData } from '../../../../../../features/contacts/profile/load-contact-profile';
import { contactsHref } from '../../../../../../features/shell/navigation';
import { NoPermission } from '../../../../../../features/shell/NoPermission';
import { loadSiteContext } from '../../../../../../features/shell/site-context';

interface ContactProfilePageProps {
  params: Promise<{ siteId: string; contactId: string }>;
}

export async function generateMetadata({ params }: ContactProfilePageProps): Promise<Metadata> {
  const { site } = await loadSiteContext((await params).siteId);
  // The person's name stays out of the title: it ends up in history and tab lists (rule 10).
  return { title: `Hồ sơ khách hàng — ${site.name}` };
}

/** Screen 23: a customer's profile (ADR-033). */
export default async function ContactProfilePage({ params }: ContactProfilePageProps) {
  const { siteId, contactId } = await params;
  const { site, membership, leadCounts } = await loadSiteContext(siteId);
  // The site context loads no lead counts for roles without `leads.view` (ADR-020).
  if (leadCounts === null) {
    return (
      <NoPermission
        title="Bạn chưa có quyền xem khách hàng"
        membership={membership}
        holders={`Chỉ ${holdersOf('leads.view')} xem được khách hàng của site.`}
        back={{ href: contactsHref(site.id), label: 'Về danh sách khách hàng' }}
        requestAccess
      />
    );
  }
  let data;
  try {
    data = await loadContactProfileData(site.id, contactId);
  } catch (error) {
    // Merged away, deleted with the person, or of another site (ADR-003).
    if (error instanceof ApiError && error.status === 404) {
      notFound();
    }
    throw error;
  }
  return <ContactProfileScreen key={data.loadedAt} site={site} {...data} />;
}
