import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import OwnedItemsLoading from './loading';

describe('board 32 while it loads', () => {
  it('draws a list of rows, not the catalog it is reached from', () => {
    render(<OwnedItemsLoading />);
    expect(screen.getByRole('status')).toHaveTextContent('Đang tải trang…');
    expect(screen.queryByText('Đang tải mẫu…')).toBeNull();
  });
});
