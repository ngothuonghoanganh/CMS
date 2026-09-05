import { BillingView } from '../../../billing/billing-view';

export default async function BillingPage({
  params,
}: {
  params: Promise<{ workspaceId: string }>;
}) {
  const { workspaceId } = await params;
  return <BillingView workspaceId={workspaceId} />;
}
