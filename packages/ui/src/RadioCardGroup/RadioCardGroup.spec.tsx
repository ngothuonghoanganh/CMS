import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { InboxIcon, TagIcon } from '../icons';
import { RadioCardGroup, type RadioCardOption } from './RadioCardGroup';

type Goal = 'lead' | 'promo' | 'event';
const goals: ReadonlyArray<RadioCardOption<Goal>> = [
  {
    value: 'lead',
    label: 'Thu lead tư vấn',
    description: 'Khách để lại tên và số điện thoại để được gọi lại.',
    icon: <InboxIcon />,
  },
  {
    value: 'promo',
    label: 'Ưu đãi có thời hạn',
    description: 'Khuyến mãi theo chiến dịch, có điều kiện và hạn dùng.',
    icon: <TagIcon />,
  },
  { value: 'event', label: 'Sự kiện / webinar', disabled: true },
];

function GoalPicker({ onChange }: { onChange: (goal: Goal) => void }) {
  const [goal, setGoal] = useState<Goal | null>('lead');
  return (
    <RadioCardGroup
      legend="Mục tiêu của trang"
      options={goals}
      value={goal}
      onChange={(next) => {
        setGoal(next);
        onChange(next);
      }}
    />
  );
}

describe('RadioCardGroup', () => {
  it('is a fieldset named by its legend with radios named by the card title', () => {
    render(<GoalPicker onChange={vi.fn()} />);
    expect(screen.getByRole('group', { name: 'Mục tiêu của trang' })).toBeInTheDocument();
    const lead = screen.getByRole('radio', { name: 'Thu lead tư vấn' });
    expect(lead).toBeChecked();
    expect(lead).toHaveAccessibleDescription('Khách để lại tên và số điện thoại để được gọi lại.');
    expect(screen.getByRole('radio', { name: 'Sự kiện / webinar' })).toBeDisabled();
  });

  it('selects a card by clicking anywhere on it', async () => {
    const onChange = vi.fn();
    render(<GoalPicker onChange={onChange} />);
    await userEvent.click(
      screen.getByText('Khuyến mãi theo chiến dịch, có điều kiện và hạn dùng.'),
    );
    expect(screen.getByRole('radio', { name: 'Ưu đãi có thời hạn' })).toBeChecked();
    expect(screen.getByRole('radio', { name: 'Thu lead tư vấn' })).not.toBeChecked();
    expect(onChange).toHaveBeenCalledWith('promo');
  });

  it('keeps native keyboard behaviour: arrow keys change the selection', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<GoalPicker onChange={onChange} />);
    await user.tab();
    expect(screen.getByRole('radio', { name: 'Thu lead tư vấn' })).toHaveFocus();
    await user.keyboard('{ArrowDown}');
    expect(screen.getByRole('radio', { name: 'Ưu đãi có thời hạn' })).toBeChecked();
    expect(onChange).toHaveBeenCalledWith('promo');
  });

  it('can start with nothing selected', () => {
    render(<RadioCardGroup legend="Giao diện" options={goals} value={null} onChange={vi.fn()} />);
    for (const radio of screen.getAllByRole('radio')) {
      expect(radio).not.toBeChecked();
    }
  });

  it('describes every radio with a message about the group, such as a missing choice', () => {
    render(
      <>
        <RadioCardGroup
          legend="Mục tiêu của trang"
          options={goals}
          value={null}
          onChange={vi.fn()}
          describedBy="goal-error"
          invalid
        />
        <p id="goal-error">Chọn mục tiêu của trang</p>
      </>,
    );
    const [lead, , event] = screen.getAllByRole('radio');
    expect(lead).toHaveAccessibleDescription(
      'Khách để lại tên và số điện thoại để được gọi lại. Chọn mục tiêu của trang',
    );
    expect(event).toHaveAccessibleDescription('Chọn mục tiêu của trang');
    expect(lead).toHaveAttribute('aria-invalid', 'true');
  });
});
