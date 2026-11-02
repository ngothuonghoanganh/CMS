import { can, endpoints, holdersOf } from '@plp/contracts';
import type { Metadata } from 'next';
import { AiCreateScreen } from '../../../../../../../features/ai-create/AiCreateScreen';
import { siteHref } from '../../../../../../../features/shell/navigation';
import { NoPermission } from '../../../../../../../features/shell/NoPermission';
import { loadSiteContext } from '../../../../../../../features/shell/site-context';
import { serverApi } from '../../../../../../../lib/server-api';

interface NewAiPageProps {
  params: Promise<{ siteId: string }>;
}

export async function generateMetadata({ params }: NewAiPageProps): Promise<Metadata> {
  const { site } = await loadSiteContext((await params).siteId);
  return { title: `Tạo trang bằng AI — ${site.name}` };
}

/** Screen 20: create a page from a brief with AI (ADR-031), full screen without the sidebar. */
export default async function NewAiPage({ params }: NewAiPageProps) {
  const { site, membership } = await loadSiteContext((await params).siteId);
  if (!can(membership.role, 'pages.edit')) {
    return (
      <main id="main-content">
        <NoPermission
          title="Bạn chưa có quyền tạo trang"
          membership={membership}
          holders={`Chỉ ${holdersOf('pages.edit')} tạo được trang mới.`}
          back={{ href: siteHref(site.id), label: 'Về danh sách trang' }}
          requestAccess
        />
      </main>
    );
  }
  const usage = await serverApi(endpoints.aiUsage, [site.id]);
  return <AiCreateScreen site={site} usage={usage} />;
}
