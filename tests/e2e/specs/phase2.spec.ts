import { expect, type Locator, test } from '@playwright/test';
import { AI_PRODUCT, fillAiBrief, openAiAssistant } from '../support/ai.js';
import { Editor, uploadImageInto } from '../support/editor.js';
import { fetchPublic, firstHeading } from '../support/public-site.js';
import {
  createSiteViaApi,
  newSubdomain,
  setUpLeadCaptureViaApi,
  setUpSite,
  uniqueId,
} from '../support/setup.js';
import { siteOrigin } from '../urls.js';

const SYSTEM_TEMPLATE = 'Ưu đãi dịch vụ nha khoa';
const SYSTEM_HERO_HEADING = 'Tẩy trắng răng giảm 30% cho khách hàng mới';
const EDITED = 'Tẩy trắng răng tại Smile Care, giảm 30% trong tháng 11';
const PHOTO_ALT = 'Bác sĩ tư vấn cho khách hàng';
const TEMPLATE = 'Ưu đãi tẩy trắng răng của Smile Care';
const OTHER_TEMPLATE = 'Giới thiệu phòng khám';
const OTHER_HERO_HEADING = 'Chăm sóc nụ cười cho cả gia đình bạn';
/** What the fake AI writes as the heading of a Hero it rewrites. */
const AI_HEADING = 'Tiêu đề mới';

/** The uses left this month and the monthly limit, from "Còn N/M lượt tháng này". */
async function usesLeft(line: Locator): Promise<{ left: number; limit: number }> {
  await expect(line).toBeVisible();
  const text = (await line.textContent()) ?? '';
  const match = /Còn (\d+)\/(\d+) lượt tháng này/.exec(text);
  if (match?.[1] === undefined || match[2] === undefined) {
    throw new Error(`No uses left in “${text}”`);
  }
  return { left: Number(match[1]), limit: Number(match[2]) };
}

/** Every text box of the Hero's properties, in order: the Hero's text as the editor holds it. */
function heroTexts(editor: Editor): Promise<string[]> {
  return editor.heroPanel
    .getByRole('textbox')
    .evaluateAll((boxes) =>
      boxes.map((box) =>
        box instanceof HTMLInputElement || box instanceof HTMLTextAreaElement
          ? box.value
          : box.textContent,
      ),
    );
}

/** ARCHITECTURE §5: Phase 2 is done when this whole chain passes in one go. */
test('Phase 2: system template → edit → publish → workspace template in another site with its photo → apply and undo → AI page → assistant → undo → uses spent', async ({
  page,
  request,
}) => {
  // One workspace with two sites. The template has a lead form, which needs the site's consent
  // settings and a confirmed recipient before it can be published (ADR-016, ADR-017).
  const { site } = await setUpSite(page.request);
  const kitchen = await createSiteViaApi(page.request, site.workspaceId, {
    name: 'Bếp Nhà Mây',
    subdomain: newSubdomain(),
  });
  await setUpLeadCaptureViaApi(page.request, site.id);
  const editor = new Editor(page);

  // 1. A page from a system template, its sample heading replaced and a photo added, published:
  //    the public URL serves the edited text.
  await page.goto(`/sites/${site.id}`);
  await page
    .getByRole('navigation', { name: 'Điều hướng chính' })
    .getByRole('link', { name: 'Templates', exact: true })
    .click();
  await expect(page.getByRole('heading', { level: 1, name: 'Templates' })).toBeVisible();
  await page.getByRole('combobox', { name: 'Tạo trang cho' }).selectOption(site.id);
  await page.getByRole('button', { name: `Dùng mẫu ${SYSTEM_TEMPLATE}` }).click();
  const create = page.getByRole('dialog', { name: 'Tạo trang từ mẫu' });
  await create.getByRole('textbox', { name: /Tên trang/ }).fill('Ưu đãi tẩy trắng răng tháng 11');
  await create.getByRole('textbox', { name: /^Đường dẫn/ }).fill('uu-dai');
  await expect(create.getByText('Đường dẫn này dùng được.')).toBeVisible();
  await create.getByRole('button', { name: 'Tạo bản nháp và mở editor' }).click();
  await expect(page).toHaveURL(new RegExp(`/sites/${site.id}/pages/[a-f0-9]{24}/edit$`));
  const sourceEditor = page.url();

  await expect(editor.heroCanvasHeading).toHaveText(SYSTEM_HERO_HEADING);
  await editor.setHeroHeading(EDITED);
  // The template's image frame is empty: the photo is the site's own.
  await uploadImageInto(page, editor.heroPanel, PHOTO_ALT);
  const photo = editor.canvas.getByRole('img', { name: PHOTO_ALT });
  await expect(photo).toHaveAttribute(
    'src',
    new RegExp(`/public/${site.workspaceId}/${site.id}/[a-f0-9]{24}\\.`),
  );
  await editor.expectSaved();

  await editor.publish(1, 'Bản đầu tiên');
  const v1 = await fetchPublic(request, site.subdomain, '/uu-dai');
  expect(v1.status).toBe(200);
  expect(firstHeading(v1.html)).toBe(EDITED);
  const visitor = await page.context().newPage();
  await visitor.goto(`${siteOrigin(site.subdomain)}/uu-dai`);
  await expect(visitor.getByRole('heading', { level: 1 })).toHaveText(EDITED);
  await expect(visitor.getByRole('img', { name: PHOTO_ALT })).toBeVisible();

  // 2. The page saved as a workspace template, its text and photo kept; a page made from it in
  //    Bếp Nhà Mây gets a copy of the photo, an asset of Bếp Nhà Mây.
  await editor.topBar.getByRole('button', { name: 'Thao tác khác với trang' }).click();
  await page.getByRole('menuitem', { name: 'Lưu thành template' }).click();
  const save = page.getByRole('dialog', { name: 'Lưu trang thành template' });
  // A live page is saved from its live release unless the user picks the draft.
  await expect(save.getByRole('combobox', { name: 'Lấy từ' })).toHaveValue('live');
  await save.getByRole('textbox', { name: /^Tên/ }).fill(TEMPLATE);
  await save.getByRole('radio', { name: 'Giữ chữ và ảnh như hiện tại' }).check();
  await save.getByRole('button', { name: 'Lưu template' }).click();
  await expect(
    page.getByText(`Đã lưu template “${TEMPLATE}”, phiên bản 1`, { exact: true }),
  ).toBeVisible();

  await page.goto(`/workspaces/${site.workspaceId}/templates?site=${kitchen.id}`);
  const card = page.getByRole('article', { name: TEMPLATE });
  await expect(card.getByText('WORKSPACE')).toBeVisible();
  await card.getByRole('button', { name: `Dùng mẫu ${TEMPLATE}` }).click();
  const createInKitchen = page.getByRole('dialog', { name: 'Tạo trang từ mẫu' });
  await expect(createInKitchen.getByRole('combobox', { name: 'Site' })).toHaveValue(kitchen.id);
  await createInKitchen.getByRole('textbox', { name: /Tên trang/ }).fill('Ưu đãi khai trương');
  await expect(createInKitchen.getByText('Đường dẫn này dùng được.')).toBeVisible();
  await createInKitchen.getByRole('button', { name: 'Tạo bản nháp và mở editor' }).click();
  await expect(page).toHaveURL(new RegExp(`/sites/${kitchen.id}/pages/[a-f0-9]{24}/edit$`));
  await expect(editor.heroCanvasHeading).toHaveText(EDITED);
  const copy = editor.canvas.getByRole('img', { name: PHOTO_ALT });
  await expect(copy).toBeVisible();
  // A copy in Bếp Nhà Mây's storage, never the source site's object.
  await expect(copy).toHaveAttribute(
    'src',
    new RegExp(`/public/${site.workspaceId}/${kitchen.id}/[a-f0-9]{24}\\.`),
  );
  // Bếp Nhà Mây's library holds it: it is that site's asset, not a link to Smile Care's.
  await editor.heroRow.click();
  await editor.heroPanel.getByRole('button', { name: 'Thay ảnh' }).click();
  const picker = page.getByRole('dialog', { name: 'Chọn ảnh' });
  const library = picker.getByRole('region', { name: 'Thư viện ảnh của site' });
  await expect(library.getByRole('listitem')).toHaveCount(1);
  await expect(library.getByRole('listitem')).toContainText(PHOTO_ALT);
  await page.keyboard.press('Escape');
  await expect(picker).toBeHidden();

  // 3. Another template applied to the published page's draft in the editor, then undone with
  //    Ctrl+Z: the live page serves the step 1 content throughout.
  await page.goto(sourceEditor);
  await expect(editor.heroCanvasHeading).toHaveText(EDITED);
  const before = await editor.rowTexts();
  await editor.topBar.getByRole('button', { name: 'Thao tác khác với trang' }).click();
  await page.getByRole('menuitem', { name: 'Áp dụng mẫu…' }).click();
  const apply = page.getByRole('dialog', { name: 'Áp dụng mẫu' });
  await apply.getByRole('combobox', { name: 'Mẫu' }).selectOption({ label: OTHER_TEMPLATE });
  await expect(apply.getByText(/được thay bằng 8 section của mẫu/)).toBeVisible();
  await apply.getByRole('button', { name: 'Áp dụng mẫu' }).click();
  await expect(apply).toBeHidden();
  await expect(editor.heroCanvasHeading).toHaveText(OTHER_HERO_HEADING);
  await expect(editor.canvas.getByRole('img', { name: PHOTO_ALT })).toHaveCount(0);
  await editor.expectSaved();
  expect(firstHeading((await fetchPublic(request, site.subdomain, '/uu-dai')).html)).toBe(EDITED);

  await page.keyboard.press('ControlOrMeta+z');
  await expect.poll(() => editor.rowTexts()).toEqual(before);
  await expect(editor.heroCanvasHeading).toHaveText(EDITED);
  await expect(editor.canvas.getByRole('img', { name: PHOTO_ALT })).toBeVisible();
  await editor.expectSaved();
  await page.reload();
  await expect(editor.canvas).toBeVisible();
  await expect.poll(() => editor.rowTexts()).toEqual(before);
  await expect(editor.heroCanvasHeading).toHaveText(EDITED);

  const live = await fetchPublic(request, site.subdomain, '/uu-dai');
  expect(live.status).toBe(200);
  expect(firstHeading(live.html)).toBe(EDITED);
  await visitor.reload();
  await expect(visitor.getByRole('heading', { level: 1 })).toHaveText(EDITED);
  await expect(visitor.getByRole('img', { name: PHOTO_ALT })).toBeVisible();
  await visitor.close();

  // 4. A page written by the fake AI: the checklist flags its figure for review. The assistant
  //    rewrites the Hero, the rewrite is applied, and undone.
  await page.goto(`/sites/${site.id}/pages/new`);
  await page.getByRole('link', { name: 'Tạo bằng AI' }).click();
  await expect(
    page.getByRole('heading', { level: 1, name: 'Kể cho AI về trang bạn cần' }),
  ).toBeVisible();
  const usage = await usesLeft(page.getByText(/^Còn \d+\/\d+ lượt tháng này$/));
  await fillAiBrief(page, `nieng-rang-ai-${uniqueId()}`);
  await page.getByRole('button', { name: 'Đề xuất cấu trúc trang' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Cấu trúc đề xuất' })).toBeVisible();
  await page.getByRole('button', { name: 'Viết nội dung · tốn 1 lượt' }).click();
  await expect(page).toHaveURL(new RegExp(`/sites/${site.id}/pages/[a-f0-9]{24}/edit$`));
  await expect(editor.heroCanvasHeading).toHaveText(AI_PRODUCT);

  await editor.heroRow.click();
  await expect(editor.heroPanel.getByText('AI viết · cần kiểm tra')).toBeVisible();
  const checks = await editor.openPublishDialog();
  await expect(
    checks
      .getByRole('listitem')
      .filter({ hasText: 'Câu do AI viết cần kiểm tra trong section “Hero”' }),
  ).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(checks).toBeHidden();

  const heroBefore = await heroTexts(editor);
  expect(heroBefore).toContain(AI_PRODUCT);
  const assistant = await openAiAssistant(page);
  // The page took one use of the month.
  await expect(
    assistant.getByText(`Còn ${usage.left - 1}/${usage.limit} lượt tháng này`, { exact: false }),
  ).toBeVisible();
  await assistant.getByRole('button', { name: 'Viết lại' }).click();
  const suggestion = assistant.getByRole('region', { name: 'Gợi ý cho Hero' });
  await expect(suggestion.getByText(AI_HEADING)).toBeVisible();
  // The rewrite took another; the draft is untouched until it is applied.
  await expect(
    assistant.getByText(`Còn ${usage.left - 2}/${usage.limit} lượt tháng này`, { exact: false }),
  ).toBeVisible();
  await expect(editor.heroCanvasHeading).toHaveText(AI_PRODUCT);
  await assistant.getByRole('button', { name: /^Áp dụng \d+ thay đổi$/ }).click();
  await expect(editor.heroCanvasHeading).toHaveText(AI_HEADING);
  await editor.expectSaved();

  await editor.canvas.getByRole('button', { name: 'Hoàn tác' }).click();
  await expect(editor.heroCanvasHeading).toHaveText(AI_PRODUCT);
  await editor.expectSaved();
  await page.getByRole('tab', { name: 'Thuộc tính' }).click();
  await expect.poll(() => heroTexts(editor)).toEqual(heroBefore);
  // Saved as it was before the assistant.
  await page.reload();
  await editor.heroRow.click();
  await expect.poll(() => heroTexts(editor)).toEqual(heroBefore);

  // 5. Two uses went, one for the AI page and one for the assistant's rewrite; undoing it gave none
  //    back.
  await page.goto(`/sites/${site.id}/pages/new/ai`);
  await expect(
    page.getByText(`Còn ${usage.left - 2}/${usage.limit} lượt tháng này`, { exact: true }),
  ).toBeVisible();
});
