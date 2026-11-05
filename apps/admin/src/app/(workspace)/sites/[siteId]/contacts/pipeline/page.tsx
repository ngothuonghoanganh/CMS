import { can, holdersOf } from '@plp/contracts';
import type { Metadata } from 'next';
import { loadPipelineData } from '../../../../../../features/pipeline/load-pipeline';
import { PipelineScreen } from '../../../../../../features/pipeline/PipelineScreen';
import { contactsHref } from '../../../../../../features/shell/navigation';
import { NoPermission } from '../../../../../../features/shell/NoPermission';
import { loadSiteContext } from '../../../../../../features/shell/site-context';

interface PipelinePageProps {
  params: Promise<{ siteId: string }>;
}

export async function generateMetadata({ params }: PipelinePageProps): Promise<Metadata> {
  const { site } = await loadSiteContext((await params).siteId);
  return { title: `Cơ hội — ${site.name}` };
}

/** Screen 24: the pipeline of the site (ADR-033), under "Khách hàng". */
export default async function PipelinePage({ params }: PipelinePageProps) {
  const { site, membership, leadCounts } = await loadSiteContext((await params).siteId);
  // The site context loads no lead counts for roles without `leads.view` (ADR-020).
  if (leadCounts === null) {
    return (
      <NoPermission
        title="Bạn chưa có quyền xem cơ hội"
        membership={membership}
        holders={`Chỉ ${holdersOf('leads.view')} xem được cơ hội của site.`}
        back={{ href: contactsHref(site.id), label: 'Về danh sách khách hàng' }}
        requestAccess
      />
    );
  }
  const data = await loadPipelineData(site.id);
  return (
    <PipelineScreen
      key={data.loadedAt}
      site={site}
      canHandle={can(membership.role, 'leads.handle')}
      initial={data.pipeline}
      options={data.options}
      loadedAt={data.loadedAt}
    />
  );
}
