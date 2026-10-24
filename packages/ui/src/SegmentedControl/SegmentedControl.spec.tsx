import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { DesktopIcon, MobileIcon, TabletIcon } from '../icons';
import { SegmentedControl, type SegmentedOption } from './SegmentedControl';

type Spacing = 'compact' | 'normal' | 'spacious';
const spacing: ReadonlyArray<SegmentedOption<Spacing>> = [
  { value: 'compact', label: 'Gọn' },
  { value: 'normal', label: 'Vừa' },
  { value: 'spacious', label: 'Rộng' },
];

function SpacingControl({ onChange }: { onChange: (value: Spacing) => void }) {
  const [value, setValue] = useState<Spacing>('normal');
  return (
    <SegmentedControl
      aria-label="Khoảng cách"
      options={spacing}
      value={value}
      fullWidth
      onChange={(next) => {
        setValue(next);
        onChange(next);
      }}
    />
  );
}

describe('SegmentedControl', () => {
  it('is a named group of toggle buttons with one pressed', () => {
    render(<SpacingControl onChange={vi.fn()} />);
    expect(screen.getByRole('group', { name: 'Khoảng cách' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Vừa' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Gọn' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('moves aria-pressed when a segment is chosen', async () => {
    const onChange = vi.fn();
    render(<SpacingControl onChange={onChange} />);
    await userEvent.click(screen.getByRole('button', { name: 'Rộng' }));
    expect(screen.getByRole('button', { name: 'Rộng' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Vừa' })).toHaveAttribute('aria-pressed', 'false');
    // Pressing the current segment again changes nothing.
    await userEvent.click(screen.getByRole('button', { name: 'Rộng' }));
    expect(onChange.mock.calls).toEqual([['spacious']]);
  });

  it('moves focus with arrow keys and selects with Enter', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<SpacingControl onChange={onChange} />);
    screen.getByRole('button', { name: 'Gọn' }).focus();
    await user.keyboard('{ArrowRight}');
    expect(screen.getByRole('button', { name: 'Vừa' })).toHaveFocus();
    await user.keyboard('{ArrowRight}{ArrowRight}');
    expect(screen.getByRole('button', { name: 'Gọn' })).toHaveFocus();
    await user.keyboard('{ArrowLeft}{Enter}');
    expect(onChange).toHaveBeenLastCalledWith('spacious');
  });

  it('names icon-only segments by their label', async () => {
    const onChange = vi.fn();
    render(
      <SegmentedControl
        aria-label="Xem theo thiết bị"
        value="desktop"
        onChange={onChange}
        options={[
          { value: 'desktop', label: 'Máy tính', icon: <DesktopIcon size={18} />, iconOnly: true },
          {
            value: 'tablet',
            label: 'Máy tính bảng',
            icon: <TabletIcon size={18} />,
            iconOnly: true,
          },
          { value: 'mobile', label: 'Điện thoại', icon: <MobileIcon size={18} />, iconOnly: true },
        ]}
      />,
    );
    const mobile = screen.getByRole('button', { name: 'Điện thoại' });
    expect(mobile).toHaveAttribute('aria-pressed', 'false');
    await userEvent.click(mobile);
    expect(onChange).toHaveBeenCalledWith('mobile');
  });
});
