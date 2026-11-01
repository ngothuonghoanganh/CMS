import { endpoints, type SiteDeletionSummary } from '@plp/contracts';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '../../lib/api';
import { siteQueryKeys } from '../dashboard/queries';
import { SITE_ID, siteFixture, WORKSPACE_ID } from '../dashboard/test-fixtures';
import { apiError, renderWithProviders } from '../shell/test-utils';
import { DeleteSiteCard, deletionLines } from './DeleteSiteCard';

const { router } = vi.hoisted(() => ({
  router: { push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() },
}));

vi.mock('next/navigation', () => ({ useRouter: () => router }));

vi.mock(import('../../lib/api'), async (importOriginal) => ({
  ...(await importOriginal()),
  api: vi.fn(),
}));

const apiMock = vi.mocked(api);

const SUMMARY: SiteDeletionSummary = {
  pages: 6,
  livePages: 3,
  leads: 1248,
  domains: ['uudai.smilecare.vn'],
};

function renderCard(summary = SUMMARY, name = 'Nha khoa Smile Care') {
  return renderWithProviders(<DeleteSiteCard site={siteFixture({ name })} summary={summary} />);
}

async function openDialog(user: ReturnType<typeof userEvent.setup>): Promise<HTMLElement> {
  await user.click(screen.getByRole('button', { name: 'Xóa site' }));
  return screen.findByRole('dialog', { name: /^Xóa site / });
}

beforeEach(() => {
  apiMock.mockReset();
  router.push.mockReset();
  router.refresh.mockReset();
});

describe('deletionLines', () => {
  it('says what goes: pages and live pages, leads, custom domains', () => {
    expect(deletionLines(SUMMARY)).toEqual([
      '6 trang, 3 đang live',
      '1.248 lead',
      'Tên miền riêng: uudai.smilecare.vn',
    ]);
    expect(deletionLines({ pages: 0, livePages: 0, leads: 0, domains: [] })).toEqual([
      'Chưa có trang nào',
      'Chưa có lead nào',
      'Không có tên miền riêng',
    ]);
  });
});

describe('DeleteSiteCard', () => {
  it('lists what goes and reminds to export the leads first, linking the inbox (ADR-027)', () => {
    renderCard();
    const card = screen.getByRole('region', { name: 'Xóa site' });
    expect(within(card).getByRole('list', { name: 'Sẽ bị xóa' })).toHaveTextContent(
      '6 trang, 3 đang live1.248 leadTên miền riêng: uudai.smilecare.vn',
    );
    expect(within(card).getByText(/Xuất lead ra file trước khi xóa site/)).toBeInTheDocument();
    expect(within(card).getByRole('link', { name: 'Mở hộp thư lead' })).toHaveAttribute(
      'href',
      `/sites/${SITE_ID}/leads?range=all`,
    );
  });

  it('has no reminder when the site has no lead', () => {
    renderCard({ ...SUMMARY, leads: 0 });
    expect(screen.queryByRole('link', { name: 'Mở hộp thư lead' })).toBeNull();
  });

  it('deletes the site once its name is typed, in any Unicode form, then opens the workspace', async () => {
    const user = userEvent.setup();
    const name = 'Nha khoa Quận Nhất';
    const { queryClient } = renderCard(SUMMARY, name);
    const remove = vi.spyOn(queryClient, 'removeQueries');
    apiMock.mockResolvedValueOnce(undefined);

    const dialog = await openDialog(user);
    const confirm = within(dialog).getByRole('button', { name: 'Xóa site' });
    const field = within(dialog).getByRole('textbox', { name: 'Nhập tên site để xác nhận' });
    expect(confirm).toBeDisabled();
    await user.type(field, 'Nha khoa Quan Nhat');
    expect(confirm).toBeDisabled();
    await user.clear(field);
    // Typed with combining accents, as some keyboards do: the same name.
    await user.type(field, name.normalize('NFD'));
    expect(confirm).toBeEnabled();
    await user.click(confirm);

    await vi.waitFor(() => {
      expect(router.push).toHaveBeenCalledWith(`/workspaces/${WORKSPACE_ID}`);
    });
    expect(router.refresh).toHaveBeenCalled();
    expect(apiMock).toHaveBeenCalledWith(endpoints.deleteSite, [SITE_ID], {
      body: { confirmName: name.normalize('NFD') },
    });
    expect(remove).toHaveBeenCalledWith({ queryKey: siteQueryKeys.site(SITE_ID) });
  });

  it('opens the workspace too when someone deleted the site just before', async () => {
    const user = userEvent.setup();
    apiMock.mockRejectedValueOnce(apiError(404, 'not_found', 'Không tìm thấy site'));
    renderCard();

    const dialog = await openDialog(user);
    await user.type(within(dialog).getByRole('textbox'), 'Nha khoa Smile Care');
    await user.click(within(dialog).getByRole('button', { name: 'Xóa site' }));

    await vi.waitFor(() => {
      expect(router.push).toHaveBeenCalledWith(`/workspaces/${WORKSPACE_ID}`);
    });
  });

  it('shows the refusal of the name on the field and stays', async () => {
    const user = userEvent.setup();
    apiMock.mockRejectedValueOnce(
      apiError(422, 'validation_failed', 'Dữ liệu không hợp lệ', [
        { path: ['confirmName'], code: 'mismatch', message: 'Tên site chưa đúng' },
      ]),
    );
    renderCard();

    const dialog = await openDialog(user);
    await user.type(
      within(dialog).getByRole('textbox', { name: 'Nhập tên site để xác nhận' }),
      'Nha khoa Smile Care',
    );
    await user.click(within(dialog).getByRole('button', { name: 'Xóa site' }));

    expect(await within(dialog).findByText('Tên site chưa đúng')).toBeInTheDocument();
    expect(router.push).not.toHaveBeenCalled();
  });

  it('starts again empty each time it opens', async () => {
    const user = userEvent.setup();
    renderCard();

    let dialog = await openDialog(user);
    await user.type(within(dialog).getByRole('textbox'), 'Nha khoa');
    await user.click(within(dialog).getByRole('button', { name: 'Hủy' }));
    dialog = await openDialog(user);
    expect(within(dialog).getByRole('textbox')).toHaveValue('');
    expect(apiMock).not.toHaveBeenCalled();
  });
});
