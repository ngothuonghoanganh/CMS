import { accessLabel, can, holdersOf } from '@plp/contracts';
import type { Metadata } from 'next';
import { AutomationsScreen } from '../../../../../features/automations/AutomationsScreen';
import { loadAutomationsData } from '../../../../../features/automations/load-automations';
import { siteHref } from '../../../../../features/shell/navigation';
import { NoPermission } from '../../../../../features/shell/NoPermission';
import { loadSiteContext } from '../../../../../features/shell/site-context';

interface AutomationsPageProps {
  params: Promise<{ siteId: string }>;
}

export async function generateMetadata({ params }: AutomationsPageProps): Promise<Metadata> {
  const { site } = await loadSiteContext((await params).siteId);
  return { title: `Automation — ${site.name}` };
}

/** Screen 25: the automations of the site (ADR-034). */
export default async function AutomationsPage({ params }: AutomationsPageProps) {
  const { site, membership, plan } = await loadSiteContext((await params).siteId);
  if (!can(membership.role, 'automations.view')) {
    return (
      <NoPermission
        title="Bạn chưa có quyền xem automation"
        membership={membership}
        holders={`Chỉ ${holdersOf('automations.view')} xem được automation của site.`}
        back={{ href: siteHref(site.id), label: 'Về danh sách trang' }}
        requestAccess
      />
    );
  }
  // A plan without automation has no list to read; the screen says so and, once the plan changes,
  // reads the list itself.
  const data = await loadAutomationsData(site.id, plan.plan.features.automation);
  return (
    <AutomationsScreen
      key={data.loadedAt}
      site={site}
      role={membership.role}
      roleLabel={accessLabel(membership.role)}
      initial={data.list}
      loadedAt={data.loadedAt}
    />
  );
}
