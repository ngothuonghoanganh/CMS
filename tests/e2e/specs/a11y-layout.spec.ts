import { type Cookie, expect, type Page, test } from '@playwright/test';
import { animationsSettled, expectNoSidewaysScroll } from '../support/axe.js';
import { type Board, seedBoard } from '../support/board.js';
import { siteOrigin } from '../urls.js';

/*
 * What axe does not judge: content reflows at 320 px without sideways scrolling (WCAG 1.4.10),
 * and a focused control is never entirely hidden under a sticky bar, a drawer or a toast
 * (2.4.11). Target sizes (2.5.8) are axe's `target-size` rule in the scans of a11y-*.spec.ts.
 */

let board: Board;
let session: Cookie[];

test.beforeAll(async ({ browser }) => {
  const context = await browser.newContext();
  board = await seedBoard(context.request);
  session = (await context.storageState()).cookies;
  await context.close();
});

test.beforeEach(async ({ context }) => {
  await context.addCookies(session);
});

/** The admin screens, each with a control that shows it has rendered. */
function adminScreens(): Array<{
  name: string;
  path: string;
  ready: (page: Page) => Promise<void>;
}> {
  const site = `/sites/${board.site.id}`;
  const heading = (name: string) => async (page: Page) => {
    await expect(page.getByRole('heading', { level: 1, name, exact: true })).toBeVisible();
  };
  return [
    { name: 'Bảng điều khiển', path: site, ready: heading('Trang') },
    {
      name: 'Tạo trang',
      path: `${site}/pages/new`,
      ready: heading('Trang này dùng để làm gì?'),
    },
    {
      name: 'Editor',
      path: `${site}/pages/${board.pages.promo.id}/edit`,
      ready: async (page) => {
        await expect(page.getByRole('region', { name: 'Khung xem trước bản nháp' })).toBeVisible();
      },
    },
    {
      name: 'Lịch sử',
      path: `${site}/pages/${board.pages.implant.id}/history`,
      ready: async (page) => {
        await expect(page.getByRole('heading', { name: 'Phiên bản đã xuất bản' })).toBeVisible();
      },
    },
    {
      name: 'SEO & chia sẻ',
      path: `${site}/pages/${board.pages.promo.id}/seo`,
      ready: heading(board.pages.promo.title),
    },
    { name: 'Tên miền', path: `${site}/domain`, ready: heading('Tên miền') },
    { name: 'Cài đặt site', path: `${site}/settings`, ready: heading('Cài đặt site') },
    {
      name: 'Leads',
      path: `${site}/leads?range=all&lead=${board.leads.get('Nguyễn Thu Hà') ?? ''}`,
      ready: async (page) => {
        await expect(page.getByRole('complementary', { name: 'Nguyễn Thu Hà' })).toBeVisible();
      },
    },
    {
      name: 'Dữ liệu & đồng ý',
      path: `${site}/privacy`,
      ready: heading('Dữ liệu cá nhân & đồng ý'),
    },
    { name: 'Hiệu quả', path: `${site}/analytics`, ready: heading('Hiệu quả') },
  ];
}

/**
 * Tabs through the page and lists every control that took focus while no part of it showed: the
 * point of the control at the top of the stack is never the control itself.
 */
async function controlsHiddenWhenFocused(page: Page, presses: number): Promise<string[]> {
  const hidden = new Set<string>();
  for (let index = 0; index < presses; index += 1) {
    await page.keyboard.press('Tab');
    // A tooltip still fading out may lie over the next control for a moment.
    await animationsSettled(page);
    const found = await page.evaluate(() => {
      const element = document.activeElement;
      if (!(element instanceof HTMLElement) || element === document.body) {
        return null;
      }
      const box = element.getBoundingClientRect();
      const left = Math.max(box.left, 0);
      const right = Math.min(box.right, window.innerWidth);
      const top = Math.max(box.top, 0);
      const bottom = Math.min(box.bottom, window.innerHeight);
      const describe = () =>
        `${element.tagName.toLowerCase()} "${(element.getAttribute('aria-label') ?? element.textContent ?? '').trim().slice(0, 60)}"`;
      if (right <= left || bottom <= top) {
        return `${describe()} (outside the viewport)`;
      }
      for (const x of [0.1, 0.5, 0.9]) {
        for (const y of [0.1, 0.5, 0.9]) {
          const hit = document.elementFromPoint(
            left + (right - left) * x,
            top + (bottom - top) * y,
          );
          if (hit !== null && (element.contains(hit) || hit.contains(element))) {
            return null;
          }
        }
      }
      return `${describe()} (under ${document
        .elementFromPoint((left + right) / 2, (top + bottom) / 2)
        ?.tagName.toLowerCase()})`;
    });
    if (found !== null) {
      hidden.add(found);
    }
  }
  return [...hidden];
}

test.describe('Accessibility · reflow at 320 px and focus not obscured', () => {
  test('admin screens reflow at 320 px', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 640 });
    for (const screen of adminScreens()) {
      await page.goto(screen.path);
      await screen.ready(page);
      await expectNoSidewaysScroll(page, `${screen.name} at 320 px`);
    }
    await page.context().clearCookies();
    for (const path of ['/login', '/signup']) {
      await page.goto(path);
      await expectNoSidewaysScroll(page, `${path} at 320 px`);
    }
  });

  test('public pages reflow at 320 px', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 640 });
    for (const slug of ['', 'uu-dai-thang-11', 'implant', 'khong-co-trang-nay']) {
      await page.goto(`${siteOrigin(board.site.subdomain)}/${slug}`);
      await expect(page.getByRole('main')).toBeVisible();
      await expectNoSidewaysScroll(page, `/${slug} at 320 px`);
    }
  });

  for (const viewport of [
    { width: 1440, height: 900 },
    { width: 375, height: 667 },
  ]) {
    test(`a focused control always shows at ${viewport.width} px`, async ({ page }) => {
      await page.setViewportSize(viewport);
      for (const screen of adminScreens()) {
        await page.goto(screen.path);
        await screen.ready(page);
        expect
          .soft(await controlsHiddenWhenFocused(page, 60), `${screen.name}: hidden focus`)
          .toEqual([]);
      }
      await page.goto(`${siteOrigin(board.site.subdomain)}/uu-dai-thang-11`);
      await expect(page.getByRole('main')).toBeVisible();
      expect
        .soft(await controlsHiddenWhenFocused(page, 40), 'Trang live: hidden focus')
        .toEqual([]);
    });

    test(`a toast never hides the focused control at ${viewport.width} px`, async ({ page }) => {
      await page.setViewportSize(viewport);
      const name = 'Trần Quốc Bảo';
      await page.goto(
        `/sites/${board.site.id}/leads?range=all&lead=${board.leads.get(name) ?? ''}`,
      );
      const detail = page.getByRole('complementary', { name });
      const note = detail.getByRole('textbox', { name: 'Ghi chú nội bộ' });
      await note.fill(`Gọi lại lúc ${viewport.width}`);
      await detail.getByRole('button', { name: 'Lưu ghi chú' }).click();
      // Saved: focus is back on the note, and the toast stays 5 seconds over the bottom right.
      await expect(page.getByText('Đã lưu ghi chú', { exact: true })).toBeVisible();
      await expect(note).toBeFocused();
      expect
        .soft(await controlsHiddenWhenFocused(page, 8), 'Leads with a toast: hidden focus')
        .toEqual([]);
      await expect(page.getByText('Đã lưu ghi chú', { exact: true })).toBeVisible();
    });
  }
});
