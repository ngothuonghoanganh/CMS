import type { ActivityItem } from '@plp/contracts';

/** Color of the dot in front of an activity: published, restored, removed or other. */
export type ActivityTone = 'success' | 'warning' | 'muted' | 'primary';

export interface ActivitySentence {
  /** Who did it, shown in bold: a member, or "Hệ thống" for the domain checks (ADR-022). */
  actor: string;
  /** The rest of the sentence, e.g. "xuất bản v12 của “Ưu đãi niềng răng tháng 11”". */
  text: string;
  tone: ActivityTone;
}

/**
 * The page's title as it was then. An earlier event of a page deleted since says so (ADR-027);
 * the deletion itself does already.
 */
function quoted(item: ActivityItem): string {
  const title = `“${item.page?.title ?? 'một trang'}”`;
  return item.page?.deleted === true && item.type !== 'page.deleted'
    ? `${title} (trang đã xóa)`
    : title;
}

function versionLabel(version: number | null): string {
  return version === null ? '' : `v${version} `;
}

function describe(item: ActivityItem): Omit<ActivitySentence, 'actor'> {
  const { data } = item;
  switch (item.type) {
    case 'page.published':
      return {
        text:
          data.version === null
            ? `xuất bản ${quoted(item)}`
            : `xuất bản v${data.version} của ${quoted(item)}`,
        tone: 'success',
      };
    case 'page.rolled_back':
      return {
        text:
          data.fromVersion !== null && data.toVersion !== null
            ? `khôi phục ${quoted(item)} từ v${data.fromVersion} về v${data.toVersion}`
            : `khôi phục ${quoted(item)}`,
        tone: 'warning',
      };
    case 'page.rollback_undone':
      return { text: `hoàn tác khôi phục ${quoted(item)}`, tone: 'warning' };
    case 'page.unpublished':
      return { text: `gỡ xuất bản ${quoted(item)}`, tone: 'muted' };
    case 'page.created':
      return { text: `tạo trang ${quoted(item)}`, tone: 'primary' };
    case 'page.created_from_template':
      // "từ mẫu “Ưu đãi dịch vụ nha khoa” v1" (ADR-030).
      return {
        text:
          data.template === null
            ? `tạo trang ${quoted(item)} từ mẫu`
            : `tạo trang ${quoted(item)} từ mẫu “${data.template}”${data.version === null ? '' : ` v${data.version}`}`,
        tone: 'primary',
      };
    case 'page.template_applied':
      // "áp dụng mẫu “Ưu đãi dịch vụ nha khoa” vào bản nháp của “…”" (ADR-030).
      return {
        text:
          data.template === null
            ? `áp dụng mẫu vào bản nháp của ${quoted(item)}`
            : `áp dụng mẫu “${data.template}” vào bản nháp của ${quoted(item)}`,
        tone: 'primary',
      };
    case 'template.saved':
      // "lưu template “Tư vấn niềng răng trả góp”, phiên bản 3 từ trang “…”" (ADR-030).
      return {
        text: `lưu template “${data.template ?? ''}”${data.version === null ? '' : `, phiên bản ${data.version}`} từ trang ${quoted(item)}`,
        tone: 'primary',
      };
    case 'page.deleted':
      return { text: `xóa trang ${quoted(item)}`, tone: 'muted' };
    case 'page.draft_restored':
      return {
        text: `sao chép ${versionLabel(data.version)}vào bản nháp của ${quoted(item)}`,
        tone: 'primary',
      };
    case 'site.created':
      return { text: 'tạo site', tone: 'primary' };
    case 'asset.uploaded':
      return { text: 'tải ảnh lên', tone: 'primary' };
    case 'privacy.updated':
      return { text: 'cập nhật cài đặt dữ liệu cá nhân', tone: 'primary' };
    case 'consent.version_created':
      return {
        text:
          data.version === null
            ? 'lưu nội dung đồng ý mới'
            : `lưu nội dung đồng ý bản ${data.version}`,
        tone: 'primary',
      };
    case 'lead.exported':
      return {
        text: data.count === null ? 'xuất dữ liệu lead' : `xuất dữ liệu ${data.count} lead`,
        tone: 'primary',
      };
    case 'lead.recipients_changed':
      return {
        text:
          data.count === null
            ? 'đổi nơi nhận lead'
            : `đổi nơi nhận lead (còn ${data.count} địa chỉ)`,
        tone: 'primary',
      };
    case 'lead.person_deleted':
      return {
        text:
          data.count === null
            ? 'xóa dữ liệu của một người gửi form'
            : `xóa dữ liệu của một người gửi form (${data.count} lead)`,
        tone: 'muted',
      };
    case 'data_request.created':
      return { text: 'ghi nhận một yêu cầu về dữ liệu', tone: 'primary' };
    case 'data_request.completed':
      return {
        text:
          data.count === null
            ? 'hoàn tất một yêu cầu về dữ liệu'
            : `hoàn tất một yêu cầu về dữ liệu (${data.count} lead)`,
        tone: 'success',
      };
    case 'domain.added':
      return { text: `thêm tên miền ${host(item)}`, tone: 'primary' };
    case 'domain.removed':
      return { text: `ngắt kết nối ${host(item)}`, tone: 'muted' };
    case 'domain.primary_changed':
      return { text: `đặt ${host(item)} làm địa chỉ chính`, tone: 'primary' };
    case 'domain.activated':
      return { text: `cấp chứng chỉ HTTPS cho ${host(item)}`, tone: 'primary' };
    case 'domain.lost':
      return { text: `phát hiện ${host(item)} mất kết nối`, tone: 'warning' };
    case 'automation.enabled':
      return { text: 'bật một automation', tone: 'success' };
    case 'automation.paused':
      return { text: 'tạm dừng một automation', tone: 'muted' };
    case 'automation.auto_paused':
      return { text: 'tạm dừng một automation sau 20 lượt lỗi liên tiếp', tone: 'warning' };
  }
}

/** The domain of a domain event; every one stores it (ADR-022). */
function host(item: ActivityItem): string {
  return item.data.hostname ?? 'một tên miền';
}

/** Who did the events the domain checks record on their own. */
export const SYSTEM_ACTOR = 'Hệ thống';

/** One line of "Hoạt động xuất bản gần đây", as on the dashboard board. */
export function activitySentence(item: ActivityItem): ActivitySentence {
  return { actor: item.actor?.name ?? SYSTEM_ACTOR, ...describe(item) };
}
