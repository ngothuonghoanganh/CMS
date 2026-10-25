'use client';

import {
  formatLeadPhone,
  type LeadListItem,
  leadSourceLabel,
  leadStatusLabels,
} from '@plp/contracts';
import { AlertCircleIcon, Badge } from '@plp/ui';
import type { MouseEvent } from 'react';
import { formatDateTime } from '../../lib/format';
import { cx } from '../shell/cx';
import { leadStatusTones, leadTimeLabel } from './lead-presentation';
import styles from './LeadInbox.module.css';

export interface LeadTableProps {
  leads: readonly LeadListItem[];
  selectedId: string | null;
  now: number;
  /** Address of a lead's detail, so it opens in a new tab too. */
  hrefOf: (leadId: string) => string;
  onSelect: (leadId: string) => void;
}

/** The lead list of board 10: who, phone, source, when and status. */
export function LeadTable({ leads, selectedId, now, hrefOf, onSelect }: LeadTableProps) {
  return (
    <table className={styles.table}>
      <thead>
        <tr>
          <th scope="col">LEAD</th>
          <th scope="col">ĐIỆN THOẠI</th>
          <th scope="col">NGUỒN</th>
          <th scope="col">LÚC</th>
          <th scope="col">TRẠNG THÁI</th>
        </tr>
      </thead>
      <tbody>
        {leads.map((lead) => {
          const selected = lead.id === selectedId;
          return (
            <tr key={lead.id} className={cx(selected && styles.selectedRow)}>
              <td>
                <div className={styles.leadCell}>
                  <span className={styles.leadNameRow}>
                    <a
                      href={hrefOf(lead.id)}
                      aria-current={selected ? 'true' : undefined}
                      className={styles.leadName}
                      onClick={(event: MouseEvent<HTMLAnchorElement>) => {
                        // A plain click shows the lead beside the list; a modified click opens a tab.
                        if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
                          return;
                        }
                        event.preventDefault();
                        onSelect(lead.id);
                      }}
                    >
                      {lead.name}
                    </a>
                    {lead.notificationFailed ? (
                      <span className={styles.syncError}>
                        <AlertCircleIcon size={13} strokeWidth={2} />
                        Lỗi đồng bộ
                      </span>
                    ) : null}
                  </span>
                  <span className={styles.sub}>{lead.page.title}</span>
                </div>
              </td>
              <td className={styles.phone}>{formatLeadPhone(lead.phone)}</td>
              <td className={styles.source}>{leadSourceLabel(lead.source)}</td>
              <td className={styles.time}>
                <time dateTime={lead.createdAt} title={formatDateTime(lead.createdAt)}>
                  {leadTimeLabel(lead.createdAt, now)}
                </time>
              </td>
              <td>
                <Badge tone={leadStatusTones[lead.status]}>{leadStatusLabels[lead.status]}</Badge>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
