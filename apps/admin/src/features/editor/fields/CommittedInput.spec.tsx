import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { CommittedInput } from './CommittedInput';

function validateUrl(text: string): string | null {
  return text.startsWith('https://') ? null : 'Đường dẫn phải bắt đầu bằng https://';
}

function Harness({ initial }: { initial: string }) {
  const [value, setValue] = useState(initial);
  return (
    <>
      <CommittedInput label="Đường dẫn" value={value} validate={validateUrl} onCommit={setValue} />
      <button
        type="button"
        onClick={() => {
          setValue('https://undo.example');
        }}
      >
        Hoàn tác
      </button>
      <output>{value}</output>
    </>
  );
}

describe('CommittedInput', () => {
  it('commits on Enter and keeps focus in the same input', async () => {
    const user = userEvent.setup();
    render(<Harness initial="" />);
    const input = screen.getByRole('textbox', { name: 'Đường dẫn' });
    await user.click(input);
    await user.type(input, 'https://example.com{Enter}');

    expect(screen.getByRole('status')).toHaveTextContent('https://example.com');
    expect(screen.getByRole('textbox', { name: 'Đường dẫn' })).toBe(input);
    expect(input).toHaveFocus();
  });

  it('keeps an invalid value out of the draft and explains why', async () => {
    const user = userEvent.setup();
    render(<Harness initial="" />);
    const input = screen.getByRole('textbox', { name: 'Đường dẫn' });
    await user.type(input, 'htt{Enter}');
    expect(screen.getByRole('status')).toHaveTextContent('');
    expect(screen.getByText('Đường dẫn phải bắt đầu bằng https://')).toBeVisible();
    expect(input).toHaveFocus();
  });

  it('shows the draft value again when it changes from outside, such as undo', async () => {
    const user = userEvent.setup();
    render(<Harness initial="https://a.example" />);
    const input = screen.getByRole('textbox', { name: 'Đường dẫn' });
    await user.clear(input);
    await user.type(input, 'htt');
    await user.click(screen.getByRole('button', { name: 'Hoàn tác' }));
    expect(input).toHaveValue('https://undo.example');
  });
});
