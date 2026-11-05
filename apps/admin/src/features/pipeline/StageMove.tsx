'use client';

import {
  endpoints,
  LOST_NOTE_MAX,
  type LostReason,
  lostReasonLabels,
  lostReasons,
  type MoveOpportunityRequest,
  type Opportunity,
  type OpportunityStage,
  opportunityStageLabels,
  vnDayOf,
} from '@plp/contracts';
import { Button, Callout, Dialog, Field, Input, useToast } from '@plp/ui';
import { useMutation } from '@tanstack/react-query';
import { type ReactNode, type SubmitEvent, useId, useState } from 'react';
import { ApiError, api } from '../../lib/api';
import { cx } from '../shell/cx';
import { problemMessage, reportUnexpected } from '../shell/problem-message';
import { formatVnd, parseVnd } from './pipeline-presentation';
import styles from './Pipeline.module.css';

/** The part of an opportunity a move needs. */
export type MovableOpportunity = Pick<Opportunity, 'id' | 'title' | 'stage' | 'value'> & {
  contactName: string;
};

/** "● Hẹn lịch" in the stage's colour (boards 10, 22, 23, 24). */
export function StageMark({ stage, children }: { stage: OpportunityStage; children?: ReactNode }) {
  return (
    <span className={cx(styles.stage, styles[`stage-${stage}`])}>
      <span aria-hidden="true" className={styles.dot} />
      {children ?? opportunityStageLabels[stage]}
    </span>
  );
}

interface Closing {
  opportunity: MovableOpportunity;
  stage: 'won' | 'lost';
}

export interface StageMoveOptions {
  siteId: string;
  /** The opportunity moved, or moved meanwhile: what shows it reads it again. */
  onMoved: (opportunity: Opportunity | null) => void;
}

/**
 * "Chuyển giai đoạn" everywhere it appears (ADR-033): an open stage moves at once, "Thắng" and
 * "Thua" ask first. A card moved meanwhile is said, and the screen reads it again.
 */
export function useStageMove({ siteId, onMoved }: StageMoveOptions) {
  const { toast } = useToast();
  const [closing, setClosing] = useState<Closing | null>(null);

  const move = useMutation({
    mutationFn: ({ id, body }: { id: string; body: MoveOpportunityRequest }) =>
      api(endpoints.moveOpportunity, [siteId, id], { body }),
    onSuccess: (moved) => {
      setClosing(null);
      toast({
        tone: 'success',
        title: `Đã chuyển “${moved.title}” sang ${opportunityStageLabels[moved.stage]}`,
      });
      onMoved(moved);
    },
    onError: (error) => {
      if (error instanceof ApiError && error.status === 409) {
        setClosing(null);
        toast({ tone: 'warning', title: problemMessage(error) });
        onMoved(null);
        return;
      }
      if (!(error instanceof ApiError && error.status === 422)) {
        reportUnexpected('Moving an opportunity failed', error);
      }
      if (closing === null) {
        toast({ tone: 'danger', title: 'Chưa chuyển được', description: problemMessage(error) });
      }
    },
  });

  function moveTo(opportunity: MovableOpportunity, stage: OpportunityStage) {
    if (stage === opportunity.stage || move.isPending) {
      return;
    }
    move.reset();
    if (stage === 'won' || stage === 'lost') {
      setClosing({ opportunity, stage });
      return;
    }
    move.mutate({ id: opportunity.id, body: { stage, from: opportunity.stage } });
  }

  const dialogs = (
    <>
      {closing?.stage === 'won' ? (
        <WonDialog
          opportunity={closing.opportunity}
          pending={move.isPending}
          error={move.isError ? problemMessage(move.error) : null}
          onCancel={() => {
            setClosing(null);
          }}
          onConfirm={(value, on) => {
            move.mutate({
              id: closing.opportunity.id,
              body: { stage: 'won', from: closing.opportunity.stage, value, on },
            });
          }}
        />
      ) : null}
      {closing?.stage === 'lost' ? (
        <LostDialog
          opportunity={closing.opportunity}
          pending={move.isPending}
          error={move.isError ? problemMessage(move.error) : null}
          onCancel={() => {
            setClosing(null);
          }}
          onConfirm={(reason, note) => {
            move.mutate({
              id: closing.opportunity.id,
              body: { stage: 'lost', from: closing.opportunity.stage, reason, note },
            });
          }}
        />
      ) : null}
    </>
  );

  return { moveTo, dialogs, pending: move.isPending };
}

interface ClosingDialogProps {
  opportunity: MovableOpportunity;
  pending: boolean;
  error: string | null;
  onCancel: () => void;
}

/** "Đánh dấu thắng": the actual value and the closing day. */
function WonDialog({
  opportunity,
  pending,
  error,
  onCancel,
  onConfirm,
}: ClosingDialogProps & { onConfirm: (value: number, on: string) => void }) {
  const formId = useId();
  const [value, setValue] = useState(
    opportunity.value === null ? '' : formatVnd(opportunity.value),
  );
  const [on, setOn] = useState(() => vnDayOf(new Date()));
  const [problem, setProblem] = useState<string | null>(null);

  function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    const amount = parseVnd(value);
    if (amount === null) {
      setProblem('Nhập giá trị thực tế');
      return;
    }
    onConfirm(amount, on);
  }

  return (
    <Dialog
      open
      onOpenChange={(next) => {
        if (!next && !pending) {
          onCancel();
        }
      }}
      title="Đánh dấu thắng"
      description={`${opportunity.title} · ${opportunity.contactName}`}
      footer={
        <>
          <Button variant="secondary" disabled={pending} onClick={onCancel}>
            Hủy
          </Button>
          <Button type="submit" form={formId} loading={pending}>
            Đánh dấu thắng
          </Button>
        </>
      }
    >
      <form id={formId} className={styles.dialogForm} noValidate onSubmit={submit}>
        <div className={styles.dialogPair}>
          <Field label="Giá trị thực tế" error={problem ?? undefined}>
            <Input
              inputMode="numeric"
              autoComplete="off"
              value={value}
              onChange={(event) => {
                setValue(event.target.value);
                setProblem(null);
              }}
              onBlur={() => {
                const amount = parseVnd(value);
                if (amount !== null) {
                  setValue(formatVnd(amount));
                }
              }}
            />
          </Field>
          <Field label="Ngày chốt">
            <Input
              type="date"
              value={on}
              onChange={(event) => {
                setOn(event.target.value);
              }}
            />
          </Field>
        </div>
        {opportunity.value === null ? null : (
          <p className={styles.dialogNote}>Dự kiến {formatVnd(opportunity.value)}.</p>
        )}
        {error === null ? null : (
          <Callout tone="danger" role="alert" title="Chưa đánh dấu được">
            {error}
          </Callout>
        )}
      </form>
    </Dialog>
  );
}

/** "Đánh dấu thua": a reason, and a note if useful. */
function LostDialog({
  opportunity,
  pending,
  error,
  onCancel,
  onConfirm,
}: ClosingDialogProps & { onConfirm: (reason: LostReason, note: string) => void }) {
  const formId = useId();
  const [reason, setReason] = useState<LostReason | null>(null);
  const [note, setNote] = useState('');
  const [problem, setProblem] = useState<string | null>(null);

  function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (reason === null) {
      setProblem('Chọn một lý do');
      return;
    }
    onConfirm(reason, note);
  }

  return (
    <Dialog
      open
      onOpenChange={(next) => {
        if (!next && !pending) {
          onCancel();
        }
      }}
      title="Đánh dấu thua"
      description={`${opportunity.title} · ${opportunity.contactName}`}
      footer={
        <>
          <Button variant="secondary" disabled={pending} onClick={onCancel}>
            Hủy
          </Button>
          <Button type="submit" form={formId} variant="ink" loading={pending}>
            Đánh dấu thua
          </Button>
        </>
      }
    >
      <form id={formId} className={styles.dialogForm} noValidate onSubmit={submit}>
        <fieldset
          className={styles.reasons}
          aria-describedby={problem ? `${formId}-problem` : undefined}
        >
          <legend>Lý do</legend>
          {lostReasons.map((item) => (
            <label key={item} className={styles.reason}>
              <input
                type="radio"
                name={`${formId}-reason`}
                checked={reason === item}
                onChange={() => {
                  setReason(item);
                  setProblem(null);
                }}
              />
              {lostReasonLabels[item]}
            </label>
          ))}
        </fieldset>
        {problem === null ? null : (
          <span id={`${formId}-problem`} role="alert" className={styles.nextLate}>
            {problem}
          </span>
        )}
        <Field label="Ghi chú" optional>
          <Input
            value={note}
            maxLength={LOST_NOTE_MAX}
            autoComplete="off"
            onChange={(event) => {
              setNote(event.target.value);
            }}
          />
        </Field>
        <p className={styles.dialogNote}>
          Khách hàng vẫn còn trong danh bạ. Công việc đang mở của cơ hội này sẽ được đóng.
        </p>
        {error === null ? null : (
          <Callout tone="danger" role="alert" title="Chưa đánh dấu được">
            {error}
          </Callout>
        )}
      </form>
    </Dialog>
  );
}
