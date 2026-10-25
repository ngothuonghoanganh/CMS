import type { Site } from '@plp/contracts';
import { ToastProvider } from '@plp/ui';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, type Mock, vi } from 'vitest';
import { api } from '../../lib/api';
import type * as ApiModule from '../../lib/api';
import { site } from '../editor/test-fixtures';
import { ThemePickerDialog } from './ThemePickerDialog';

vi.mock('../../lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof ApiModule>();
  return { ...actual, api: vi.fn() };
});

const apiMock = vi.mocked(api) as unknown as Mock<
  (endpoint: unknown, args: string[], options: { body: unknown }) => Promise<Site>
>;

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient();
  return (
    <QueryClientProvider client={client}>
      <ToastProvider>{children}</ToastProvider>
    </QueryClientProvider>
  );
}

beforeEach(() => {
  apiMock.mockReset();
});

describe('ThemePickerDialog', () => {
  it('lets the owner apply another preset to the site', async () => {
    const user = userEvent.setup();
    const onSiteUpdated = vi.fn();
    const onOpenChange = vi.fn();
    const updated: Site = { ...site, themePresetId: 'sunset' };
    apiMock.mockResolvedValue(updated);
    render(
      <ThemePickerDialog
        open
        onOpenChange={onOpenChange}
        site={site}
        canEdit
        onSiteUpdated={onSiteUpdated}
      />,
      { wrapper },
    );
    expect(screen.getByRole('radio', { name: 'Bạc hà' })).toBeChecked();
    const apply = screen.getByRole('button', { name: 'Áp dụng giao diện' });
    expect(apply).toBeDisabled();
    await user.click(screen.getByRole('radio', { name: 'Hoàng hôn' }));
    await user.click(apply);
    await waitFor(() => {
      expect(onSiteUpdated).toHaveBeenCalledWith(updated);
    });
    expect(apiMock).toHaveBeenCalledWith(expect.anything(), [site.id], {
      body: { themePresetId: 'sunset' },
    });
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('is read-only for editors', () => {
    render(
      <ThemePickerDialog
        open
        onOpenChange={vi.fn()}
        site={site}
        canEdit={false}
        onSiteUpdated={vi.fn()}
      />,
      { wrapper },
    );
    expect(screen.getByText('Chỉ Owner đổi được giao diện site')).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Hoàng hôn' })).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Áp dụng giao diện' })).toBeNull();
  });
});
