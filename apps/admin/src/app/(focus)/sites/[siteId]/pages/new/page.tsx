import type { Metadata } from 'next';
import { CreatePageWizard } from '../../../../../../features/onboarding/CreatePageWizard';
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
  const { site } = await loadSiteContext((await params).siteId);
  return <CreatePageWizard site={site} />;
}
