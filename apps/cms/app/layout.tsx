import type { Metadata } from 'next';

import './ui/tokens.css';
import './ui/third-party.css';
import './globals.css';
import './ui/system.css';
import { CmsThemeProvider } from './ui/theme-provider';

export const metadata: Metadata = {
  description: 'Management workspace for the Payload Page Platform',
  title: 'Payload CMS',
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html data-cms-theme="dark" lang="en" suppressHydrationWarning>
      <body>
        <CmsThemeProvider>{children}</CmsThemeProvider>
      </body>
    </html>
  );
}
