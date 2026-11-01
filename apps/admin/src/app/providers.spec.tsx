import { onlineManager, useMutation } from '@tanstack/react-query';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { Providers } from './providers';

function Save() {
  const save = useMutation({
    mutationFn: () => Promise.reject(new Error('Không có kết nối')),
  });
  return (
    <button
      type="button"
      onClick={() => {
        save.mutate();
      }}
    >
      {save.isError ? 'Lỗi' : save.isPending ? 'Đang lưu' : 'Lưu'}
    </button>
  );
}

afterEach(() => {
  onlineManager.setOnline(true);
});

describe('Providers', () => {
  it('fails a change made offline at once, so the dialog waiting for it can show why', async () => {
    const user = userEvent.setup();
    render(
      <Providers>
        <Save />
      </Providers>,
    );
    act(() => {
      onlineManager.setOnline(false);
    });
    await user.click(screen.getByRole('button', { name: 'Lưu' }));
    expect(await screen.findByRole('button', { name: 'Lỗi' })).toBeInTheDocument();
  });
});
