import { endpoints, type PageSummary } from '@plp/contracts';
import { ToastProvider } from '@plp/ui';
import { QueryClientProvider } from '@tanstack/react-query';
import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
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

/** A page screen around the header, like "SEO & chia sẻ": its page follows an unpublish at once. */
function Screen({ initial }: { initial: PageSummary }) {
  const [page, setPage] = useState(initial);
  return (
    <PageDetailHeader
      siteId={SITE_ID}
      page={page}
      current="seo"
      now={NOW}
      onUnpublished={(result) => {
        setPage(result.page);
      }}
    />
  );
}

async function openUnpublish(user: ReturnType<typeof userEvent.setup>): Promise<HTMLElement> {
  await user.click(screen.getByRole('button', { name: 'Tùy chọn khác' }));
  await user.click(screen.getByRole('menuitem', { name: 'Gỡ xuất bản' }));
  return screen.getByRole('alertdialog');
}

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

  it('opens the live page from "Tùy chọn khác" as a member’s visit, not counted', async () => {
    const user = userEvent.setup();
    const open = vi.spyOn(window, 'open').mockReturnValue(null);
    renderWithProviders(
      <PageDetailHeader siteId={SITE_ID} page={pageFixture()} current="history" now={NOW} />,
    );

    await user.click(screen.getByRole('button', { name: 'Tùy chọn khác' }));
    await user.click(screen.getByRole('menuitem', { name: 'Xem trang live' }));
    expect(open).toHaveBeenCalledWith(
      'https://smilecare.payload.site/uu-dai-thang-11?plp_internal=1',
      '_blank',
      'noopener,noreferrer',
    );
    open.mockRestore();
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

  it('keeps the focus in the header when unpublishing takes "Tùy chọn khác" away', async () => {
    const user = userEvent.setup();
    const page = pageFixture();
    const unpublished: PageSummary = {
      ...page,
      status: { kind: 'unpublished', changeCount: 0, changes: [] },
      liveRelease: null,
      liveUrl: null,
    };
    apiMock.mockResolvedValueOnce({
      activityId: '64b000000000000000000401',
      page: unpublished,
      revalidation: 'ok',
    });
    renderWithProviders(<Screen initial={page} />);

    const dialog = await openUnpublish(user);
    await user.type(within(dialog).getByRole('textbox', { name: /Lý do/ }), 'Hết chương trình');
    await user.tab();
    await user.tab();
    expect(within(dialog).getAllByRole('button', { name: 'Gỡ xuất bản' }).at(-1)).toHaveFocus();
    await user.keyboard('{Enter}');

    await waitFor(() => {
      expect(screen.queryByRole('alertdialog')).toBeNull();
    });
    expect(screen.queryByRole('button', { name: 'Tùy chọn khác' })).toBeNull();
    await waitFor(() => {
      expect(screen.getByRole('link', { name: 'Mở editor' })).toHaveFocus();
    });
  });

  it('returns the focus to "Tùy chọn khác" when unpublishing is cancelled', async () => {
    const user = userEvent.setup();
    renderWithProviders(<Screen initial={pageFixture()} />);

    await openUnpublish(user);
    await user.keyboard('{Escape}');

    expect(screen.queryByRole('alertdialog')).toBeNull();
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Tùy chọn khác' })).toHaveFocus();
    });
    expect(apiMock).not.toHaveBeenCalled();
  });

  describe('when a read brings the page as no longer live', () => {
    const live = pageFixture();
    const unpublished: PageSummary = {
      ...live,
      status: { kind: 'unpublished', changeCount: 0, changes: [] },
      liveRelease: null,
      liveUrl: null,
    };

    /** The header as History renders it, its page replaced by the screen's next read. */
    function renderReading() {
      const header = (page: PageSummary) => (
        <PageDetailHeader siteId={SITE_ID} page={page} current="history" now={NOW} />
      );
      const { rerender, queryClient } = renderWithProviders(header(live));
      return (page: PageSummary) => {
        rerender(
          <QueryClientProvider client={queryClient}>
            <ToastProvider>{header(page)}</ToastProvider>
          </QueryClientProvider>,
        );
      };
    }

    it('moves the focus "Tùy chọn khác" had to "Mở editor"', () => {
      const read = renderReading();
      act(() => {
        screen.getByRole('button', { name: 'Tùy chọn khác' }).focus();
      });
      read(unpublished);
      expect(screen.queryByRole('button', { name: 'Tùy chọn khác' })).toBeNull();
      expect(screen.getByRole('link', { name: 'Mở editor' })).toHaveFocus();
    });

    it('leaves the focus where it is when "Tùy chọn khác" did not have it', () => {
      const read = renderReading();
      const tab = screen.getByRole('link', { name: 'SEO & chia sẻ' });
      act(() => {
        screen.getByRole('button', { name: 'Tùy chọn khác' }).focus();
      });
      act(() => {
        tab.focus();
      });
      read(unpublished);
      expect(tab).toHaveFocus();
    });

    it('does not take a focus the page already had when "Tùy chọn khác" never had it', () => {
      const read = renderReading();
      expect(document.activeElement).toBe(document.body);
      read(unpublished);
      expect(document.activeElement).toBe(document.body);
    });

    it('forgets "Tùy chọn khác" had the focus once it moved on, even back to the page', () => {
      const read = renderReading();
      const tab = screen.getByRole('link', { name: 'SEO & chia sẻ' });
      act(() => {
        screen.getByRole('button', { name: 'Tùy chọn khác' }).focus();
      });
      act(() => {
        tab.focus();
      });
      act(() => {
        tab.blur();
      });
      read(unpublished);
      expect(document.activeElement).toBe(document.body);
    });
  });
});
