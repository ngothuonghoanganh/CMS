import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { Tooltip } from './Tooltip';

describe('Tooltip', () => {
  it('opens on keyboard focus, describes the trigger and closes with Escape', async () => {
    const user = userEvent.setup();
    render(
      <Tooltip content="Hoàn tác (Ctrl+Z)">
        <button type="button" aria-label="Hoàn tác">
          ↶
        </button>
      </Tooltip>,
    );
    const trigger = screen.getByRole('button', { name: 'Hoàn tác' });
    await user.tab();
    expect(trigger).toHaveFocus();
    const tooltip = await screen.findByRole('tooltip');
    expect(tooltip).toHaveTextContent('Hoàn tác (Ctrl+Z)');
    expect(trigger).toHaveAccessibleDescription('Hoàn tác (Ctrl+Z)');

    await user.keyboard('{Escape}');
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
    // The accessible name never depends on the tooltip.
    expect(screen.getByRole('button', { name: 'Hoàn tác' })).toBeInTheDocument();
  });
});
