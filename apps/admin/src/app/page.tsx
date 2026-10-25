import { endpoints } from '@plp/contracts';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { siteHref } from '../features/shell/navigation';
import { FormCard } from '../features/shell/FormCard';
import { CenteredPage } from '../features/shell/CenteredPage';
import {
  pickMembership,
  WORKSPACE_PREFERENCE_COOKIE,
} from '../features/shell/workspace-preference';
import { requireMe, serverApi } from '../lib/server-api';

/**
 * Entry point: opens the first site of the preferred workspace, or site creation when the
 * workspace has none yet.
 */
export default async function HomePage() {
  const me = await requireMe();
  const preferred = (await cookies()).get(WORKSPACE_PREFERENCE_COOKIE)?.value;
  const membership = pickMembership(me.memberships, preferred);
  if (membership === null) {
    return (
      <CenteredPage>
        <FormCard
          title="Chưa có workspace"
          description="Tài khoản của bạn chưa thuộc workspace nào. Hãy nhờ Owner của agency thêm bạn vào workspace."
        >
          {null}
        </FormCard>
      </CenteredPage>
    );
  }
  const { items } = await serverApi(endpoints.listSites, [membership.workspace.id]);
  const first = items[0];
  redirect(first === undefined ? '/sites/new' : siteHref(first.id));
}
