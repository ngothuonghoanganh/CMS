import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Spinner } from './Spinner';

describe('Spinner', () => {
  it('announces its label as a status', () => {
    render(<Spinner label="Đang tải" />);
    expect(screen.getByRole('status')).toHaveTextContent('Đang tải');
  });

  it('is decorative without a label', () => {
    const { container } = render(<Spinner />);
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(container.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
  });
});
