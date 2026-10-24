import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { IconButton } from '../IconButton/IconButton';
import { MoreHorizontalIcon, TrashIcon } from '../icons';
import {
  DropdownMenu,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
} from './DropdownMenu';

function PageActions({ onEdit, onUnpublish }: { onEdit: () => void; onUnpublish: () => void }) {
  return (
    <DropdownMenu
      trigger={
        <IconButton
          aria-label="Tùy chọn khác cho Trang chủ"
          icon={<MoreHorizontalIcon />}
          size="sm"
        />
      }
    >
      <DropdownMenuItem onSelect={onEdit}>Sửa</DropdownMenuItem>
      <DropdownMenuItem disabled>Nhân bản</DropdownMenuItem>
      <DropdownMenuSeparator />
      <DropdownMenuItem tone="danger" icon={<TrashIcon size={16} />} onSelect={onUnpublish}>
        Gỡ xuất bản
      </DropdownMenuItem>
    </DropdownMenu>
  );
}

describe('DropdownMenu', () => {
  it('opens from the keyboard and lists menu items, separators and danger items', async () => {
    const user = userEvent.setup();
    render(<PageActions onEdit={vi.fn()} onUnpublish={vi.fn()} />);
    const trigger = screen.getByRole('button', { name: 'Tùy chọn khác cho Trang chủ' });
    expect(trigger).toHaveAttribute('aria-haspopup', 'menu');
    trigger.focus();
    await user.keyboard('{Enter}');
    const menu = screen.getByRole('menu');
    expect(menu).toBeInTheDocument();
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getAllByRole('menuitem').map((item) => item.textContent)).toEqual([
      'Sửa',
      'Nhân bản',
      'Gỡ xuất bản',
    ]);
    expect(screen.getByRole('menuitem', { name: 'Nhân bản' })).toHaveAttribute(
      'aria-disabled',
      'true',
    );
    expect(screen.getByRole('menuitem', { name: 'Gỡ xuất bản' })).toHaveAttribute(
      'data-tone',
      'danger',
    );
    expect(screen.getByRole('separator')).toBeInTheDocument();
  });

  it('runs the chosen item and returns focus to the trigger', async () => {
    const user = userEvent.setup();
    const onUnpublish = vi.fn();
    render(<PageActions onEdit={vi.fn()} onUnpublish={onUnpublish} />);
    const trigger = screen.getByRole('button', { name: 'Tùy chọn khác cho Trang chủ' });
    await user.click(trigger);
    await user.click(screen.getByRole('menuitem', { name: 'Gỡ xuất bản' }));
    expect(onUnpublish).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it('closes with Escape without running anything', async () => {
    const user = userEvent.setup();
    const onEdit = vi.fn();
    render(<PageActions onEdit={onEdit} onUnpublish={vi.fn()} />);
    await user.click(screen.getByRole('button', { name: 'Tùy chọn khác cho Trang chủ' }));
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(onEdit).not.toHaveBeenCalled();
  });

  it('marks the current choice in a radio group', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    function Switcher() {
      const [workspace, setWorkspace] = useState('w1');
      return (
        <DropdownMenu
          align="start"
          trigger={<button type="button">Đổi workspace — hiện tại: Mây Xanh Agency</button>}
        >
          <DropdownMenuLabel>Workspace</DropdownMenuLabel>
          <DropdownMenuRadioGroup
            value={workspace}
            onValueChange={(next) => {
              setWorkspace(next);
              onChange(next);
            }}
          >
            <DropdownMenuRadioItem value="w1">Mây Xanh Agency</DropdownMenuRadioItem>
            <DropdownMenuRadioItem value="w2">Smile Care</DropdownMenuRadioItem>
          </DropdownMenuRadioGroup>
        </DropdownMenu>
      );
    }
    render(<Switcher />);
    await user.click(screen.getByRole('button', { name: /Đổi workspace/ }));
    expect(screen.getByRole('menuitemradio', { name: 'Mây Xanh Agency' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    await user.click(screen.getByRole('menuitemradio', { name: 'Smile Care' }));
    expect(onChange).toHaveBeenCalledWith('w2');
  });
});
