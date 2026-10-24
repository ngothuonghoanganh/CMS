import { ArrowUpIcon } from '@plp/ui';
import { cx } from './cx';
import styles from './Brand.module.css';

/** The "Payload" logo from the sidebar board: an indigo tile with an up arrow and the name. */
export function Brand({ className }: { className?: string | undefined }) {
  return (
    <span className={cx(styles.brand, className)}>
      <span className={styles.mark} aria-hidden="true">
        <ArrowUpIcon size={14} strokeWidth={2.4} />
      </span>
      <span className={styles.name}>Payload</span>
    </span>
  );
}
