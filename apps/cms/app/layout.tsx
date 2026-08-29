import type { Metadata } from 'next';

import './globals.css';
import './ui/system.css';

export const metadata: Metadata = {
  description: 'Management workspace for the Payload Page Platform',
  title: 'Payload CMS',
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
