import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { FileIcon } from '../icons';
import { EmptyState } from './EmptyState';

describe('EmptyState', () => {
  it('renders a heading, text and the next step', () => {
    render(
      <EmptyState
        icon={<FileIcon />}
        title="Chưa có trang nào"
        description="Tạo trang đầu tiên theo mục tiêu của bạn."
        action={<a href="/new">Tạo trang</a>}
      />,
    );
    expect(screen.getByRole('heading', { level: 2, name: 'Chưa có trang nào' })).toBeVisible();
    expect(screen.getByText('Tạo trang đầu tiên theo mục tiêu của bạn.')).toBeVisible();
    expect(screen.getByRole('link', { name: 'Tạo trang' })).toBeInTheDocument();
  });

  it('supports a level-3 heading', () => {
    render(<EmptyState title="Không tìm thấy trang" headingLevel={3} />);
    expect(screen.getByRole('heading', { level: 3, name: 'Không tìm thấy trang' })).toBeVisible();
  });
});
