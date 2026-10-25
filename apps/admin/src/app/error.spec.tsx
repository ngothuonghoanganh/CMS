import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import SiteScreenError from './(workspace)/sites/[siteId]/error';
import AppError from './error';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('admin error boundaries', () => {
  it('explains a failed screen in Vietnamese, retries, links home and logs the error', async () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const retry = vi.fn();
    const failure = new Error('fetch failed');
    render(<AppError error={failure} retry={retry} />);

    expect(screen.getByRole('main')).toBeVisible();
    expect(screen.getByRole('heading', { level: 1, name: 'Không tải được trang' })).toBeVisible();
    expect(screen.getByRole('link', { name: 'Về trang chính' })).toHaveAttribute('href', '/');
    await userEvent.click(screen.getByRole('button', { name: 'Thử lại' }));
    expect(retry).toHaveBeenCalledTimes(1);
    expect(logged).toHaveBeenCalledWith('Admin screen failed to load', failure);
  });

  it('keeps a failed site screen inside the site frame, without a second main landmark', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    render(<SiteScreenError error={new Error('500')} retry={vi.fn()} />);

    expect(screen.queryByRole('main')).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1, name: 'Không tải được trang' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Thử lại' })).toBeEnabled();
  });
});
