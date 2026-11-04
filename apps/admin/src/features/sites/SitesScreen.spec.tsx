import type { Access, Membership, SiteListItem, SiteSummary } from '@plp/contracts';
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { siteFixture, SITE_ID, WORKSPACE_ID } from '../dashboard/test-fixtures';
import { SitesScreen } from './SitesScreen';

const workspace: Membership['workspace'] = {
  id: WORKSPACE_ID,
  name: 'Mây Xanh Agency',
  slug: 'may-xanh-agency',
};

const KITCHEN_ID = '64b000000000000000000002';

function listItem(summary: SiteSummary, overrides: Partial<SiteListItem> = {}): SiteListItem {
  return { ...siteFixture(), summary, ...overrides };
}

const smile = listItem(
  { pages: 6, livePages: 3, leadsLast7Days: 48 },
  { publicOrigin: 'https://go.smilecare.vn' },
);
const kitchen = listItem(
  { pages: 0, livePages: 0, leadsLast7Days: 0 },
  {
    id: KITCHEN_ID,
    name: 'Bếp Nhà Mây',
    subdomain: 'bepnhamay',
    themePresetId: 'sunset',
    defaultOrigin: 'https://bepnhamay.payload.site',
    publicOrigin: 'https://bepnhamay.payload.site',
  },
);

function renderScreen(
  role: Access,
  sites: readonly SiteListItem[],
  siteIds: Membership['siteIds'] = null,
) {
  return render(<SitesScreen workspace={workspace} role={role} siteIds={siteIds} sites={sites} />);
}

/** The cells of each row of the list, as screen readers read them (the tile is decorative). */
function rows(): string[][] {
  const [, ...body] = within(screen.getByRole('table')).getAllByRole('row');
  return body.map((row) =>
    within(row)
      .getAllByRole('cell')
      .map((cell) => {
        const read = cell.cloneNode(true);
        if (!(read instanceof Element)) {
          throw new Error('A cell is an element');
        }
        read.querySelectorAll('[aria-hidden="true"]').forEach((hidden) => {
          hidden.remove();
        });
        return read.textContent.replace(/\s+/g, ' ').trim();
      }),
  );
}

describe('SitesScreen', () => {
  it('lists each site with its address, pages, live pages and leads of 7 days', () => {
    renderScreen('owner', [smile, kitchen]);

    expect(screen.getByRole('heading', { level: 1, name: 'Sites' })).toBeInTheDocument();
    // No workspace-name line above the title: the sidebar names the workspace (board Sites).
    expect(screen.queryByText('Mây Xanh Agency')).not.toBeInTheDocument();
    expect(
      within(screen.getByRole('table'))
        .getAllByRole('columnheader')
        .map((header) => header.textContent),
    ).toEqual(['SITE', 'TRANG', 'ĐANG LIVE', 'LEAD 7 NGÀY', 'Thao tác']);
    expect(rows()).toEqual([
      ['Nha khoa Smile Care Địa chỉ: go.smilecare.vn', '6', '3', '48', 'Mở Nha khoa Smile Care'],
      ['Bếp Nhà Mây Địa chỉ: bepnhamay.payload.site', '0', '0', '0', 'Mở Bếp Nhà Mây'],
    ]);
  });

  it("opens a site's pages from its row", () => {
    renderScreen('owner', [smile, kitchen]);

    expect(screen.getByRole('link', { name: 'Nha khoa Smile Care' })).toHaveAttribute(
      'href',
      `/sites/${SITE_ID}`,
    );
    expect(screen.getByRole('link', { name: 'Mở Bếp Nhà Mây' })).toHaveAttribute(
      'href',
      `/sites/${KITCHEN_ID}`,
    );
  });

  it('offers "Tạo site" to the roles that create sites (ADR-020)', () => {
    const { unmount } = renderScreen('admin', [smile]);
    expect(screen.getByRole('link', { name: 'Tạo site' })).toHaveAttribute(
      'href',
      `/sites/new?workspace=${WORKSPACE_ID}`,
    );
    unmount();

    renderScreen('editor', [smile]);
    expect(screen.queryByRole('link', { name: /Tạo site/ })).not.toBeInTheDocument();
  });

  it('leaves the lead column out for roles that do not see leads (ADR-024)', () => {
    renderScreen('editor', [listItem({ pages: 6, livePages: 3, leadsLast7Days: null })]);

    expect(screen.queryByRole('columnheader', { name: 'LEAD 7 NGÀY' })).not.toBeInTheDocument();
    expect(rows()).toEqual([
      ['Nha khoa Smile Care Địa chỉ: smilecare.payload.site', '6', '3', 'Mở Nha khoa Smile Care'],
    ]);
  });

  it('starts an empty workspace with its first site', () => {
    renderScreen('owner', []);

    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 3, name: 'Chưa có site nào' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Tạo site đầu tiên' })).toHaveAttribute(
      'href',
      `/sites/new?workspace=${WORKSPACE_ID}`,
    );
  });

  it('tells a member who cannot create sites why the list is empty', () => {
    const { unmount } = renderScreen('viewer', []);
    expect(
      screen.getByText(
        'Mây Xanh Agency chưa có site nào. Chỉ Chủ sở hữu và Quản trị tạo được site; site mới sẽ hiện ở đây.',
      ),
    ).toBeInTheDocument();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    unmount();

    // Kept to sites that are all gone (ADR-027).
    renderScreen('editor', [], []);
    expect(
      screen.getByText(
        'Bạn chưa được giao site nào trong Mây Xanh Agency. Nhờ Chủ sở hữu và Quản trị giao site cho bạn.',
      ),
    ).toBeInTheDocument();
  });
});
