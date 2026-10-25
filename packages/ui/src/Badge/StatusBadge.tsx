import { type PageStatusKind, pageStatusLabels } from '@plp/contracts';
import type { ReactNode } from 'react';
import { Badge, type BadgeSize, type BadgeTone } from './Badge';

const statusTones: Record<PageStatusKind, BadgeTone> = {
  live: 'success',
  live_with_changes: 'warning',
  draft: 'neutral',
  unpublished: 'muted',
};

export interface StatusBadgeProps {
  status: PageStatusKind;
  /** Replaces the default label, e.g. "Live v12 · 4 thay đổi chưa xuất bản" in the editor. */
  children?: ReactNode;
  size?: BadgeSize | undefined;
  className?: string | undefined;
}

/** Page status with the board colors: Live, "Live · Có thay đổi", "Bản nháp", "Đã gỡ". */
export function StatusBadge({ status, children, size, className }: StatusBadgeProps) {
  return (
    <Badge tone={statusTones[status]} dot size={size} className={className} data-status={status}>
      {children ?? pageStatusLabels[status]}
    </Badge>
  );
}
