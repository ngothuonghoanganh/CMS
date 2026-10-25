import { endpoints } from '@plp/contracts';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '../../lib/api';
import { draftPageFixture, pageFixture, SITE_ID } from '../dashboard/test-fixtures';
import { renderWithProviders } from '../shell/test-utils';
import { PageDetailHeader, pageTabs } from './PageDetailHeader';

vi.mock(import('../../lib/api'), async (importOriginal) => ({
  ...(await importOriginal()),
  api: vi.fn(),
}));

const apiMock = vi.mocked(api);
const NOW = Date.parse('2026-10-24T12:00:00.000Z');

// jsdom has no pointer capture; Radix menus call it while handling pointer events.
beforeAll(() => {
  for (const method of ['hasPointerCapture', 'setPointerCapture', 'releasePointerCapture']) {
    if (!Reflect.has(Element.prototype, method)) {
      Object.defineProperty(Element.prototype, method, {
        configurable: true,
        value: method === 'hasPointerCapture' ? () => false : () => undefined,
      });
    }
  }
});

beforeEach(() => {
  apiMock.mockReset();
});

describe('pageTabs', () => {
  it('links the editor, SEO and history of the page and marks the current one', () => {
    expect(pageTabs(SITE_ID, 'p1', 'seo')).toEqual([
      { href: `/sites/${SITE_ID}/pages/p1/edit`, label: 'Nội dung', current: false },
      { href: `/sites/${SITE_ID}/pages/p1/seo`, label: 'SEO & chia sẻ', current: true },
      { href: `/sites/${SITE_ID}/pages/p1/history`, label: 'Lịch sử phiên bản', current: false },
    ]);
  });
});

describe('PageDetailHeader', () => {
  it('has no extra menu for a page that is not live', () => {
    renderWithProviders(
      <PageDetailHeader siteId={SITE_ID} page={draftPageFixture()} current="seo" now={NOW} />,
    );
    expect(screen.getByRole('navigation', { name: 'Đường dẫn' })).toHaveTextContent(
      'Trang / Webinar chăm sóc răng trẻ em',
    );
    expect(screen.getByText('Bản nháp')).toBeInTheDocument();
    expect(screen.getByText('Chưa từng xuất bản')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Tùy chọn khác' })).not.toBeInTheDocument();
  });

  it('unpublishes a live page with a reason from "Tùy chọn khác"', async () => {
    const user = userEvent.setup();
    const page = pageFixture();
    const onUnpublished = vi.fn();
    const result = { activityId: '64b000000000000000000401', page, revalidation: 'ok' };
    apiMock.mockResolvedValueOnce(result);
    renderWithProviders(
      <PageDetailHeader
        siteId={SITE_ID}
        page={page}
        current="history"
        now={NOW}
        onUnpublished={onUnpublished}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Tùy chọn khác' }));
    await user.click(screen.getByRole('menuitem', { name: 'Gỡ xuất bản' }));
    const dialog = screen.getByRole('alertdialog');
    await user.type(within(dialog).getByRole('textbox', { name: /Lý do/ }), 'Hết chương trình');
    const confirm = within(dialog).getAllByRole('button', { name: 'Gỡ xuất bản' }).at(-1);
    if (confirm === undefined) {
      throw new Error('confirm button missing');
    }
    await user.click(confirm);

    await vi.waitFor(() => {
      expect(onUnpublished).toHaveBeenCalledWith(result);
    });
    expect(apiMock).toHaveBeenCalledWith(endpoints.movePointer, [page.id], {
      body: {
        targetReleaseId: null,
        expectedCurrentReleaseId: page.liveRelease?.id,
        reason: 'Hết chương trình',
      },
    });
  });
});
