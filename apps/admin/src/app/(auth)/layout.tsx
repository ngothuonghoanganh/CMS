import type { ReactNode } from 'react';
import { CenteredPage } from '../../features/shell/CenteredPage';

/** Sign-in pages: the logo and one centered card, without the sidebar. */
export default function AuthLayout({ children }: { children: ReactNode }) {
  return <CenteredPage width="sm">{children}</CenteredPage>;
}
