import { can, endpoints, holdersOf, idSchema } from '@plp/contracts';
import type { Metadata } from 'next';
import { parseAdminEnv } from '../../../../../../env';
import { DomainConnectScreen } from '../../../../../../features/domain/DomainConnectScreen';
import { siteHref } from '../../../../../../features/shell/navigation';
import { NoPermission } from '../../../../../../features/shell/NoPermission';
import { loadSiteContext } from '../../../../../../features/shell/site-context';
import { serverApi } from '../../../../../../lib/server-api';

interface ConnectPageProps {
  params: Promise<{ siteId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export async function generateMetadata({ params }: ConnectPageProps): Promise<Metadata> {
  const { site } = await loadSiteContext((await params).siteId);
  return { title: `Kết nối tên miền riêng — ${site.name}` };
}

async function loadDomain(siteId: string, domainId: string | null) {
  if (domainId === null) {
    return { domain: null, loadedAt: Date.now() };
  }
  const { items } = await serverApi(endpoints.listDomains, [siteId]);
  return { domain: items.find((item) => item.id === domainId) ?? null, loadedAt: Date.now() };
}

/** The domain of default addresses, e.g. "payload.site": not a custom domain. */
function baseDomain(): string {
  const host = new URL(
    parseAdminEnv(process.env).PUBLIC_SITE_ORIGIN_TEMPLATE.replace('{subdomain}', 'x'),
  ).hostname;
  return host.slice(host.indexOf('.') + 1);
}

/** Board 14: connect a custom domain, or resume one with `?domain=` (ADR-022). */
export default async function DomainConnectPage({ params, searchParams }: ConnectPageProps) {
  const { site, membership } = await loadSiteContext((await params).siteId);
  if (!can(membership.role, 'domains.manage')) {
    return (
      <NoPermission
        title="Bạn chưa có quyền kết nối tên miền"
        membership={membership}
        holders={`Chỉ ${holdersOf('domains.manage')} kết nối và đổi được tên miền của site.`}
        back={{ href: siteHref(site.id), label: 'Về danh sách trang' }}
        requestAccess
      />
    );
  }
  const requested = idSchema.safeParse((await searchParams).domain);
  const { domain, loadedAt } = await loadDomain(site.id, requested.success ? requested.data : null);
  return (
    <DomainConnectScreen
      key={domain?.id ?? 'new'}
      site={site}
      initialDomain={domain}
      baseDomain={baseDomain()}
      loadedAt={loadedAt}
    />
  );
}
