'use client';

import {
  type BillingSummary,
  type PaymentMethodResponse,
  type RenewalMethod,
  renewalMethodLabels,
} from '@plp/contracts';
import { Button, Callout, RadioCardGroup } from '@plp/ui';
import { useState } from 'react';
import { cardLabel } from './payment-presentation';
import { paymentProblemOf, paymentsMessage } from './payment-problem';
import { renewalMethodStatus } from './renewal-presentation';
import { useMethodSetup } from './use-method-setup';
import { useRenewalMethod } from './use-renewal-method';
import styles from './Payments.module.css';

export interface RenewalMethodChoiceProps {
  workspaceId: string;
  summary: Pick<BillingSummary, 'renewalMethod' | 'renewal'>;
  method: PaymentMethodResponse;
}

/**
 * "Gia hạn bằng" (board 29, ADR-035 T4): the saved card, charged when the period ends, or a bank
 * transfer of an invoice sent before it. The board draws no such choice, so it follows its card
 * list: radio cards of @plp/ui. Choosing the card without one that can pay does not ask the API:
 * it leads to "Thêm thẻ" (the API says the same with 422 `payment_method_required`). Allowed in a
 * read-only workspace, like paying.
 */
export function RenewalMethodChoice({ workspaceId, summary, method }: RenewalMethodChoiceProps) {
  const change = useRenewalMethod(workspaceId);
  const setup = useMethodSetup(workspaceId, 'payments');
  const [wantsCard, setWantsCard] = useState(false);
  const card = method.paymentMethod;
  const cardUsable = card !== null && !card.expired;
  const current = summary.renewalMethod;
  // Said aloud only in answer to a click; a card renewal that has no card says it quietly.
  const asked = wantsCard || paymentProblemOf(change.error)?.kind === 'card_required';
  const needsCard = asked || (current === 'card' && !cardUsable);
  const off = !method.paymentsEnabled || change.isPending;
  const status = renewalMethodStatus(summary.renewal);

  function choose(next: RenewalMethod) {
    change.reset();
    if (next === current) {
      setWantsCard(false);
      return;
    }
    if (next === 'card' && !cardUsable) {
      setWantsCard(true);
      return;
    }
    setWantsCard(false);
    change.mutate(next);
  }

  return (
    <div className={styles.renewal}>
      <RadioCardGroup<RenewalMethod>
        legend="Gia hạn bằng"
        showLegend
        options={[
          {
            value: 'card',
            disabled: off,
            label: renewalMethodLabels.card,
            description: cardUsable
              ? `Hệ thống tự trừ ${cardLabel(card)} khi hết mỗi kỳ.`
              : 'Hệ thống tự trừ thẻ đã lưu khi hết mỗi kỳ. Chưa có thẻ dùng được.',
          },
          {
            value: 'transfer',
            disabled: off,
            label: renewalMethodLabels.transfer,
            description:
              'Hóa đơn kèm mã QR gửi qua email trước ngày cuối kỳ. Chuyển khoản trước ngày cuối kỳ; trả sớm không mất ngày nào.',
          },
        ]}
        value={change.isPending ? change.variables : current}
        onChange={choose}
        minColumnWidth={200}
        fillRow
      />
      {needsCard ? (
        <Callout
          tone="warning"
          {...(asked ? { role: 'status' } : {})}
          title="Cần thêm thẻ để gia hạn bằng thẻ"
          action={
            <Button variant="secondary" size="sm" loading={setup.busy} onClick={setup.start}>
              Thêm thẻ
            </Button>
          }
        >
          {card === null ? 'Chưa có thẻ dùng được.' : 'Thẻ đã lưu đã hết hạn.'} Thêm thẻ rồi chọn
          lại, hoặc gia hạn bằng chuyển khoản.
        </Callout>
      ) : null}
      {setup.error === null ? null : (
        <Callout tone="danger" role="alert" title="Chưa mở được trang của cổng thanh toán">
          {paymentsMessage(setup.error)}
        </Callout>
      )}
      {status === null ? null : (
        <p className={styles.fine} role="status">
          {status}
        </p>
      )}
    </div>
  );
}
