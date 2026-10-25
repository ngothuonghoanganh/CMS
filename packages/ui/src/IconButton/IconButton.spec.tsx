import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { HistoryIcon, UndoIcon } from '../icons';
import { IconButton, IconButtonLink } from './IconButton';

describe('IconButton', () => {
  it('is named by its aria-label and hides the icon', async () => {
    const onClick = vi.fn();
    render(<IconButton aria-label="Đóng bảng thuộc tính" icon={<UndoIcon />} onClick={onClick} />);
    const button = screen.getByRole('button', { name: 'Đóng bảng thuộc tính' });
    expect(button).toHaveAttribute('type', 'button');
    expect(button.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
    await userEvent.click(button);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('supports disabled and toggle state through native props', () => {
    render(<IconButton aria-label="Làm lại" icon={<UndoIcon />} disabled aria-pressed="false" />);
    const button = screen.getByRole('button', { name: 'Làm lại' });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('aria-pressed', 'false');
  });

  it('shows the tooltip on focus without changing the name', async () => {
    const user = userEvent.setup();
    render(<IconButton aria-label="Hoàn tác" tooltip="Hoàn tác (Ctrl+Z)" icon={<UndoIcon />} />);
    await user.tab();
    expect(await screen.findByRole('tooltip')).toHaveTextContent('Hoàn tác (Ctrl+Z)');
    expect(screen.getByRole('button', { name: 'Hoàn tác' })).toHaveFocus();
  });
});

describe('IconButtonLink', () => {
  it('renders a named link', () => {
    render(
      <IconButtonLink
        href="/sites/s/pages/p/history"
        aria-label="Lịch sử phiên bản"
        icon={<HistoryIcon />}
      />,
    );
    expect(screen.getByRole('link', { name: 'Lịch sử phiên bản' })).toHaveAttribute(
      'href',
      '/sites/s/pages/p/history',
    );
  });
});
