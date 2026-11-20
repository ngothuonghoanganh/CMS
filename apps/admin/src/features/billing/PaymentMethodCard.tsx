'use client';

import type { PaymentMethodResponse } from '@plp/contracts';
import { Badge, Button, Callout } from '@plp/ui';
import { cx } from '../shell/cx';
import { cardExpiryNote, cardLabel } from './payment-presentation';
import { paymentsMessage } from './payment-problem';
import { useMethodSetup } from './use-method-setup';
import styles from './Payments.module.css';

export interface PaymentMethodCardProps {
  workspaceId: string;
  method: PaymentMethodResponse;
  /**
   * The last charge of this very card was refused: it is outlined in danger, as board 29's failed
   * state. A card saved after that refusal is not.
   */
  declined: boolean;
  /** Where the gateway leads back to: this screen, or board 28's dialog. */
  returnTo?: 'payments' | 'plan';
}

/**
 * "Phương thức thanh toán" (board 29): the saved card, and the gateway's page that adds or
 * replaces it. The gateway keeps the card; only its brand, last four digits and expiry show here.
 */
export function PaymentMethodCard({
  workspaceId,
  method,
  declined,
  returnTo = 'payments',
}: PaymentMethodCardProps) {
  const setup = useMethodSetup(workspaceId, returnTo);
  const card = method.paymentMethod;
  const expiry = card === null ? null : cardExpiryNote(card);
  return (
    <section aria-labelledby="payment-method-title" className={styles.card}>
      <h2 id="payment-method-title" className={styles.cardTitle}>
        Phương thức thanh toán
      </h2>
      {method.paymentsEnabled ? null : (
        <Callout tone="warning" title="Thanh toán chưa được bật">
          Hệ thống này chưa nối với cổng thanh toán, nên chưa thêm thẻ hay thanh toán được.
        </Callout>
      )}
      {card === null ? (
        <p className={styles.noMethod}>Chưa có phương thức thanh toán.</p>
      ) : (
        <div
          className={cx(styles.method, (declined || expiry?.danger === true) && styles.methodBad)}
        >
          <span className={styles.cardChip} aria-hidden="true">
            THẺ
          </span>
          <span className={styles.methodText}>
            <span className={styles.methodName}>{cardLabel(card)}</span>
            <span className={cx(styles.methodNote, expiry?.danger === true && styles.noteDanger)}>
              {declined && expiry?.danger !== true
                ? 'Lần thanh toán gần nhất bị từ chối'
                : expiry?.text}
            </span>
          </span>
          <Badge tone="neutral" size="sm">
            MẶC ĐỊNH
          </Badge>
        </div>
      )}
      <div className={styles.actions}>
        <Button
          variant={card === null ? 'primary' : 'secondary'}
          loading={setup.busy}
          disabled={!method.paymentsEnabled}
          onClick={setup.start}
        >
          {card === null ? 'Thêm phương thức' : 'Đổi thẻ'}
        </Button>
      </div>
      {setup.error === null ? null : (
        <Callout tone="danger" role="alert">
          {paymentsMessage(setup.error)}
        </Callout>
      )}
      <p className={styles.fine}>
        Hiện hỗ trợ thẻ quốc tế. Thông tin thẻ do cổng thanh toán lưu, Payload không lưu số thẻ.
      </p>
    </section>
  );
}
