import styles from './page.module.css';

// Placeholder until slice S1 adds sign-in and the dashboard.
export default function HomePage() {
  return (
    <main className={styles.main}>
      <h1 className={styles.title}>Payload</h1>
      <p className={styles.lead}>
        Khu quản trị đang được dựng lại. Đăng nhập và bảng điều khiển sẽ có ở lát S1.
      </p>
    </main>
  );
}
