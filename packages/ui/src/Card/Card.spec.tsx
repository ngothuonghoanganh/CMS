import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Card } from './Card';

describe('Card', () => {
  it('renders a div by default with its children', () => {
    render(<Card data-testid="card">Địa chỉ live</Card>);
    const card = screen.getByTestId('card');
    expect(card.tagName).toBe('DIV');
    expect(card).toHaveTextContent('Địa chỉ live');
  });

  it('can be a labelled section landmark', () => {
    render(
      <Card as="section" aria-labelledby="activity-heading">
        <h2 id="activity-heading">Hoạt động xuất bản gần đây</h2>
      </Card>,
    );
    expect(screen.getByRole('region', { name: 'Hoạt động xuất bản gần đây' })).toBeInTheDocument();
  });
});
