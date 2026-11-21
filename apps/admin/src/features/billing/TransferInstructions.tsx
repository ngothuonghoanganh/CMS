'use client';

import type { Invoice, InvoiceTransfer } from '@plp/contracts';
import { Badge, Button, ButtonLink, Callout, useToast } from '@plp/ui';
import { formatVnd } from '../../lib/format';
import { paymentsMessage } from './payment-problem';
import styles from './Payments.module.css';

interface CopyRowProps {
  label: string;
  /** What shows. */
  value: string;
  /** What is copied, when it differs (the amount without its currency sign). */
  copy?: string;
  mono?: boolean;
}

/** One line of the transfer details with a button that copies the value for the banking app. */
function CopyRow({ label, value, copy = value, mono = false }: CopyRowProps) {
  const { toast } = useToast();
  async function copyValue() {
    try {
      await navigator.clipboard.writeText(copy);
      toast({ tone: 'success', title: `Đã sao chép ${label.toLowerCase()}` });
    } catch (error) {
      console.error('Copying the transfer detail failed', error);
      toast({
        tone: 'warning',
        title: 'Chưa sao chép được',
        description: 'Chọn nội dung và sao chép bằng tay.',
      });
    }
  }
  return (
    <>
      <dt>{label}</dt>
      <dd className={styles.copyRow}>
        <span className={mono ? styles.mono : undefined}>{value}</span>
        <Button
          variant="ghost"
          size="sm"
          aria-label={`Sao chép ${label.toLowerCase()}`}
          onClick={() => {
            void copyValue();
          }}
        >
          Sao chép
        </Button>
      </dd>
    </>
  );
}

function TransferDetails({ invoice, transfer }: { invoice: Invoice; transfer: InvoiceTransfer }) {
  return (
    <div className={styles.transferBody}>
      {transfer.qrDataUrl === null ? null : (
        // A data URL the API drew itself: nothing to load from outside, so no `next/image`.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          className={styles.qr}
          src={transfer.qrDataUrl}
          width={176}
          height={176}
          alt={`Mã QR chuyển khoản ${formatVnd(transfer.amount)} cho hóa đơn ${invoice.number}`}
        />
      )}
      <dl className={styles.transferFacts}>
        <dt>Ngân hàng</dt>
        <dd>{transfer.bankName}</dd>
        <CopyRow label="Số tài khoản" value={transfer.accountNumber} mono />
        <dt>Chủ tài khoản</dt>
        <dd>{transfer.accountName}</dd>
        <CopyRow
          label="Số tiền"
          value={formatVnd(transfer.amount)}
          copy={String(transfer.amount)}
        />
        <CopyRow label="Nội dung" value={transfer.content} mono />
      </dl>
    </div>
  );
}

export interface TransferInstructionsProps {
  /** The pending invoice; `detail` is its transfer details once read. */
  invoiceNumber: string;
  detail: Invoice | undefined;
  error: unknown;
  loading: boolean;
  onRetry: () => void;
  /** Pays the same invoice with the saved card instead. */
  onPayWithCard: (() => void) | null;
  payingWithCard: boolean;
}

/**
 * "Chuyển khoản" (board 29, T3): where to send the money for an invoice that waits for its
 * transfer: bank, account, name, amount and the memo that names the invoice, with a QR code. The
 * invoice becomes paid when the gateway receives the money; this card then goes away.
 */
export function TransferInstructions({
  invoiceNumber,
  detail,
  error,
  loading,
  onRetry,
  onPayWithCard,
  payingWithCard,
}: TransferInstructionsProps) {
  const transfer = detail?.transfer ?? null;
  return (
    <section aria-labelledby="transfer-title" className={styles.card}>
      <div className={styles.cardHead}>
        <h2 id="transfer-title" className={styles.cardTitle}>
          Chuyển khoản hóa đơn {invoiceNumber}
        </h2>
        <Badge tone="warning" dot>
          Đang chờ xác nhận
        </Badge>
      </div>
      {transfer !== null && detail !== undefined ? (
        <>
          <p className={styles.fine}>
            Chuyển đúng số tiền và nội dung bên dưới. Hóa đơn tự cập nhật khi nhận được tiền, thường
            trong 1 ngày làm việc. Chưa cần làm gì thêm sau khi chuyển.
          </p>
          <TransferDetails invoice={detail} transfer={transfer} />
          <div className={styles.actions}>
            {transfer.pageUrl === null ? null : (
              <ButtonLink href={transfer.pageUrl} variant="secondary">
                Mở trang chuyển khoản của cổng thanh toán
              </ButtonLink>
            )}
            {onPayWithCard === null ? null : (
              <Button variant="ghost" loading={payingWithCard} onClick={onPayWithCard}>
                Thanh toán bằng thẻ thay thế
              </Button>
            )}
          </div>
        </>
      ) : error !== null && error !== undefined ? (
        <Callout
          tone="danger"
          role="alert"
          title="Chưa tải được hướng dẫn chuyển khoản"
          action={
            <Button variant="secondary" size="sm" onClick={onRetry}>
              Thử lại
            </Button>
          }
        >
          {paymentsMessage(error)}
        </Callout>
      ) : (
        <p className={styles.fine} aria-busy={loading}>
          Đang tải hướng dẫn chuyển khoản…
        </p>
      )}
    </section>
  );
}
