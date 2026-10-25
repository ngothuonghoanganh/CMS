import { expect, type Locator, type Page } from '@playwright/test';

/** Locators and actions of the page editor (screen 03), by role and accessible name. */
export class Editor {
  readonly topBar: Locator;
  readonly structure: Locator;
  readonly rows: Locator;
  readonly canvas: Locator;
  readonly canvasToolbar: Locator;
  readonly saved: Locator;
  readonly heroRow: Locator;
  readonly heroPanel: Locator;
  readonly heroHeadingField: Locator;
  readonly heroCanvasHeading: Locator;
  readonly publishButton: Locator;

  constructor(readonly page: Page) {
    this.topBar = page.getByRole('banner');
    this.structure = page.getByRole('navigation', { name: 'CẤU TRÚC TRANG' });
    this.rows = this.structure.getByRole('listitem');
    this.canvas = page.getByRole('region', { name: 'Khung xem trước bản nháp' });
    this.canvasToolbar = this.canvas.getByRole('toolbar');
    this.saved = page.getByRole('status').filter({ hasText: 'Đã lưu bản nháp' });
    // The row's select button; the drag handle ("Kéo để sắp xếp Hero") is a separate button.
    this.heroRow = this.structure
      .getByRole('button', { name: /^Hero/ })
      .filter({ hasNotText: 'Kéo' })
      .first();
    this.heroPanel = page.getByRole('complementary', { name: 'Hero' });
    this.heroHeadingField = this.heroPanel.getByRole('textbox', { name: 'Tiêu đề' });
    this.heroCanvasHeading = this.canvas.getByRole('textbox', { name: 'Tiêu đề' }).first();
    this.publishButton = this.topBar.getByRole('button', { name: /^Xuất bản/ });
  }

  async goto(siteId: string, pageId: string): Promise<void> {
    await this.page.goto(`/sites/${siteId}/pages/${pageId}/edit`);
    await expect(this.canvas).toBeVisible();
  }

  /** Waits until autosave has stored every change ("Đã lưu bản nháp"). */
  async expectSaved(): Promise<void> {
    await expect(this.saved).toBeVisible();
  }

  /** Text of every structure row, in page order (section kind followed by its summary). */
  rowTexts(): Promise<string[]> {
    return this.rows.allTextContents();
  }

  /** Sets the Hero heading through the property panel and waits for autosave. */
  async setHeroHeading(text: string): Promise<void> {
    await this.heroRow.click();
    await this.heroHeadingField.fill(text);
    await this.heroHeadingField.blur();
    await expect(this.heroCanvasHeading).toHaveText(text);
    await this.expectSaved();
  }

  /** Opens the publish dialog and waits for its checks. */
  async openPublishDialog(): Promise<Locator> {
    await this.publishButton.click();
    const dialog = this.page.getByRole('dialog');
    await expect(dialog.getByRole('region', { name: 'Kiểm tra trước khi xuất bản' })).toBeVisible();
    return dialog;
  }

  /**
   * Publishes the draft from an open publish dialog: ignores every warning, adds the note and
   * waits for "vN đã live". Returns the success dialog, still open.
   */
  async publishFromDialog(dialog: Locator, version: number, note?: string): Promise<Locator> {
    const ignore = dialog.getByRole('button', { name: 'Bỏ qua lần này' });
    while ((await ignore.count()) > 0) {
      await ignore.first().click();
    }
    if (note !== undefined) {
      await dialog.getByRole('textbox', { name: 'Ghi chú cho phiên bản · tùy chọn' }).fill(note);
    }
    await dialog.getByRole('button', { name: `Xuất bản v${version}`, exact: true }).click();
    const done = this.page.getByRole('dialog', { name: `v${version} đã live` });
    await expect(done).toBeVisible();
    return done;
  }

  /** Publishes the next version, ignoring warnings, and closes the success dialog. */
  async publish(version: number, note?: string): Promise<void> {
    const dialog = await this.openPublishDialog();
    const done = await this.publishFromDialog(dialog, version, note);
    await done.getByRole('button', { name: 'Tiếp tục chỉnh sửa' }).click();
    await expect(done).toBeHidden();
  }
}
