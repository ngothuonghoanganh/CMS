import type { PageDetailResponse, TemplateSummary } from '@plp/contracts';

/** What "Áp dụng vào trang đang sửa…" says about the page picked (board 18). */
export interface ApplySummary {
  /** Under "Thay toàn bộ section": the real counts of the draft and of the template. */
  replaces: string;
  /** "Giữ nguyên". */
  keeps: string;
  /** "Hoàn tác được", or why the draft cannot be brought back. */
  undo: { title: string; text: string; tone: 'neutral' | 'warning' };
}

/**
 * The page's real numbers: its sections now, the template's, its live version. The draft is saved
 * on the server, so Ctrl+Z of the editor does not bring it back; a published version does
 * (ADR-030): "Quay về bản live", or "Sao chép vào bản nháp" of a page taken off the web.
 */
export function applySummary(
  detail: {
    draft: Pick<PageDetailResponse['draft'], 'composition'>;
    page: Pick<PageDetailResponse['page'], 'liveRelease' | 'latestVersion'>;
  },
  template: Pick<TemplateSummary, 'sections' | 'source'>,
): ApplySummary {
  const current = detail.draft.composition.sections.length;
  const next = template.sections.length;
  const sample = template.source === 'system' ? ', kèm chữ mẫu' : '';
  const replaces =
    current === 0
      ? `Bản nháp chưa có section nào; mẫu thêm ${next} section${sample}.`
      : `${current} section hiện có trong bản nháp được thay bằng ${next} section của mẫu${sample}.`;
  const live = detail.page.liveRelease;
  const keeps =
    live === null
      ? 'Tên trang, đường dẫn, SEO.'
      : `Trang live v${live.version}, tên trang, đường dẫn, SEO.`;
  if (live !== null) {
    return {
      replaces,
      keeps,
      undo: {
        title: 'Hoàn tác được',
        text: `Bằng “Quay về bản live” trong editor: bản nháp về lại bản live v${live.version}.`,
        tone: 'neutral',
      },
    };
  }
  if (detail.page.latestVersion > 0) {
    return {
      replaces,
      keeps,
      undo: {
        title: 'Hoàn tác được',
        text: 'Bằng “Sao chép vào bản nháp” ở Lịch sử phiên bản, từ một bản đã xuất bản.',
        tone: 'neutral',
      },
    };
  }
  return {
    replaces,
    keeps,
    undo: {
      title: 'Không hoàn tác được',
      text: 'Trang chưa từng xuất bản, nên bản nháp hiện tại không lấy lại được sau khi thay.',
      tone: 'warning',
    },
  };
}
