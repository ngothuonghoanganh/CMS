'use client';

import {
  endpoints,
  type MarketplaceItemDetail,
  type MarketplaceLicence,
  type MethodSetupResult,
  paymentDeclineLabels,
} from '@plp/contracts';
import { Button, ButtonLink, Callout, Checkbox, Dialog, Spinner } from '@plp/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { type RefObject, useEffect, useRef, useState } from 'react';
import { api, ApiError } from '../../lib/api';
import { formatVnd } from '../../lib/format';
import { billingQueryKeys } from '../billing/queries';
import { MethodSetupNotice } from '../billing/MethodSetupNotice';
import { cardLabel } from '../billing/payment-presentation';
import { paymentProblemOf } from '../billing/payment-problem';
import { useWorkspacePlan } from '../billing/plan-context';
import { readOnlyReason } from '../billing/plan-presentation';
import { planProblemOf } from '../billing/plan-problem';
import { planActionLabel, PlanMark } from '../billing/PlanProblemAction';
import { answerLost } from '../billing/use-pay-invoice';
import { useMethodSetup } from '../billing/use-method-setup';
import { marketplaceOwnedHref, paymentsHref, templateHref } from '../shell/navigation';
import { problemMessage, reportUnexpected } from '../shell/problem-message';
import { templateQueryKeys } from '../templates/queries';
import { DialogFailure } from './DialogFailure';
import { LicenceTerms } from './LicenceTerms';
import styles from './ClaimDialog.module.css';

export interface PurchaseDialogProps {
  workspaceId: string;
  item: Pick<MarketplaceItemDetail, 'id' | 'name' | 'version' | 'terms'>;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** What the gateway did with a card that was added or changed from this dialog, if anything. */
  returned: MethodSetupResult | null;
  /** The licence is granted (200): the screen reads the item again and shows it owned. */
  onPurchased: () => void;
  /**
   * The item is not what the owner saw (409 `item_changed`, or a quote of another version), is
   * free now, or is owned already: the screen reads the item again. `message` is for the box.
   */
  onChanged: (message: string) => void;
  /** Where focus goes once "Mua mẫu" is gone, the workspace owning the item. */
  fallbackFocusRef?: RefObject<HTMLElement | null> | undefined;
}

/** What the dialog shows after the owner confirmed; `confirm` is the question itself. */
type Phase =
  | { kind: 'confirm' }
  | { kind: 'paid' }
  | { kind: 'pending' }
  | { kind: 'declined'; message: string; invoiceId: string | null }
  | { kind: 'unknown' }
  /**
   * Another charge holds the workspace; `invoiceNumber` names its invoice when the gateway decides
   * it or its outcome is unknown, and is null for a charge that merely holds the workspace now.
   */
  | { kind: 'in_progress'; message: string; invoiceNumber: string | null };

type Attempt = { kind: 'buy' } | { kind: 'retry'; invoiceId: string };

const BUY_KEY = 'buy';

/**
 * "Xác nhận mua mẫu" (board 31, ADR-036): what the owner pays, with which card, under which terms,
 * from the quote the API gives now. The charge uses the saved card through the payment gateway;
 * the answer shows in this dialog, which cannot be dismissed while the gateway is asked. No
 * polling: a charge still being decided (202) is followed on board 29. The screen gives it a new
 * `key` for every opening, so the box is never ticked from an earlier one and a new attempt gets a
 * new `Idempotency-Key`.
 */
export function PurchaseDialog({
  workspaceId,
  item,
  open,
  onOpenChange,
  returned,
  onPurchased,
  onChanged,
  fallbackFocusRef,
}: PurchaseDialogProps) {
  const queryClient = useQueryClient();
  const frame = useWorkspacePlan();
  const setup = useMethodSetup(workspaceId, 'marketplace', item.id);
  const [agreed, setAgreed] = useState(false);
  const [phase, setPhase] = useState<Phase>({ kind: 'confirm' });
  const [failure, setFailure] = useState<unknown>(null);
  // The notice of the card is said once; "Đổi" or paying again clears it.
  const [notice, setNotice] = useState(returned);
  // `isPending` turns true a tick after `mutate`: a double click would buy twice before it.
  const sending = useRef(false);
  // The key of an attempt whose answer was never seen (or not yet decided): sent again as it was,
  // so the API answers the same invoice instead of charging again.
  const keys = useRef(new Map<string, string>());

  const quote = useQuery({
    queryKey: ['workspaces', workspaceId, 'marketplace', 'quote', item.id],
    queryFn: ({ signal }) => api(endpoints.getMarketplaceQuote, [workspaceId, item.id], { signal }),
    enabled: open,
    // Prices and cards move: every opening asks again.
    staleTime: 0,
    gcTime: 0,
  });
  const quoted = quote.data;

  // A quote of another version or terms than the page: what was read is not what would be bought.
  const stale =
    quoted !== undefined &&
    (quoted.version !== item.version || quoted.termsVersion !== item.terms.version);
  const owned = quoted?.owned === true;
  useEffect(() => {
    // Nothing to ask of an item the workspace holds already, or that is not the one on the page.
    // Not once the owner bought it here: the dialog then says so.
    if (!open || phase.kind !== 'confirm' || (!owned && !stale)) {
      return;
    }
    onOpenChange(false);
    onChanged(
      owned
        ? `Workspace đã sở hữu “${item.name}”. Đã tải lại trang.`
        : `Mẫu “${item.name}” vừa thay đổi. Đã tải lại; xem lại mẫu và điều khoản rồi mua lại.`,
    );
  }, [open, phase.kind, owned, stale, item.name, onOpenChange, onChanged]);

  function refreshAfterCharge() {
    // A charge, whatever its answer, moves the invoices and the card's state; a licence lists the
    // item in the library and the editor.
    void queryClient.invalidateQueries({ queryKey: billingQueryKeys.all(workspaceId) });
    void queryClient.invalidateQueries({ queryKey: templateQueryKeys.all(workspaceId) });
  }

  const run = useMutation({
    mutationFn: async (
      attempt: Attempt,
    ): Promise<{ licence: MarketplaceLicence | null; status: number }> => {
      if (quoted === undefined) {
        throw new Error('The quote is not read yet');
      }
      const id = attempt.kind === 'buy' ? BUY_KEY : attempt.invoiceId;
      const key = keys.current.get(id) ?? crypto.randomUUID();
      keys.current.set(id, key);
      let status = 200;
      try {
        const onStatus = (value: number) => {
          status = value;
        };
        if (attempt.kind === 'buy') {
          const result = await api(endpoints.purchaseMarketplaceItem, [workspaceId], {
            body: {
              itemId: item.id,
              version: quoted.version,
              expectedAmount: quoted.amount,
              termsVersion: quoted.termsVersion,
            },
            headers: { 'Idempotency-Key': key },
            onStatus,
          });
          keys.current.delete(id);
          return { licence: result.licence, status };
        }
        await api(endpoints.payInvoice, [workspaceId, attempt.invoiceId], {
          headers: { 'Idempotency-Key': key },
          onStatus,
        });
        keys.current.delete(id);
        return { licence: null, status };
      } catch (error) {
        if (!answerLost(error)) {
          keys.current.delete(id);
        }
        throw error;
      }
    },
    onSuccess: ({ status }) => {
      refreshAfterCharge();
      if (status === 202) {
        setPhase({ kind: 'pending' });
        return;
      }
      setPhase({ kind: 'paid' });
      onPurchased();
    },
    onError: (error) => {
      refreshAfterCharge();
      if (error instanceof ApiError && error.code === 'item_changed') {
        onOpenChange(false);
        onChanged(
          `Mẫu “${item.name}” vừa thay đổi. Đã tải lại; xem lại mẫu và điều khoản rồi mua lại.`,
        );
        return;
      }
      if (
        error instanceof ApiError &&
        (error.code === 'item_owned' || error.code === 'item_free')
      ) {
        onOpenChange(false);
        onChanged(
          error.code === 'item_owned'
            ? `Workspace đã sở hữu “${item.name}”. Đã tải lại trang.`
            : `Mẫu “${item.name}” đã miễn phí. Đã tải lại trang.`,
        );
        return;
      }
      if (error instanceof ApiError && error.code === 'payment_not_applied') {
        // Paid, but the workspace held the item already: it is owned, and the money goes back.
        onOpenChange(false);
        onChanged(`${problemMessage(error)} Đã tải lại trang.`);
        return;
      }
      const problem = paymentProblemOf(error);
      if (problem?.kind === 'declined') {
        const why =
          problem.code === null
            ? 'Thanh toán không thành công'
            : paymentDeclineLabels[problem.code];
        const card = quoted?.paymentMethod ?? null;
        const context = error instanceof ApiError ? error.problem.context : null;
        const invoiceId =
          typeof context === 'object' &&
          context !== null &&
          'invoiceId' in context &&
          typeof context.invoiceId === 'string'
            ? context.invoiceId
            : null;
        setPhase({
          kind: 'declined',
          message: `${why}${card === null ? '' : ` (${cardLabel(card)})`}. Bạn chưa bị trừ tiền và chưa sở hữu mẫu.`,
          invoiceId,
        });
        return;
      }
      if (problem?.kind === 'unknown_outcome') {
        setPhase({ kind: 'unknown' });
        return;
      }
      if (problem?.kind === 'in_progress') {
        setPhase({
          kind: 'in_progress',
          message:
            problem.invoiceNumber === null
              ? 'Một khoản thanh toán của workspace đang được xử lý. Chờ kết quả rồi thử lại.'
              : `Hóa đơn ${problem.invoiceNumber} chưa có kết quả. Xem nó ở Thanh toán & hóa đơn rồi mua lại.`,
          invoiceNumber: problem.invoiceNumber,
        });
        return;
      }
      if (problem?.kind === 'card_required' || problem?.kind === 'disabled') {
        // The quote said otherwise a moment ago: read it again, it now shows the right box.
        void quote.refetch();
      }
      if (!(error instanceof ApiError) || error.status >= 500) {
        reportUnexpected('Buying a marketplace item failed', error);
      }
      setFailure(error);
    },
    onSettled: () => {
      sending.current = false;
    },
  });

  function start(attempt: Attempt) {
    if (sending.current) {
      return;
    }
    sending.current = true;
    setFailure(null);
    setNotice(null);
    run.mutate(attempt);
  }

  const busy = run.isPending;
  const card = quoted?.paymentMethod ?? null;
  const total = quoted === undefined ? null : formatVnd(quoted.amount);
  const title = busy
    ? 'Đang thanh toán…'
    : phase.kind === 'paid'
      ? `Đã mua “${item.name}”`
      : phase.kind === 'declined'
        ? 'Thanh toán chưa thành công'
        : phase.kind === 'pending'
          ? 'Đang chờ cổng thanh toán'
          : phase.kind === 'unknown' ||
              (phase.kind === 'in_progress' && phase.invoiceNumber !== null)
            ? 'Chưa rõ kết quả thanh toán'
            : phase.kind === 'in_progress'
              ? 'Đang có một thanh toán chưa xong'
              : 'Xác nhận mua mẫu';
  const confirming = phase.kind === 'confirm' || busy;
  // A read-only workspace pays its plan first (ADR-036): the dialog says so before the owner ticks
  // the terms, and nothing in it pays, as after the API's 402 when the plan changed meanwhile.
  const readOnlyState = frame?.plan.access === 'read_only' ? frame.plan.state : null;
  const refusedReadOnly = planProblemOf(failure)?.kind === 'read_only';
  const readOnly = readOnlyState !== null || refusedReadOnly;
  const canPay =
    quoted !== undefined && quoted.paymentsEnabled && !quoted.paymentMethodRequired && !readOnly;

  const close = (
    <Button
      variant="secondary"
      onClick={() => {
        onOpenChange(false);
      }}
    >
      {phase.kind === 'confirm' ? 'Hủy' : 'Đóng'}
    </Button>
  );

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        // The charge being asked cannot be dismissed: its answer shows here.
        if (!next && busy) {
          return;
        }
        onOpenChange(next);
      }}
      dismissible={!busy}
      title={title}
      fallbackFocusRef={fallbackFocusRef}
      description={confirming ? 'Mua một lần, dùng cho mọi site trong workspace.' : undefined}
      footer={
        confirming ? (
          <>
            <Button
              variant="secondary"
              disabled={busy}
              onClick={() => {
                onOpenChange(false);
              }}
            >
              Hủy
            </Button>
            {quoted === undefined ||
            !quoted.paymentsEnabled ? null : quoted.paymentMethodRequired ? (
              <Button loading={setup.busy} disabled={readOnly} onClick={setup.start}>
                Thêm thẻ
              </Button>
            ) : (
              <Button
                disabled={!agreed || !canPay}
                loading={busy}
                onClick={() => {
                  start({ kind: 'buy' });
                }}
              >
                Thanh toán {total}
              </Button>
            )}
          </>
        ) : phase.kind === 'paid' ? (
          <>
            <ButtonLink as={Link} href={marketplaceOwnedHref(workspaceId)} variant="secondary">
              Sản phẩm đã mua
            </ButtonLink>
            <ButtonLink as={Link} href={templateHref(workspaceId, item.id)}>
              Tạo trang từ mẫu
            </ButtonLink>
          </>
        ) : phase.kind === 'declined' ? (
          <>
            <Button loading={setup.busy} variant="secondary" onClick={setup.start}>
              Đổi phương thức
            </Button>
            <Button
              onClick={() => {
                if (phase.invoiceId === null) {
                  setPhase({ kind: 'confirm' });
                  return;
                }
                start({ kind: 'retry', invoiceId: phase.invoiceId });
              }}
            >
              Thử lại
            </Button>
          </>
        ) : (
          close
        )
      }
    >
      <div className={styles.body}>
        {confirming ? (
          <>
            <dl className={styles.sum}>
              <dt>
                {item.name} · v{item.version}
              </dt>
              <dd>{total ?? '…'}</dd>
              <dt className={styles.sumMuted}>Thuế</dt>
              <dd className={styles.sumMuted}>Đã gồm VAT</dd>
              <dt className={styles.sumTotal}>Tổng</dt>
              <dd className={styles.sumTotal}>{total ?? '…'}</dd>
            </dl>
            {readOnlyState === null || refusedReadOnly ? null : (
              <Callout tone="warning" role="status" title="Workspace đang ở chế độ chỉ đọc">
                {readOnlyReason(readOnlyState)} Thanh toán gói để mở lại workspace, rồi mua mẫu.{' '}
                <PlanMark label={planActionLabel('read_only')} workspaceId={workspaceId} />
              </Callout>
            )}
            {quote.isError ? (
              <>
                <DialogFailure error={quote.error} workspaceId={workspaceId} />
                <Button
                  variant="secondary"
                  size="sm"
                  loading={quote.isFetching}
                  onClick={() => {
                    void quote.refetch();
                  }}
                >
                  Tải lại
                </Button>
              </>
            ) : null}
            {quoted === undefined ? (
              quote.isError ? null : (
                <p className={styles.waiting} role="status">
                  Đang tính số tiền…
                </p>
              )
            ) : !quoted.paymentsEnabled ? (
              <Callout tone="warning" role="status" title="Thanh toán chưa được bật">
                Hệ thống này chưa nhận thanh toán, nên chưa mua được mẫu trả phí.
              </Callout>
            ) : (
              <>
                <MethodSetupNotice
                  notice={notice}
                  method={quoted.paymentMethod}
                  error={null}
                  reloading={quote.isFetching}
                  onReload={() => {
                    void quote.refetch();
                  }}
                  next="Tích vào ô điều khoản rồi thanh toán."
                />
                {quoted.paymentMethodRequired ? (
                  <p className={styles.line}>
                    {card === null ? 'Chưa có thẻ dùng được.' : 'Thẻ đã lưu đã hết hạn.'} Thêm thẻ
                    để thanh toán.
                  </p>
                ) : card === null ? null : (
                  <p className={styles.line}>
                    Thanh toán bằng <strong>{cardLabel(card)}</strong> ·{' '}
                    <Button
                      variant="ghost"
                      size="sm"
                      loading={setup.busy}
                      disabled={busy}
                      onClick={setup.start}
                    >
                      Đổi
                    </Button>
                  </p>
                )}
                {quoted.billingCompanyName === null ? null : (
                  <p className={styles.lineMuted}>Biên nhận ghi tên {quoted.billingCompanyName}.</p>
                )}
                <LicenceTerms terms={item.terms} />
                <Checkbox
                  checked={agreed}
                  disabled={busy}
                  onChange={(event) => {
                    setAgreed(event.target.checked);
                  }}
                  label="Tôi đồng ý với điều khoản giấy phép"
                />
              </>
            )}
            {setup.error === null ? null : (
              <Callout tone="danger" role="alert" title="Chưa mở được trang của cổng thanh toán">
                Thử lại sau ít phút.
              </Callout>
            )}
          </>
        ) : null}

        {/*
         * One live region for the whole dialog, there before its words: the wait (the board's own
         * words), then what came of it. A region that mounts with its text may not be announced.
         */}
        <div role="status" aria-live="polite" className={styles.statuses}>
          {busy ? (
            <p className={styles.waiting}>
              <Spinner size={18} />
              Đang chờ cổng thanh toán xác nhận…
            </p>
          ) : phase.kind === 'paid' ? (
            <p className={styles.line}>
              Mẫu đã có trong Templates của workspace, dùng được cho mọi site. Biên nhận gửi tới Chủ
              sở hữu và có ở <Link href={paymentsHref(workspaceId)}>Thanh toán & hóa đơn</Link>.
            </p>
          ) : phase.kind === 'pending' ? (
            <Callout tone="info" title="Đang xử lý thanh toán">
              Mẫu sẽ có trong workspace khi cổng xác nhận. Bạn xem kết quả ở{' '}
              <Link href={paymentsHref(workspaceId)}>Thanh toán & hóa đơn</Link>.
            </Callout>
          ) : null}
        </div>
        {phase.kind === 'declined' ? (
          <Callout tone="danger" role="alert">
            {phase.message}
          </Callout>
        ) : null}
        {phase.kind === 'unknown' ? (
          <Callout tone="warning" role="alert" title="Chưa rõ kết quả">
            Chưa rõ kết quả. Đừng mua lại: “Thanh toán lại” ở{' '}
            <Link href={paymentsHref(workspaceId)}>Thanh toán & hóa đơn</Link> hỏi lại cổng.
          </Callout>
        ) : null}
        {phase.kind === 'in_progress' ? (
          <Callout
            tone="warning"
            role="alert"
            // The dialog's title says it already when no charge of an invoice is named.
            title={phase.invoiceNumber === null ? undefined : 'Đang có một thanh toán chưa xong'}
          >
            {phase.message} <Link href={paymentsHref(workspaceId)}>Thanh toán & hóa đơn</Link>
          </Callout>
        ) : null}
        {confirming || phase.kind === 'declined' ? (
          <DialogFailure error={failure} workspaceId={workspaceId} />
        ) : null}
      </div>
    </Dialog>
  );
}
