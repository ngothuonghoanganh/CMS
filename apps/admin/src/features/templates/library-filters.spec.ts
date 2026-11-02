import { describe, expect, it } from 'vitest';
import {
  emptyMessage,
  filterChips,
  filterGroups,
  type LibraryQuery,
  matchesQuery,
  NO_FILTERS,
  tabCounts,
  tabOf,
  visibleTemplates,
  withGoal,
  withIndustry,
} from './library-filters';
import { summaryFixture, templateSummaries } from './test-fixtures';

const ALL: LibraryQuery = { tab: 'all', query: '', filters: NO_FILTERS };

function names(query: Partial<LibraryQuery>): string[] {
  return visibleTemplates(templateSummaries, { ...ALL, ...query }).map((item) => item.name);
}

describe('tabs', () => {
  it('reads the tab of `?source=`, "Tất cả" for anything else', () => {
    expect(tabOf('system')).toBe('system');
    expect(tabOf(undefined)).toBe('all');
    expect(tabOf('all')).toBe('all');
    expect(tabOf('marketplace')).toBe('all');
  });

  it('counts the templates of each tab', () => {
    expect(tabCounts(templateSummaries)).toEqual({ all: 12, system: 12 });
    expect(names({ tab: 'system' })).toHaveLength(12);
  });
});

describe('search', () => {
  it('ignores accents and case, in names, descriptions, industries and goals', () => {
    const dental = summaryFixture('nha-khoa-uu-dai');
    expect(matchesQuery(dental, 'UU DAI nha khoa')).toBe(true);
    expect(matchesQuery(dental, 'bác sĩ')).toBe(true);
    expect(matchesQuery(dental, 'y te')).toBe(true);
    expect(matchesQuery(dental, 'thu lead')).toBe(true);
    expect(matchesQuery(dental, 'webinar')).toBe(false);
    expect(matchesQuery(dental, '   ')).toBe(true);
  });

  it('matches whole words, the last one as it is being typed', () => {
    // "cảm nhận" and "Khóa học" hold "nha" and "khoa", but not as words.
    expect(names({ query: 'nha khoa' })).toEqual([
      'Ưu đãi dịch vụ nha khoa',
      'Giới thiệu phòng khám',
    ]);
    expect(names({ query: 'nha kho' })).toEqual([
      'Ưu đãi dịch vụ nha khoa',
      'Giới thiệu phòng khám',
    ]);
    // The goal "Sự kiện / webinar" holds the word too.
    expect(names({ query: 'webin' })).toEqual(['Webinar trực tuyến', 'Sự kiện mở bán dự án']);
    expect(names({ query: 'F&B' })).toEqual([
      'Thực đơn mới & đặt bàn',
      'Danh sách chờ ngày khai trương',
    ]);
  });

  it('finds the templates of an industry by its name', () => {
    expect(names({ query: 'the hinh' })).toEqual([
      'Ưu đãi khai trương phòng tập',
      'Gói tập cá nhân với huấn luyện viên',
    ]);
  });
});

describe('filters', () => {
  it('keeps any checked goal and any checked industry, and both groups at once', () => {
    expect(names({ filters: withGoal(NO_FILTERS, 'event', true) })).toEqual([
      'Webinar trực tuyến',
      'Sự kiện mở bán dự án',
    ]);
    const both = withIndustry(withGoal(NO_FILTERS, 'lead', true), 'spa_beauty', true);
    expect(names({ filters: both })).toEqual(['Đặt lịch spa & làm đẹp']);
    expect(names({ filters: withIndustry(both, 'education', true) })).toEqual([
      'Đặt lịch spa & làm đẹp',
      'Khóa học tiếng Anh trẻ em',
    ]);
  });

  it('keeps only templates with the lead form for "Có form thu lead"', () => {
    const withForm = visibleTemplates(templateSummaries, {
      ...ALL,
      filters: { ...NO_FILTERS, withForm: true },
    });
    expect(withForm.every((item) => item.hasForm)).toBe(true);
    expect(withForm).toHaveLength(templateSummaries.filter((item) => item.hasForm).length);
  });

  it('counts each option with the choices of the other groups', () => {
    const groups = filterGroups(templateSummaries, ALL);
    expect(groups.goals.map(({ label, count }) => [label, count])).toEqual([
      ['Thu lead tư vấn', 3],
      ['Ưu đãi có thời hạn', 2],
      ['Sự kiện / webinar', 2],
      ['Giới thiệu dịch vụ', 2],
      ['Danh sách chờ', 2],
      ['Giới thiệu doanh nghiệp', 1],
    ]);
    expect(groups.industries.map(({ count }) => count)).toEqual([2, 2, 2, 2, 2, 2]);

    // With "Bất động sản" checked, goals count within it; industries still count every one.
    const realEstate = filterGroups(templateSummaries, {
      ...ALL,
      filters: withIndustry(NO_FILTERS, 'real_estate', true),
    });
    expect(realEstate.goals.filter((option) => option.count > 0).map((o) => o.value)).toEqual([
      'event',
      'waitlist',
    ]);
    expect(realEstate.industries.find((option) => option.checked)?.value).toBe('real_estate');
    expect(realEstate.industries.map(({ count }) => count)).toEqual([2, 2, 2, 2, 2, 2]);
    expect(realEstate.withForm).toEqual({ count: 2, checked: false });
  });

  it('counts within the search', () => {
    const groups = filterGroups(templateSummaries, { ...ALL, query: 'spa' });
    expect(groups.industries.find((option) => option.value === 'spa_beauty')?.count).toBe(2);
    expect(groups.industries.find((option) => option.value === 'fitness')?.count).toBe(0);
  });
});

describe('chips', () => {
  it('lists every choice and removes exactly that one', () => {
    const filters = {
      goals: ['event' as const],
      industries: ['real_estate' as const],
      withForm: true,
    };
    const chips = filterChips(filters);
    expect(chips.map((chip) => chip.label)).toEqual([
      'Sự kiện / webinar',
      'Bất động sản',
      'Có form thu lead',
    ]);
    expect(chips[0]?.without).toEqual({ ...filters, goals: [] });
    expect(chips[1]?.without).toEqual({ ...filters, industries: [] });
    expect(chips[2]?.without).toEqual({ ...filters, withForm: false });
    expect(filterChips(NO_FILTERS)).toEqual([]);
  });
});

describe('the empty list', () => {
  it('names the goal and the industry, as board 17 does', () => {
    expect(
      emptyMessage({
        query: '',
        filters: withIndustry(withGoal(NO_FILTERS, 'about', true), 'real_estate', true),
      }),
    ).toEqual({
      title: 'Chưa có mẫu “Giới thiệu doanh nghiệp” cho ngành Bất động sản',
      description: 'Thử bỏ bớt một bộ lọc hoặc đổi từ khóa tìm kiếm.',
    });
  });

  it('names the search, or the filters, otherwise', () => {
    expect(emptyMessage({ query: ' karaoke ', filters: NO_FILTERS })).toEqual({
      title: 'Không có mẫu nào khớp “karaoke”',
      description: 'Thử một từ khóa khác, ví dụ tên ngành hay mục tiêu của trang.',
    });
    expect(
      emptyMessage({
        query: '',
        filters: { ...withGoal(NO_FILTERS, 'about', true), withForm: true },
      }).title,
    ).toBe('Không có mẫu nào khớp bộ lọc');
  });
});
