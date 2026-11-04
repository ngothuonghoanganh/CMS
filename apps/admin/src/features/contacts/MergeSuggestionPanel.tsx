'use client';

import {
  endpoints,
  formatLeadPhone,
  type MergeContactsRequest,
  type MergeField,
  mergeFieldLabels,
  mergeFields,
  type MergeSide,
  type MergeSideChoice,
  type MergeSuggestion,
} from '@plp/contracts';
import { Button, Callout, EmptyState, UsersIcon, useToast } from '@plp/ui';
import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { api } from '../../lib/api';
import { formatDayMonth } from '../../lib/format';
import { problemMessage, reportUnexpected } from '../shell/problem-message';
import { mergeReasonLabel } from './contact-presentation';
import styles from './Contacts.module.css';

type Picks = MergeContactsRequest['picks'];

/** What a side shows for a field; null when it has nothing there. */
function valueOf(side: MergeSide, field: MergeField): string | null {
  switch (field) {
    case 'name':
      return side.name;
    case 'phone':
      return side.phone === null ? null : formatLeadPhone(side.phone);
    case 'email':
      return side.email;
    case 'owner':
      return side.owner?.name ?? null;
    case 'marketing':
      return side.marketingAt === null ? null : `Đồng ý · ${formatDayMonth(side.marketingAt)}`;
  }
}

function emptyLabel(field: MergeField): string {
  switch (field) {
    case 'owner':
      return 'Chưa giao';
    case 'marketing':
      return 'Không đồng ý';
    default:
      return '—';
  }
}

/** The kept profile's value, unless only the other one has something there. */
export function defaultPicks(pair: Pick<MergeSuggestion, 'a' | 'b'>): Picks {
  const pick = (field: MergeField): MergeSideChoice =>
    valueOf(pair.a, field) === null && valueOf(pair.b, field) !== null ? 'b' : 'a';
  return {
    name: pick('name'),
    phone: pick('phone'),
    email: pick('email'),
    owner: pick('owner'),
    marketing: pick('marketing'),
  };
}

export interface MergeSuggestionPanelProps {
  siteId: string;
  pairs: readonly MergeSuggestion[];
  total: number;
  canHandle: boolean;
  /** A pair was merged or dismissed: the list and the counts load again. */
  onDone: () => void;
}

/**
 * "Có thể trùng" (board 22, ADR-033): one pair at a time, field by field. "Gộp hai hồ sơ" keeps the
 * older profile; "Không phải cùng người" never suggests the pair again.
 */
export function MergeSuggestionPanel({
  siteId,
  pairs,
  total,
  canHandle,
  onDone,
}: MergeSuggestionPanelProps) {
  const { toast } = useToast();
  const pair = pairs[0];
  const [picked, setPicked] = useState<{ id: string; picks: Picks } | null>(null);
  const picks =
    pair === undefined ? null : picked?.id === pair.id ? picked.picks : defaultPicks(pair);

  const merge = useMutation({
    mutationFn: (input: { id: string; picks: Picks }) =>
      api(endpoints.mergeContacts, [siteId, input.id], { body: { picks: input.picks } }),
    onSuccess: (result) => {
      toast({ tone: 'success', title: `Đã gộp vào hồ sơ ${result.contact.name}` });
      onDone();
    },
    onError: (error) => {
      reportUnexpected('Merging contacts failed', error);
    },
  });
  const dismiss = useMutation({
    mutationFn: (id: string) => api(endpoints.dismissMergeSuggestion, [siteId, id]),
    onSuccess: () => {
      toast({ tone: 'success', title: 'Đã giữ hai hồ sơ riêng' });
      onDone();
    },
    onError: (error) => {
      reportUnexpected('Dismissing a merge suggestion failed', error);
    },
  });

  if (pair === undefined || picks === null) {
    return (
      <EmptyState
        icon={<UsersIcon size={24} />}
        title="Không có hồ sơ nào có thể trùng"
        description="Khi hai hồ sơ có cùng email, hoặc cùng tên và cùng đăng ký một trang trong 7 ngày, chúng hiện ở đây để bạn gộp."
      />
    );
  }

  const leads = pair.a.leadCount + pair.b.leadCount;
  const failed = merge.error ?? dismiss.error;
  return (
    <section aria-labelledby="merge-title" className={styles.mergePanel}>
      <div className={styles.mergeHead}>
        <h2 id="merge-title" className={styles.mergeTitle}>
          Cặp 1/{total} · có thể là cùng một người
        </h2>
        <span className={styles.mergeReason}>{mergeReasonLabel(pair.reason)}</span>
      </div>
      <div className={styles.compareScroll}>
        <table className={styles.compare}>
          <thead>
            <tr>
              <th scope="col">TRƯỜNG</th>
              <th scope="col">HỒ SƠ A · {pair.a.leadCount} lead</th>
              <th scope="col">HỒ SƠ B · {pair.b.leadCount} lead</th>
            </tr>
          </thead>
          <tbody>
            {mergeFields.map((field) => (
              <tr key={field}>
                <th scope="row">{mergeFieldLabels[field]}</th>
                {(['a', 'b'] as const).map((side) => (
                  <td key={side} className={picks[field] === side ? styles.pickedCell : undefined}>
                    <label className={styles.pickLabel}>
                      <input
                        type="radio"
                        name={`${pair.id}-${field}`}
                        checked={picks[field] === side}
                        disabled={!canHandle}
                        onChange={() => {
                          setPicked({ id: pair.id, picks: { ...picks, [field]: side } });
                        }}
                      />
                      {valueOf(pair[side], field) ?? emptyLabel(field)}
                    </label>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className={styles.mergeNote}>
        Gộp gom {leads} lead và ghi chú vào một hồ sơ. Lead và bằng chứng đồng ý của từng lần gửi
        form giữ nguyên.
      </p>
      {failed === null ? null : (
        <Callout tone="danger" role="alert" title="Chưa xử lý được cặp hồ sơ này">
          {problemMessage(failed)}
        </Callout>
      )}
      {canHandle ? (
        <div className={styles.mergeActions}>
          <Button
            variant="secondary"
            loading={dismiss.isPending}
            disabled={merge.isPending}
            onClick={() => {
              dismiss.mutate(pair.id);
            }}
          >
            Không phải cùng người
          </Button>
          <Button
            loading={merge.isPending}
            disabled={dismiss.isPending}
            onClick={() => {
              merge.mutate({ id: pair.id, picks });
            }}
          >
            Gộp hai hồ sơ
          </Button>
        </div>
      ) : null}
    </section>
  );
}
