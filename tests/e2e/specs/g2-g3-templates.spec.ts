import { expect, type Page, test } from '@playwright/test';
import {
  endpoints,
  type Site,
  type WorkspaceTemplate,
  workspaceTemplateSchema,
} from '@plp/contracts';
import { expectAccessible, expectNoSidewaysScroll, SCAN_VIEWPORTS } from '../support/axe.js';
import { publishViaApi, saveDraftViaApi, uploadImageViaApi } from '../support/board.js';
import { Editor } from '../support/editor.js';
import { fetchPublic, firstHeading } from '../support/public-site.js';
import {
  call,
  createPageViaApi,
  createSiteViaApi,
  newSubdomain,
  promoPage,
  setUpLeadCaptureViaApi,
  setUpSite,
  uniqueId,
} from '../support/setup.js';

/*
 * G2 and G3 (ADR-030): a page saved as a workspace template (board 19), a page made from it in
 * another site with a copy of its photo, archiving it; a template applied to a draft from board 18,
 * and in the editor as one step that Ctrl+Z takes back. Who may do what, versions, limits and
 * isolation are the API's integration tests.
 */

const TEMPLATE = 'Tư vấn niềng răng trả góp';
const PHOTO_ALT = 'Bác sĩ tư vấn cho khách hàng';
const OFFER = 'Niềng răng trong suốt giảm 30%';
const SYSTEM_TEMPLATE = 'Ưu đãi dịch vụ nha khoa';
const SYSTEM_HERO_HEADING = 'Tẩy trắng răng giảm 30% cho khách hàng mới';

function workspaceTemplates(workspaceId: string, archived = false): string {
  return `/workspaces/${workspaceId}/templates?source=workspace${archived ? '&archived=1' : ''}`;
}

/** A promotion whose Hero shows an uploaded photo beside its text. */
async function pageWithPhoto(page: Page, site: Site) {
  const photo = await uploadImageViaApi(page.request, site.id, PHOTO_ALT);
  const created = await createPageViaApi(
    page.request,
    site.id,
    promoPage(`nieng-${uniqueId()}`, OFFER),
  );
  await saveDraftViaApi(page.request, created.page, (draft) => ({
    composition: {
      ...draft.composition,
      sections: draft.composition.sections.map((section) =>
        section.type === 'hero'
          ? {
              ...section,
              variant: 'split',
              content: {
                ...section.content,
                image: { assetId: photo.id, alt: PHOTO_ALT, decorative: false },
              },
            }
          : section,
      ),
    },
  }));
  return created;
}

/** "Lưu trang thành template" through the API: v1 of a template for every site, texts kept. */
function saveTemplateViaApi(page: Page, site: Site, pageId: string): Promise<WorkspaceTemplate> {
  return call(
    page.request,
    'POST',
    endpoints.createWorkspaceTemplate.path(site.workspaceId),
    workspaceTemplateSchema,
    {
      source: { siteId: site.id, pageId, kind: 'draft' },
      content: 'keep',
      note: 'Bản đầu tiên',
      name: TEMPLATE,
      description: 'Bản đã dùng cho Smile Care.',
      goal: 'lead',
      industry: 'dental_health',
      scope: { kind: 'workspace' },
    },
  );
}

test.describe('G2 · G3 · Workspace templates and applying a template', () => {
  test('saves a page as a template, makes a page from it in another site with its photo, then archives it', async ({
    page,
  }) => {
    const { site } = await setUpSite(page.request);
    const kitchen = await createSiteViaApi(page.request, site.workspaceId, {
      name: 'Bếp Nhà Mây',
      subdomain: newSubdomain(),
    });
    const source = await pageWithPhoto(page, site);

    // Board 19, from the library's tab "Của workspace".
    await page.goto(`/workspaces/${site.workspaceId}/templates`);
    await page
      .getByRole('navigation', { name: 'Nguồn mẫu' })
      .getByRole('link', { name: 'Của workspace · 0' })
      .click();
    await expect(
      page.getByRole('heading', { level: 1, name: 'Template của workspace' }),
    ).toBeVisible();
    await expect(page.getByText('Chưa có template nội bộ')).toBeVisible();

    await page.getByRole('button', { name: 'Lưu trang thành template' }).first().click();
    const save = page.getByRole('dialog', { name: 'Lưu trang thành template' });
    await save.getByRole('combobox', { name: 'Site' }).selectOption(site.id);
    await save.getByRole('combobox', { name: 'Trang nguồn' }).selectOption(source.page.id);
    // A page that was never published has its draft only.
    await expect(save.getByRole('combobox', { name: 'Lấy từ' })).toHaveValue('draft');
    await expect(save.getByRole('img', { name: /^Ảnh thu nhỏ vẽ từ trang/ })).toBeVisible();
    await save.getByRole('textbox', { name: /^Tên/ }).fill(TEMPLATE);
    await save.getByRole('radio', { name: 'Giữ chữ và ảnh như hiện tại' }).check();
    await save.getByRole('button', { name: 'Lưu template' }).click();
    await expect(page.getByText(`Đã lưu template “${TEMPLATE}”, phiên bản 1`)).toBeVisible();
    const inUse = page.getByRole('table', { name: 'Template đang dùng' });
    await expect(inUse.getByRole('link', { name: TEMPLATE })).toBeVisible();
    await expect(inUse.getByRole('row').nth(1)).toContainText('Toàn workspace');

    // The library lists it with its source; a page made from it in Bếp Nhà Mây gets the photo.
    await page.goto(`/workspaces/${site.workspaceId}/templates?site=${kitchen.id}`);
    const card = page.getByRole('article', { name: TEMPLATE });
    await expect(card.getByText('WORKSPACE')).toBeVisible();
    await card.getByRole('button', { name: `Dùng mẫu ${TEMPLATE}` }).click();
    const create = page.getByRole('dialog', { name: 'Tạo trang từ mẫu' });
    await expect(create.getByRole('combobox', { name: 'Site' })).toHaveValue(kitchen.id);
    await create.getByRole('textbox', { name: /Tên trang/ }).fill(`Niềng răng ${uniqueId()}`);
    await expect(create.getByText('Đường dẫn này dùng được.')).toBeVisible();
    await create.getByRole('button', { name: 'Tạo bản nháp và mở editor' }).click();
    await expect(page).toHaveURL(new RegExp(`/sites/${kitchen.id}/pages/[a-f0-9]{24}/edit$`));
    const photo = new Editor(page).canvas.getByRole('img', { name: PHOTO_ALT });
    await expect(photo).toBeVisible();
    // A copy of its own, in Bếp Nhà Mây's storage, never the source site's object.
    await expect(photo).toHaveAttribute(
      'src',
      new RegExp(`/public/${site.workspaceId}/${kitchen.id}/[a-f0-9]{24}\\.`),
    );

    // "Lưu trữ" takes it out of the library; pages made from it stay.
    await page.goto(workspaceTemplates(site.workspaceId));
    await page
      .getByRole('button', { name: `Sửa thông tin, nhân bản hoặc lưu trữ ${TEMPLATE}` })
      .click();
    await page.getByRole('menuitem', { name: 'Lưu trữ' }).click();
    await expect(page.getByText(`Đã lưu trữ “${TEMPLATE}”`)).toBeVisible();
    await expect(page.getByRole('link', { name: 'Lưu trữ · 1' })).toBeVisible();
    await page.goto(`/workspaces/${site.workspaceId}/templates?site=${kitchen.id}`);
    await expect(page.getByRole('article').first()).toBeVisible();
    await expect(page.getByRole('article', { name: TEMPLATE })).toHaveCount(0);
  });

  test('applies a template to a page from board 18, and the editor opens on it', async ({
    page,
  }) => {
    const { site } = await setUpSite(page.request);
    const created = await createPageViaApi(
      page.request,
      site.id,
      promoPage(`uu-dai-${uniqueId()}`, OFFER),
    );
    await page.goto(`/workspaces/${site.workspaceId}/templates/nha-khoa-uu-dai?site=${site.id}`);
    await page.getByRole('button', { name: 'Áp dụng vào trang đang sửa…' }).click();
    const dialog = page.getByRole('dialog', { name: 'Áp dụng mẫu vào trang đang sửa' });
    await expect(dialog.getByRole('combobox', { name: 'Trang' })).toHaveValue(created.page.id);
    // Only "Thay toàn bộ section" (ADR-030), with the draft's and the template's real counts.
    await expect(dialog.getByRole('radio', { name: 'Thay toàn bộ section' })).toBeChecked();
    await expect(dialog.getByRole('radio')).toHaveCount(1);
    await expect(
      dialog.getByText(
        `${created.draft.composition.sections.length} section hiện có trong bản nháp được thay bằng 8 section của mẫu, kèm chữ mẫu.`,
      ),
    ).toBeVisible();
    const boxes = dialog.getByRole('status').filter({ hasText: 'Giữ nguyên' });
    await expect(boxes).toContainText('Tên trang, đường dẫn, SEO.');
    await expect(boxes).toContainText('Không hoàn tác được');

    await dialog.getByRole('button', { name: 'Thay bản nháp và mở editor' }).click();
    await expect(page).toHaveURL(new RegExp(`/sites/${site.id}/pages/${created.page.id}/edit$`));
    const editor = new Editor(page);
    await expect(editor.canvas.getByText(SYSTEM_HERO_HEADING)).toBeVisible();
    await expect(page.getByRole('heading', { level: 1, name: created.page.title })).toBeVisible();
  });

  test('applies a template in the editor as one step Ctrl+Z takes back, the live page unchanged', async ({
    page,
    request,
  }) => {
    const { site } = await setUpSite(page.request);
    await setUpLeadCaptureViaApi(page.request, site.id);
    const slug = `uu-dai-${uniqueId()}`;
    const created = await createPageViaApi(page.request, site.id, promoPage(slug, OFFER));
    await publishViaApi(page.request, created.page, 'Bản đầu tiên');
    const liveHeading = firstHeading((await fetchPublic(request, site.subdomain, `/${slug}`)).html);
    expect(liveHeading).not.toBeNull();

    const editor = new Editor(page);
    await editor.goto(site.id, created.page.id);
    const before = await editor.rowTexts();
    await editor.topBar.getByRole('button', { name: 'Thao tác khác với trang' }).click();
    await page.getByRole('menuitem', { name: 'Áp dụng mẫu…' }).click();
    const dialog = page.getByRole('dialog', { name: 'Áp dụng mẫu' });
    await dialog.getByRole('combobox', { name: 'Mẫu' }).selectOption({ label: SYSTEM_TEMPLATE });
    await expect(dialog.getByText(/được thay bằng 8 section của mẫu/)).toBeVisible();
    await dialog.getByRole('button', { name: 'Áp dụng mẫu' }).click();
    await expect(dialog).toBeHidden();
    await expect(editor.canvas.getByText(SYSTEM_HERO_HEADING)).toBeVisible();
    await expect(
      page.getByText(`Đã áp dụng mẫu “${SYSTEM_TEMPLATE}”. Nhấn Ctrl+Z để hoàn tác.`),
    ).toBeAttached();
    await editor.expectSaved();

    // One undo step brings every section back, and autosave stores it.
    await page.keyboard.press('ControlOrMeta+z');
    await expect.poll(() => editor.rowTexts()).toEqual(before);
    await expect(editor.canvas.getByText(SYSTEM_HERO_HEADING)).toHaveCount(0);
    await editor.expectSaved();
    await page.reload();
    await expect(editor.canvas).toBeVisible();
    await expect.poll(() => editor.rowTexts()).toEqual(before);

    // Neither applying nor undoing touched the live page.
    expect(firstHeading((await fetchPublic(request, site.subdomain, `/${slug}`)).html)).toBe(
      liveHeading,
    );
  });

  test('previews an earlier version from the version history, with nothing made from it', async ({
    page,
  }) => {
    const { site } = await setUpSite(page.request);
    const source = await pageWithPhoto(page, site);
    const template = await saveTemplateViaApi(page, site, source.page.id);
    await call(
      page.request,
      'POST',
      endpoints.createTemplateVersion.path(site.workspaceId, template.id),
      workspaceTemplateSchema,
      {
        source: { siteId: site.id, pageId: source.page.id, kind: 'draft' },
        content: 'sample',
        note: 'Chữ mẫu',
        name: TEMPLATE,
        baseVersion: 1,
      },
    );

    await page.goto(workspaceTemplates(site.workspaceId));
    await page.getByRole('button', { name: `Phiên bản của ${TEMPLATE}` }).click();
    const versions = page.getByRole('dialog', { name: TEMPLATE });
    await versions.getByRole('link', { name: 'Xem trước v1' }).click();
    await expect(page).toHaveURL(new RegExp(`/templates/${template.id}\\?site=${site.id}&version=1$`));
    // Board 18 in "Bạn đang xem v1": the photo of v1, and no way to make a page from it.
    await expect(page.getByText('Bạn đang xem v1. Trang mới được tạo từ phiên bản đang dùng, v2.')).toBeVisible();
    await expect(page.getByText(/^v1 · cập nhật /)).toBeVisible();
    const preview = page.getByRole('region', { name: /^Bản xem trước/ });
    await expect(preview.getByRole('img', { name: PHOTO_ALT })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Tạo trang từ mẫu' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Áp dụng vào trang đang sửa…' })).toHaveCount(0);

    await page.getByRole('link', { name: 'Xem v2' }).click();
    await expect(page).toHaveURL(new RegExp(`/templates/${template.id}\\?site=${site.id}$`));
    await expect(page.getByText(/^v2 · cập nhật /)).toBeVisible();
    // v2 marked every text as sample, which empties the image frames.
    await expect(preview.getByRole('img', { name: PHOTO_ALT })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Tạo trang từ mẫu' })).toBeVisible();
  });

  test('board 18’s dialogs reflow at 320 px, the page address in full', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 640 });
    const { site } = await setUpSite(page.request);
    await createPageViaApi(page.request, site.id, promoPage(`uu-dai-${uniqueId()}`, OFFER));
    await page.goto(`/workspaces/${site.workspaceId}/templates/nha-khoa-uu-dai?site=${site.id}`);

    await page.getByRole('button', { name: 'Áp dụng vào trang đang sửa…' }).click();
    const apply = page.getByRole('dialog', { name: 'Áp dụng mẫu vào trang đang sửa' });
    await expect(apply.getByRole('status').filter({ hasText: 'Giữ nguyên' })).toBeVisible();
    await expectNoSidewaysScroll(page, 'Áp dụng mẫu vào trang đang sửa at 320 px', apply);
    await page.keyboard.press('Escape');
    await expect(apply).toBeHidden();

    // The site's address takes its own line rather than squeeze the page's to a few characters.
    await page.getByRole('button', { name: 'Tạo trang từ mẫu' }).click();
    const create = page.getByRole('dialog', { name: 'Tạo trang từ mẫu' });
    const slug = create.getByRole('textbox', { name: /^Đường dẫn/ });
    await expect(slug).toHaveValue('uu-dai-dich-vu-nha-khoa');
    await expectNoSidewaysScroll(page, 'Tạo trang từ mẫu at 320 px', create);
    expect(await slug.evaluate((input) => input.clientWidth)).toBeGreaterThanOrEqual(200);
  });

  for (const viewport of SCAN_VIEWPORTS) {
    test(`board 19, its dialogs and the apply dialogs are accessible at ${viewport.width} px`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      const { site } = await setUpSite(page.request);
      const source = await pageWithPhoto(page, site);
      await saveTemplateViaApi(page, site, source.page.id);

      await page.goto(workspaceTemplates(site.workspaceId));
      await expect(page.getByRole('table', { name: 'Template đang dùng' })).toBeVisible();
      await expectAccessible(page, 'Template của workspace');
      await expectNoSidewaysScroll(page, 'Template của workspace');

      await page.getByRole('button', { name: 'Lưu trang thành template' }).click();
      const save = page.getByRole('dialog', { name: 'Lưu trang thành template' });
      await expect(save.getByRole('combobox', { name: 'Lấy từ' })).toBeEnabled();
      await expectAccessible(page, 'Lưu trang thành template');
      await page.keyboard.press('Escape');
      await expect(save).toBeHidden();

      await page.getByRole('button', { name: `Phiên bản của ${TEMPLATE}` }).click();
      const versions = page.getByRole('dialog', { name: TEMPLATE });
      await expect(versions.getByRole('listitem').first()).toContainText('ĐANG DÙNG');
      await expectAccessible(page, 'Lịch sử phiên bản template');
      await page.keyboard.press('Escape');

      await page.goto(`/workspaces/${site.workspaceId}/templates/nha-khoa-uu-dai?site=${site.id}`);
      await page.getByRole('button', { name: 'Áp dụng vào trang đang sửa…' }).click();
      const apply = page.getByRole('dialog', { name: 'Áp dụng mẫu vào trang đang sửa' });
      await expect(apply.getByRole('status').filter({ hasText: 'Giữ nguyên' })).toBeVisible();
      await expectAccessible(page, 'Áp dụng mẫu vào trang đang sửa');

      const editor = new Editor(page);
      await editor.goto(site.id, source.page.id);
      await editor.topBar.getByRole('button', { name: 'Thao tác khác với trang' }).click();
      await page.getByRole('menuitem', { name: 'Áp dụng mẫu…' }).click();
      const inEditor = page.getByRole('dialog', { name: 'Áp dụng mẫu' });
      await expect(inEditor.getByRole('combobox', { name: 'Mẫu' })).toBeVisible();
      await expectAccessible(page, 'Áp dụng mẫu trong editor');
    });
  }
});
