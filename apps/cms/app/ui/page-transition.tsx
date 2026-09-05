'use client';

import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';

export function CmsPageTransition({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const isBuilderRoute = pathname.includes('/builder');

  return (
    <div
      className={isBuilderRoute ? 'cms-page-transition is-static' : 'cms-page-transition'}
      key={pathname}
    >
      {children}
    </div>
  );
}
