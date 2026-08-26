'use client';

export function StatusBadge({ status, label }: { status: string; label?: string }) {
  const tone = status.toLowerCase().replaceAll(' ', '-');
  return (
    <span className={`status-badge status-${tone}`}>
      <span aria-hidden="true" className="status-badge-dot" />
      {label ?? status}
    </span>
  );
}
