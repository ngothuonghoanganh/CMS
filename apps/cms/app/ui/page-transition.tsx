'use client';

import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';

export function CmsPageTransition({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="cms-page-transition" key={pathname}>
      {children}
    </div>
  );
}
