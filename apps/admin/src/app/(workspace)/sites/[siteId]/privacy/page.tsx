import { endpoints } from '@plp/contracts';
import type { Metadata } from 'next';
import { PrivacyScreen } from '../../../../../features/privacy/PrivacyScreen';
import { PageContainer, PageHeader } from '../../../../../features/shell/PageHeader';
import { loadSiteContext } from '../../../../../features/shell/site-context';
import { serverApi } from '../../../../../lib/server-api';

interface PrivacyPageProps {
  params: Promise<{ siteId: string }>;
}

export async function generateMetadata({ params }: PrivacyPageProps): Promise<Metadata> {
  const { site } = await loadSiteContext((await params).siteId);
  return { title: `Dữ liệu & đồng ý — ${site.name}` };
}

export default async function PrivacyPage({ params }: PrivacyPageProps) {
  const { site, membership } = await loadSiteContext((await params).siteId);
  const settings = await serverApi(endpoints.getPrivacySettings, [site.id]);
  return (
    <PageContainer>
      <PageHeader
        title="Dữ liệu cá nhân & đồng ý"
        description={`Áp dụng cho mọi form trên các trang của ${site.name}.`}
      />
      <PrivacyScreen siteId={site.id} settings={settings} canEdit={membership.role === 'owner'} />
    </PageContainer>
  );
}
