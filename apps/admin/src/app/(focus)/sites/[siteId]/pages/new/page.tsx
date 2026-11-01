import { can, holdersOf } from '@plp/contracts';
import type { Metadata } from 'next';
import { CreatePageWizard } from '../../../../../../features/onboarding/CreatePageWizard';
import { siteHref } from '../../../../../../features/shell/navigation';
import { NoPermission } from '../../../../../../features/shell/NoPermission';
import { loadSiteContext } from '../../../../../../features/shell/site-context';

interface NewPageProps {
  params: Promise<{ siteId: string }>;
}

export async function generateMetadata({ params }: NewPageProps): Promise<Metadata> {
  const { site } = await loadSiteContext((await params).siteId);
  return { title: `Tạo trang mới — ${site.name}` };
}

/** Screen 02: create a page from a goal, full screen without the sidebar. */
export default async function NewPage({ params }: NewPageProps) {
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
  return <CreatePageWizard site={site} />;
}
