'use client';

import type { MarketplaceItemDetail } from '@plp/contracts';
import { Button } from '@plp/ui';
import { useId, useState } from 'react';
import styles from './ClaimDialog.module.css';

export interface LicenceTermsProps {
  terms: MarketplaceItemDetail['terms'];
}

/**
 * The licence terms behind "Tôi đồng ý với điều khoản giấy phép", readable inside the dialog since
 * the page behind it is out of reach. Shared by "Nhận mẫu" and "Xác nhận mua mẫu".
 */
export function LicenceTerms({ terms }: LicenceTermsProps) {
  const termsId = useId();
  const [shown, setShown] = useState(false);
  return (
    <div className={styles.terms}>
      <Button
        variant="ghost"
        size="sm"
        className={styles.termsToggle}
        aria-expanded={shown}
        aria-controls={termsId}
        onClick={() => {
          setShown((value) => !value);
        }}
      >
        {shown ? 'Ẩn điều khoản giấy phép' : 'Đọc điều khoản giấy phép'}
      </Button>
      {/* Focusable so a keyboard scrolls the terms; the region names their version. */}
      <section
        id={termsId}
        hidden={!shown}
        aria-label={`Điều khoản giấy phép v${terms.version}`}
        tabIndex={0}
        className={styles.termsText}
      >
        <ol>
          {terms.licence.map((paragraph, index) => (
            <li key={index}>{paragraph}</li>
          ))}
        </ol>
      </section>
    </div>
  );
}
