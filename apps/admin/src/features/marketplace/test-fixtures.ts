import type {
  MarketplaceItemCard,
  MarketplaceLicence,
  MarketplaceOwnedItem,
  MarketplaceItemDetail,
  MarketplaceListResponse,
  MarketplaceTerms,
} from '@plp/contracts';
import { detailFixture, summaryFixture } from '../templates/test-fixtures';

// Shared by the specs of the marketplace screens: the four items of ADR-036, as the API serves
// them. Their pages borrow the sections of system templates.

export const termsFixture: MarketplaceTerms = {
  version: 1,
  summary: 'Không bán lại, cho thuê hay chia sẻ mẫu cho workspace khác.',
  licence: [
    'Giấy phép cho phép workspace đã nhận hoặc đã mua mẫu dùng mẫu để tạo trang ở mọi site của workspace đó.',
    'Giấy phép thuộc về workspace và không chuyển sang workspace khác.',
  ],
  support:
    'Payload hỗ trợ qua email trong giờ làm việc khi mẫu hiển thị sai hoặc không tạo được trang.',
  refund: 'Hoàn tiền theo chính sách của Payload',
};

function card(
  overrides: Pick<
    MarketplaceItemCard,
    'id' | 'name' | 'description' | 'goal' | 'industry' | 'price'
  >,
  template: string,
): MarketplaceItemCard {
  const { sections, hasForm } = summaryFixture(template);
  return {
    version: 1,
    releasedOn: '2026-11-21',
    sections,
    hasForm,
    owned: false,
    popularRank: 1,
    ...overrides,
  };
}

export const itemFixtures: readonly MarketplaceItemCard[] = [
  card(
    {
      id: 'mp-khai-truong-phong-tap',
      name: 'Khai trương phòng tập',
      description: 'Cho chiến dịch khai trương: ưu đãi giới hạn, lịch lớp và form giữ chỗ.',
      goal: 'event',
      industry: 'fitness',
      price: 399000,
    },
    'nha-khoa-uu-dai',
  ),
  card(
    {
      id: 'mp-mo-ban-du-an-can-ho',
      name: 'Mở bán dự án căn hộ',
      description: 'Giới thiệu dự án, tiện ích, mặt bằng và form nhận bảng giá.',
      goal: 'lead',
      industry: 'real_estate',
      price: 499000,
    },
    'nha-khoa-uu-dai',
  ),
  card(
    {
      id: 'mp-spa-uu-dai-ngay-le',
      name: 'Spa ưu đãi ngày lễ',
      description: 'Chương trình ưu đãi ngày lễ cho spa, liên hệ nhanh qua Zalo.',
      goal: 'promo',
      industry: 'spa_beauty',
      price: 299000,
    },
    'nha-khoa-uu-dai',
  ),
  card(
    {
      id: 'mp-khoa-hoc-tieng-anh-tre-em',
      name: 'Khóa học tiếng Anh trẻ em',
      description: 'Giới thiệu khóa học, lộ trình, giáo viên và form đăng ký học thử.',
      goal: 'lead',
      industry: 'education',
      price: 0,
    },
    'nha-khoa-uu-dai',
  ),
];

export function listFixture(
  overrides: Partial<MarketplaceListResponse> = {},
): MarketplaceListResponse {
  return { items: [...itemFixtures], ownedCount: 0, ...overrides };
}

export function marketplaceDetailFixture(
  overrides: Partial<MarketplaceItemDetail> = {},
): MarketplaceItemDetail {
  const [first] = itemFixtures;
  if (first === undefined) {
    throw new Error('No marketplace item fixture');
  }
  return {
    ...first,
    composition: detailFixture('nha-khoa-uu-dai').composition,
    note: 'Phiên bản đầu tiên.',
    terms: termsFixture,
    withdrawn: false,
    licence: null,
    ownerName: 'Ngọc Anh',
    ...overrides,
  };
}

export function licenceFixture(overrides: Partial<MarketplaceLicence> = {}): MarketplaceLicence {
  return {
    source: 'free',
    version: 1,
    termsVersion: 1,
    grantedAt: '2026-11-21T08:00:00.000Z',
    ...overrides,
  };
}

/** A row of board 32 for the first item, at v1 with nothing newer, made free by default. */
export function ownedItemFixture(
  overrides: Partial<MarketplaceOwnedItem> = {},
): MarketplaceOwnedItem {
  const [, , , free] = itemFixtures;
  if (free === undefined) {
    throw new Error('No marketplace item fixture');
  }
  return {
    itemId: free.id,
    name: free.name,
    source: 'free',
    version: 1,
    latestVersion: 1,
    newVersions: [],
    grantedAt: '2026-11-21T08:00:00.000Z',
    withdrawn: false,
    hasForm: free.hasForm,
    sections: free.sections,
    usedCount: 0,
    ...overrides,
  };
}
