import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import NotFound from './not-found';

describe('admin not-found page', () => {
  it('explains the miss in Vietnamese and links back to the start', () => {
    render(<NotFound />);
    expect(screen.getByRole('heading', { level: 1, name: 'Không tìm thấy trang' })).toBeVisible();
    expect(screen.getByRole('main')).toHaveTextContent('không có quyền xem');
    expect(screen.getByRole('link', { name: 'Về trang chính' })).toHaveAttribute('href', '/');
  });
});
