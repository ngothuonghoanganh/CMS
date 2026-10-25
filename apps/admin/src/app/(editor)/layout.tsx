import { ToastProvider } from '@plp/ui';
import type { ReactNode } from 'react';

/** Full-screen editor: no sidebar. Toasts (preview link, theme saved) live here. */
export default function EditorLayout({ children }: { children: ReactNode }) {
  return <ToastProvider>{children}</ToastProvider>;
}
