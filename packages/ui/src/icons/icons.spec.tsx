import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { IconComponent } from './createIcon';
import * as icons from './icons';

const entries = Object.entries<IconComponent>(icons);

describe('icons', () => {
  it('exports at least the icon set the admin screens need', () => {
    const required = [
      'CloseIcon',
      'PlusIcon',
      'ChevronDownIcon',
      'ChevronUpDownIcon',
      'ArrowLeftIcon',
      'ArrowUpIcon',
      'ArrowDownIcon',
      'ArrowRightIcon',
      'EyeIcon',
      'EyeOffIcon',
      'UndoIcon',
      'RedoIcon',
      'DesktopIcon',
      'TabletIcon',
      'MobileIcon',
      'HistoryIcon',
      'SettingsIcon',
      'ExternalLinkIcon',
      'CheckIcon',
      'CheckCircleIcon',
      'WarningTriangleIcon',
      'InfoCircleIcon',
      'LockIcon',
      'SearchIcon',
      'DragHandleIcon',
      'CopyIcon',
      'TrashIcon',
      'DuplicateIcon',
      'GlobeIcon',
      'ShieldCheckIcon',
      'FileIcon',
      'ImageIcon',
      'MoreHorizontalIcon',
      'LogoutIcon',
    ];
    expect(Object.keys(icons)).toEqual(expect.arrayContaining(required));
  });

  it.each(entries)('%s is a decorative 24-unit SVG that follows currentColor', (_name, Icon) => {
    const { container } = render(<Icon />);
    const svg = container.querySelector('svg');
    expect(svg).not.toBeNull();
    expect(svg).toHaveAttribute('aria-hidden', 'true');
    expect(svg).toHaveAttribute('focusable', 'false');
    expect(svg).toHaveAttribute('viewBox', '0 0 24 24');
    const paint = [svg?.getAttribute('stroke'), svg?.getAttribute('fill')];
    expect(paint).toContain('currentColor');
  });

  it('applies the size prop to width and height', () => {
    const { container } = render(<icons.PlusIcon size={16} />);
    const svg = container.querySelector('svg');
    expect(svg).toHaveAttribute('width', '16');
    expect(svg).toHaveAttribute('height', '16');
  });
});
