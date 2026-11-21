import type {
  MarketplaceItemChangedProblemContext,
  MarketplaceItemNotFreeProblemContext,
  TemplateChangedProblemContext,
} from '@plp/contracts';
import { AppError } from '../../shared/errors.js';

/*
 * The problems of claiming a marketplace item and updating its licence (ADR-036, MP2).
 */

/** 409 `item_not_free`: an item with a price is bought by Chủ sở hữu, not claimed. */
export function itemNotFree(name: string, price: number): AppError {
  return new AppError(409, 'item_not_free', `Mẫu “${name}” là mẫu trả phí`, {
    detail: 'Chỉ nhận được mẫu miễn phí. Mẫu trả phí do Chủ sở hữu mua ở Marketplace.',
    context: { price } satisfies MarketplaceItemNotFreeProblemContext,
  });
}

/**
 * 409 `item_changed`: the version, the price or the terms are not what the member saw and agreed
 * to. Nothing was granted; the admin shows the item again and asks again.
 */
export function itemChanged(name: string, current: MarketplaceItemChangedProblemContext): AppError {
  return new AppError(409, 'item_changed', `Mẫu “${name}” vừa thay đổi`, {
    detail: 'Phiên bản, giá hoặc điều khoản đã khác lúc bạn xem. Xem lại mẫu rồi thử lại.',
    context: current,
  });
}

/**
 * 409 `template_changed` with the licence's version: another member updated the licence after
 * the dialog read it. The admin reads the list again, with the notes from that version.
 */
export function licenceChanged(name: string, licenceVersion: number): AppError {
  return new AppError(
    409,
    'template_changed',
    `Mẫu “${name}” vừa được cập nhật lên v${licenceVersion}`,
    {
      detail: 'Xem lại các phiên bản mới rồi thử lại.',
      context: { currentVersion: licenceVersion } satisfies TemplateChangedProblemContext,
    },
  );
}
