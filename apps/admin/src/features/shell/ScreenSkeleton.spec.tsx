import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { EditorSkeleton, SiteScreenSkeleton } from './ScreenSkeleton';

describe('screen skeletons', () => {
  it('announces that a site screen is loading inside the site frame', () => {
    const { container } = render(<SiteScreenSkeleton />);
    expect(screen.getByRole('status')).toHaveTextContent('Đang tải trang…');
    expect(container.firstElementChild).toHaveAttribute('aria-busy', 'true');
    expect(screen.queryByRole('main')).not.toBeInTheDocument();
  });

  it('gives the loading editor its main landmark and a busy state', () => {
    render(<EditorSkeleton />);
    expect(screen.getByRole('main')).toHaveAttribute('aria-busy', 'true');
    expect(screen.getByRole('status')).toHaveTextContent('Đang tải trang…');
  });
});
