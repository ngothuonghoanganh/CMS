import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { VisuallyHidden } from './VisuallyHidden';

describe('VisuallyHidden', () => {
  it('keeps text available to assistive technology', () => {
    render(
      <button type="button">
        <VisuallyHidden>Đóng</VisuallyHidden>
      </button>,
    );
    expect(screen.getByRole('button', { name: 'Đóng' })).toBeInTheDocument();
  });

  it('forwards native span props', () => {
    render(<VisuallyHidden id="legend-note">Mục tiêu của trang</VisuallyHidden>);
    expect(screen.getByText('Mục tiêu của trang')).toHaveAttribute('id', 'legend-note');
  });
});
