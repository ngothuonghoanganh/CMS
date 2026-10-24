import type { Site } from '@plp/contracts';
import { Badge, Card, LockIcon } from '@plp/ui';
import { hostOf } from '../../lib/site-url';
import { CopyAddressButton } from './CopyAddressButton';
import styles from './DefaultDomainCard.module.css';

/**
 * Screen 08 in MVP A: the site's default domain `{subdomain}.{BASE_DOMAIN}`, which works from the
 * moment the site exists. Custom domains come later (ARCHITECTURE §2.1, ADR-011).
 */
export function DefaultDomainCard({ site }: { site: Site }) {
  const host = hostOf(site.defaultOrigin);
  return (
    <>
      <Card as="section" padding="none" aria-label="Tên miền đang dùng">
        <div className={styles.row}>
          <div className={styles.details}>
            <div className={styles.titleRow}>
              <span className={styles.host}>{host}</span>
              <Badge tone="neutral" size="sm" className={styles.kind}>
                MẶC ĐỊNH · MIỄN PHÍ
              </Badge>
            </div>
            <p className={styles.note}>
              Có sẵn khi tạo site, dùng được ngay cả khi chưa có tên miền riêng.
            </p>
          </div>
          <Badge tone="success" icon={<LockIcon size={13} strokeWidth={2.4} />}>
            Luôn hoạt động
          </Badge>
          <CopyAddressButton url={site.defaultOrigin} host={host} />
        </div>
      </Card>
      <p className={styles.later}>Kết nối tên miền riêng sẽ có ở phiên bản sau.</p>
    </>
  );
}
