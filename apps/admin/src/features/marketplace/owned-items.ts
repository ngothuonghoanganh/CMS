import type { MarketplaceLicence, MarketplaceOwnedItem } from '@plp/contracts';
import type { DialogTemplate } from '../templates/CreateFromTemplateDialog';

/*
 * Board 32 as pure functions: what a row says about its licence and its update (ADR-036).
 */

/** "Payload · Đã mua" or "Payload · Miễn phí": every item is Payload's. */
export function licenceSourceLabel(source: MarketplaceLicence['source']): string {
  return `Payload · ${source === 'purchase' ? 'Đã mua' : 'Miễn phí'}`;
}

/** A version of the item was released after the one the licence is at. */
export function hasUpdate(item: Pick<MarketplaceOwnedItem, 'newVersions'>): boolean {
  return item.newVersions.length > 0;
}

/** The template "Tạo trang" opens the dialog for: the licence's version, never the latest. */
export function dialogTemplateOf(
  item: Pick<MarketplaceOwnedItem, 'itemId' | 'version' | 'name' | 'hasForm'>,
): DialogTemplate {
  return {
    id: item.itemId,
    source: 'marketplace',
    version: item.version,
    name: item.name,
    hasForm: item.hasForm,
  };
}

/** What the update does to the pages already made: nothing, and only new pages take the update. */
export function updateSentence(usedCount: number, latestVersion: number): string {
  const made =
    usedCount === 0
      ? 'Chưa có trang nào tạo từ mẫu này.'
      : `${usedCount} trang đã tạo từ mẫu này không đổi.`;
  return `${made} Chỉ trang tạo mới từ giờ dùng v${latestVersion}.`;
}
