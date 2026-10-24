import { pageStatusKindSchema, pageStatusLabels } from '@plp/contracts';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { LockIcon } from '../icons';
import { Badge } from './Badge';
import { StatusBadge } from './StatusBadge';

describe('Badge', () => {
  it('renders its text with a decorative dot and icon', () => {
    render(
      <Badge tone="success" dot icon={<LockIcon size={12} />}>
        Đã kết nối · HTTPS
      </Badge>,
    );
    const badge = screen.getByText('Đã kết nối · HTTPS');
    expect(badge).toHaveAttribute('data-tone', 'success');
    const decorations = badge.querySelectorAll(':scope > [aria-hidden="true"]');
    expect(decorations).toHaveLength(2);
    for (const decoration of decorations) {
      expect(decoration).toHaveTextContent('');
    }
  });

  it('defaults to the neutral tone', () => {
    render(<Badge>MẶC ĐỊNH · MIỄN PHÍ</Badge>);
    expect(screen.getByText('MẶC ĐỊNH · MIỄN PHÍ')).toHaveAttribute('data-tone', 'neutral');
  });
});

describe('StatusBadge', () => {
  it.each([
    ['live', 'success'],
    ['live_with_changes', 'warning'],
    ['draft', 'neutral'],
    ['unpublished', 'muted'],
  ] as const)('renders %s with the contract label and the %s tone', (status, tone) => {
    render(<StatusBadge status={status} />);
    const badge = screen.getByText(pageStatusLabels[status]);
    expect(badge).toHaveAttribute('data-tone', tone);
    expect(badge).toHaveAttribute('data-status', status);
  });

  it('covers every status kind of the contract', () => {
    for (const status of pageStatusKindSchema.options) {
      const { unmount } = render(<StatusBadge status={status} />);
      expect(screen.getByText(pageStatusLabels[status])).toBeInTheDocument();
      unmount();
    }
  });

  it('accepts a custom label', () => {
    render(
      <StatusBadge status="live_with_changes">Live v12 · 4 thay đổi chưa xuất bản</StatusBadge>,
    );
    expect(screen.getByText('Live v12 · 4 thay đổi chưa xuất bản')).toHaveAttribute(
      'data-tone',
      'warning',
    );
  });
});
