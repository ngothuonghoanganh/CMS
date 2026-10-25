import { ToastProvider } from '@plp/ui';
import type { ReactNode } from 'react';

/** Full-screen focused flows (creating a page): no sidebar. Each page renders its own `<main>`. */
export default function FocusLayout({ children }: { children: ReactNode }) {
  return <ToastProvider>{children}</ToastProvider>;
}
