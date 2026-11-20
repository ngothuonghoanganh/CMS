'use client';

import type { MethodSetupResult, PaymentMethodView } from '@plp/contracts';
import { Button, Callout } from '@plp/ui';
import { cardLabel } from './payment-presentation';
import { paymentsMessage } from './payment-problem';

export interface MethodSetupNoticeProps {
  /** `?paymentMethod=` of the address the gateway led back to; null once dismissed. */
  notice: MethodSetupResult | null;
  /** The saved card as last read; undefined while it is read for the first time. */
  method: PaymentMethodView | null | undefined;
  /** Why the card could not be read; null otherwise. */
  error: Error | null;
  reloading: boolean;
  onReload: () => void;
  /** What to do with the saved card next, after the sentence that names it. */
  next?: string;
}

/**
 * What the gateway did, once the browser is back (boards 28 and 29). "Đã lưu thẻ" only when the
 * saved card says so: the address alone may be typed by hand, or the gateway's event may still be
 * on its way, which one manual read settles (no polling).
 */
export function MethodSetupNotice({
  notice,
  method,
  error,
  reloading,
  onReload,
  next,
}: MethodSetupNoticeProps) {
  if (notice === 'canceled') {
    return (
      <Callout tone="info" role="status" title="Chưa thêm thẻ">
        Bạn đã rời trang của cổng thanh toán, nên thẻ chưa được lưu.
      </Callout>
    );
  }
  if (notice !== 'saved') {
    return null;
  }
  const reload = (
    <Button variant="secondary" size="sm" loading={reloading} onClick={onReload}>
      Tải lại
    </Button>
  );
  if (error !== null) {
    return (
      <Callout tone="warning" role="alert" title="Chưa kiểm tra được thẻ vừa thêm" action={reload}>
        {paymentsMessage(error)}
      </Callout>
    );
  }
  if (method === undefined) {
    return null;
  }
  if (method === null) {
    return (
      <Callout
        tone="warning"
        role="status"
        title="Đang chờ cổng thanh toán xác nhận thẻ"
        action={reload}
      >
        Thẻ sẽ hiện ở đây khi cổng thanh toán báo về. Bạn chưa bị tính phí.
      </Callout>
    );
  }
  return (
    <Callout tone="success" role="status" title="Đã lưu thẻ">
      {cardLabel(method)} là phương thức thanh toán mặc định.{next === undefined ? '' : ` ${next}`}
    </Callout>
  );
}
