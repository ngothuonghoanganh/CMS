'use client';

import { CenteredPage } from '../features/shell/CenteredPage';
import { RouteError } from '../features/shell/RouteError';

/**
 * Any screen outside a site frame (home, sign-in, site creation, editor, page creation) that
 * failed to load, including a failing site layout. Rendered inside the root layout.
 */
export default function AppError({ error, retry }: { error: unknown; retry: () => void }) {
  return (
    <CenteredPage>
      <RouteError error={error} retry={retry} />
    </CenteredPage>
  );
}
