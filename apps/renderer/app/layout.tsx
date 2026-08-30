import type { Metadata } from 'next';
import { PAGE_RUNTIME_BASELINE_CSS } from '@payload/contracts';

import './globals.css';

export const metadata: Metadata = {
  description: 'Public delivery shell for the Payload Page Platform',
  title: 'Payload Page Platform — Renderer',
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <head>
        <style data-page-runtime-baseline>{PAGE_RUNTIME_BASELINE_CSS}</style>
      </head>
      <body>{children}</body>
    </html>
  );
}
