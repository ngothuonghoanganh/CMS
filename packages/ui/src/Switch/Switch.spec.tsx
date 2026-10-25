import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { Switch } from './Switch';

function Controlled({ onChange }: { onChange: (checked: boolean) => void }) {
  const [checked, setChecked] = useState(true);
  return (
    <Switch
      label="Cho phép hiện trên Google và công cụ tìm kiếm"
      description="Tắt sẽ ẩn trang khỏi kết quả tìm kiếm và sitemap."
      checked={checked}
      onCheckedChange={(next) => {
        setChecked(next);
        onChange(next);
      }}
    />
  );
}

describe('Switch', () => {
  it('exposes role switch with name, description and aria-checked', () => {
    render(<Controlled onChange={vi.fn()} />);
    const toggle = screen.getByRole('switch', {
      name: 'Cho phép hiện trên Google và công cụ tìm kiếm',
    });
    expect(toggle).toHaveAttribute('aria-checked', 'true');
    expect(toggle).toHaveAccessibleDescription('Tắt sẽ ẩn trang khỏi kết quả tìm kiếm và sitemap.');
  });

  it('toggles with click, keyboard and the label', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Controlled onChange={onChange} />);
    const toggle = screen.getByRole('switch');

    await user.click(toggle);
    expect(toggle).toHaveAttribute('aria-checked', 'false');

    toggle.focus();
    await user.keyboard(' ');
    expect(toggle).toHaveAttribute('aria-checked', 'true');

    await user.click(screen.getByText('Cho phép hiện trên Google và công cụ tìm kiếm'));
    expect(toggle).toHaveAttribute('aria-checked', 'false');
    expect(onChange.mock.calls).toEqual([[false], [true], [false]]);
  });

  it('does not toggle when disabled', async () => {
    const onChange = vi.fn();
    render(<Switch label="Hiện trên điện thoại" disabled onCheckedChange={onChange} />);
    const toggle = screen.getByRole('switch', { name: 'Hiện trên điện thoại' });
    expect(toggle).toBeDisabled();
    await userEvent.click(toggle);
    expect(onChange).not.toHaveBeenCalled();
  });
});
