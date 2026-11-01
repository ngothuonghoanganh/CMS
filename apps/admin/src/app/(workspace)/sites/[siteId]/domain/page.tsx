import { can, endpoints, holdersOf } from '@plp/contracts';
import type { Metadata } from 'next';
import { DomainsScreen } from '../../../../../features/domain/DomainsScreen';
import { siteHref } from '../../../../../features/shell/navigation';
import { NoPermission } from '../../../../../features/shell/NoPermission';
import { loadSiteContext } from '../../../../../features/shell/site-context';
import { serverApi } from '../../../../../lib/server-api';

interface DomainPageProps {
  params: Promise<{ siteId: string }>;
}

export async function generateMetadata({ params }: DomainPageProps): Promise<Metadata> {
  const { site } = await loadSiteContext((await params).siteId);
  return { title: `Tên miền — ${site.name}` };
}

async function loadDomains(siteId: string) {
  const list = await serverApi(endpoints.listDomains, [siteId]);
  return { list, loadedAt: Date.now() };
}

/** Board 13: the site's addresses (ADR-022). */
export default async function DomainPage({ params }: DomainPageProps) {
  const { site, membership } = await loadSiteContext((await params).siteId);
  if (!can(membership.role, 'domains.manage')) {
    return (
      <NoPermission
        title="Bạn chưa có quyền xem tên miền"
        membership={membership}
        holders={`Chỉ ${holdersOf('domains.manage')} kết nối và đổi được tên miền của site.`}
        back={{ href: siteHref(site.id), label: 'Về danh sách trang' }}
        requestAccess
      />
    );
  }
  const { list, loadedAt } = await loadDomains(site.id);
  return <DomainsScreen site={site} initial={list} loadedAt={loadedAt} />;
}
