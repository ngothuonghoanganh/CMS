import type { ActivityItem } from '@plp/contracts';

/** Color of the dot in front of an activity: published, restored, removed or other. */
export type ActivityTone = 'success' | 'warning' | 'muted' | 'primary';

export interface ActivitySentence {
  /** Who did it, shown in bold. */
  actor: string;
  /** The rest of the sentence, e.g. "xuất bản v12 của “Ưu đãi niềng răng tháng 11”". */
  text: string;
  tone: ActivityTone;
}

function quoted(item: ActivityItem): string {
  return `“${item.page?.title ?? 'một trang'}”`;
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
    case 'lead.person_deleted':
      return {
        text:
          data.count === null
            ? 'xóa dữ liệu của một người gửi form'
            : `xóa dữ liệu của một người gửi form (${data.count} lead)`,
        tone: 'muted',
      };
  }
}

/** One line of "Hoạt động xuất bản gần đây", as on the dashboard board. */
export function activitySentence(item: ActivityItem): ActivitySentence {
  return { actor: item.actor.name, ...describe(item) };
}
