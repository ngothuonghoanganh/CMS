import { MAIN_CONTENT_ID } from '@plp/sections/react';
import { Be_Vietnam_Pro, Lora } from 'next/font/google';
import type { ReactNode } from 'react';
import './globals.css';
import styles from './layout.module.css';

// Every theme preset of @plp/sections references these two CSS variables.
const sans = Be_Vietnam_Pro({
  subsets: ['latin', 'vietnamese'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-be-vietnam-pro',
  display: 'swap',
});

// Heading font of the "Hoàng hôn" theme only; not preloaded, so other themes never download it.
const serif = Lora({
  subsets: ['latin', 'vietnamese'],
  weight: ['500', '600', '700'],
  variable: '--font-lora',
  display: 'swap',
  preload: false,
});

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="vi" className={`${sans.variable} ${serif.variable}`}>
      <body>
        <a className={styles.skipLink} href={`#${MAIN_CONTENT_ID}`}>
          Bỏ qua đến nội dung
        </a>
        {children}
      </body>
    </html>
  );
}
