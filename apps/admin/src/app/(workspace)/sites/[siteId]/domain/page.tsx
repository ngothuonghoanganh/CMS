import type { Metadata } from 'next';
import { DefaultDomainCard } from '../../../../../features/domain/DefaultDomainCard';
import { PageContainer, PageHeader } from '../../../../../features/shell/PageHeader';
import { loadSiteContext } from '../../../../../features/shell/site-context';

interface DomainPageProps {
  params: Promise<{ siteId: string }>;
}

export async function generateMetadata({ params }: DomainPageProps): Promise<Metadata> {
  const { site } = await loadSiteContext((await params).siteId);
  return { title: `Tên miền — ${site.name}` };
}

export default async function DomainPage({ params }: DomainPageProps) {
  const { site } = await loadSiteContext((await params).siteId);
  return (
    <PageContainer width="narrow">
      <PageHeader
        title="Tên miền"
        description={`Địa chỉ khách truy cập dùng để xem các trang đã xuất bản của ${site.name}.`}
      />
      <DefaultDomainCard site={site} />
    </PageContainer>
  );
}
