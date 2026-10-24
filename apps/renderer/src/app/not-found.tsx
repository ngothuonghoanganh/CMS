import { MAIN_CONTENT_ID } from '@plp/sections/react';
import type { Metadata } from 'next';
import styles from './not-found.module.css';

export const metadata: Metadata = {
  title: 'Không tìm thấy trang',
  robots: { index: false, follow: false },
};

/**
 * One 404 for every miss (unknown host, unknown site, unknown or unpublished page, bad preview
 * token), so the response never reveals whether a site exists.
 */
export default function NotFound() {
  return (
    <main id={MAIN_CONTENT_ID} className={styles.main}>
      <h1 className={styles.title}>Không tìm thấy trang</h1>
      <p className={styles.text}>
        Trang bạn tìm không tồn tại hoặc chưa được xuất bản. Hãy kiểm tra lại đường dẫn.
      </p>
      <a className={styles.link} href="/">
        Về trang chủ
      </a>
    </main>
  );
}
