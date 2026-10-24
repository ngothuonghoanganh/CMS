import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Checkbox } from './Checkbox';

describe('Checkbox', () => {
  it('is a native checkbox named by its label and toggled by clicking the label', async () => {
    const onChange = vi.fn();
    render(<Checkbox label="Ảnh chỉ để trang trí" onChange={onChange} />);
    const box = screen.getByRole('checkbox', { name: 'Ảnh chỉ để trang trí' });
    expect(box).not.toBeChecked();
    await userEvent.click(screen.getByText('Ảnh chỉ để trang trí'));
    expect(box).toBeChecked();
    await userEvent.keyboard(' ');
    expect(box).not.toBeChecked();
    expect(onChange).toHaveBeenCalledTimes(2);
  });

  it('wires the description and disabled state', () => {
    render(
      <Checkbox
        label="Trang trí"
        description="Trình đọc màn hình sẽ bỏ qua ảnh này."
        defaultChecked
        disabled
      />,
    );
    const box = screen.getByRole('checkbox', { name: 'Trang trí' });
    expect(box).toBeChecked();
    expect(box).toBeDisabled();
    expect(box).toHaveAccessibleDescription('Trình đọc màn hình sẽ bỏ qua ảnh này.');
  });
});
