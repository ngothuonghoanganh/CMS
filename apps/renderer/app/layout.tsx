import type { Metadata } from 'next';

import './globals.css';

export const metadata: Metadata = {
  description: 'Public delivery shell for the Payload Landing Page Platform',
  title: 'Payload Landing Page Platform — Renderer',
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
