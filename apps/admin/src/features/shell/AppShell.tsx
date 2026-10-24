'use client';

import { CloseIcon, IconButton, MenuIcon, ToastProvider, VisuallyHidden } from '@plp/ui';
import { Dialog as RadixDialog } from 'radix-ui';
import { type ReactNode, useEffect, useState } from 'react';
import { Brand } from './Brand';
import { Sidebar, type SidebarProps } from './Sidebar';
import styles from './AppShell.module.css';

/** Below this width the sidebar moves into a drawer behind the menu button. */
const WIDE_LAYOUT_QUERY = '(min-width: 900px)';

export interface AppShellProps extends Omit<SidebarProps, 'onNavigate'> {
  children: ReactNode;
}

/**
 * The workspace frame: the sidebar on wide screens, a top bar with a navigation drawer on narrow
 * ones, and the `<main>` landmark for the page. Pages inside must not render another `<main>`.
 */
export function AppShell({ children, ...sidebar }: AppShellProps) {
  const [drawerOpen, setDrawerOpen] = useState(false);

  useEffect(() => {
    const query = window.matchMedia(WIDE_LAYOUT_QUERY);
    const closeOnWide = (event: MediaQueryListEvent) => {
      if (event.matches) {
        setDrawerOpen(false);
      }
    };
    query.addEventListener('change', closeOnWide);
    return () => {
      query.removeEventListener('change', closeOnWide);
    };
  }, []);

  return (
    <ToastProvider>
      <a href="#main-content" className={styles.skipLink}>
        Bỏ qua điều hướng
      </a>
      <div className={styles.shell}>
        <header className={styles.topBar}>
          <RadixDialog.Root open={drawerOpen} onOpenChange={setDrawerOpen}>
            <RadixDialog.Trigger asChild>
              <IconButton aria-label="Mở menu điều hướng" icon={<MenuIcon size={22} />} />
            </RadixDialog.Trigger>
            <RadixDialog.Portal>
              <RadixDialog.Overlay className={styles.overlay} />
              <RadixDialog.Content className={styles.drawer} aria-describedby={undefined}>
                <RadixDialog.Title asChild>
                  <VisuallyHidden>Menu điều hướng</VisuallyHidden>
                </RadixDialog.Title>
                <div className={styles.drawerClose}>
                  <RadixDialog.Close asChild>
                    <IconButton aria-label="Đóng menu điều hướng" icon={<CloseIcon size={20} />} />
                  </RadixDialog.Close>
                </div>
                <Sidebar
                  {...sidebar}
                  onNavigate={() => {
                    setDrawerOpen(false);
                  }}
                />
              </RadixDialog.Content>
            </RadixDialog.Portal>
          </RadixDialog.Root>
          <Brand />
          <span className={styles.topBarSite}>{sidebar.site.name}</span>
        </header>
        <aside className={styles.sidebar}>
          <Sidebar {...sidebar} />
        </aside>
        <main id="main-content" tabIndex={-1} className={styles.main}>
          {children}
        </main>
      </div>
    </ToastProvider>
  );
}
