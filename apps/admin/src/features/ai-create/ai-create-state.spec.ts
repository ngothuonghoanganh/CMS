import { describe, expect, it } from 'vitest';
import {
  addBlockedReason,
  type AiCreateAction,
  aiCreateReducer,
  type AiCreateState,
  buildAiJobRequest,
  canShift,
  descriptionOf,
  initialAiCreateState,
  isChoosingMotion,
  motionChoiceLabel,
  motionNoteOf,
} from './ai-create-state';

function run(actions: AiCreateAction[], state = initialAiCreateState()): AiCreateState {
  return actions.reduce(aiCreateReducer, state);
}

const BRIEF: AiCreateAction[] = [
  { type: 'brief_changed', field: 'product', value: 'Niềng răng trong suốt Invisalign' },
  { type: 'brief_changed', field: 'audience', value: 'Người đi làm 22–35 tuổi ở TP.HCM' },
  { type: 'brief_changed', field: 'differentiators', value: 'Bác sĩ 12 năm kinh nghiệm.' },
];

function namesOf(state: AiCreateState): string[] {
  return state.structure.map((entry) => entry.name);
}

describe('the brief of "Tạo trang bằng AI" (board 20)', () => {
  it('names the page after the product, and its path after the name, until edited', () => {
    let state = run(BRIEF);
    expect(state).toMatchObject({
      title: 'Niềng răng trong suốt Invisalign',
      slug: 'nieng-rang-trong-suot-invisalign',
    });
    state = run([{ type: 'title_changed', title: 'Ưu đãi niềng răng' }], state);
    expect(state.slug).toBe('uu-dai-nieng-rang');
    state = run(
      [
        { type: 'slug_changed', slug: 'nieng-rang' },
        { type: 'title_changed', title: 'Niềng răng tháng 11' },
        { type: 'brief_changed', field: 'product', value: 'Tẩy trắng răng' },
      ],
      state,
    );
    expect(state).toMatchObject({ title: 'Niềng răng tháng 11', slug: 'nieng-rang' });
  });

  it('says what is missing, field by field, in the contract’s words', () => {
    const built = buildAiJobRequest(run([{ type: 'slug_changed', slug: 'api' }]));
    expect(built).toEqual({
      ok: false,
      errors: {
        title: 'Nhập tên trang',
        slug: 'Đường dẫn này được hệ thống giữ lại',
        product: 'Nhập sản phẩm hoặc dịch vụ',
        audience: 'Nhập khách hàng mục tiêu',
        differentiators: 'Nhập điểm khác biệt và thông điệp chính',
      },
    });
  });

  it('builds the request of the job: the brief, tone, language and structure in order', () => {
    const state = run([
      ...BRIEF,
      { type: 'goal_selected', goal: 'event' },
      { type: 'tone_selected', tone: 'professional' },
      { type: 'language_selected', language: 'en' },
      { type: 'brief_changed', field: 'existingContent', value: 'Bảng giá 2026' },
      { type: 'structure_proposed' },
    ]);
    const built = buildAiJobRequest(state);
    if (!built.ok) {
      throw new Error(JSON.stringify(built.errors));
    }
    expect(built.request).toMatchObject({
      title: 'Niềng răng trong suốt Invisalign',
      slug: 'nieng-rang-trong-suot-invisalign',
      brief: {
        goal: 'event',
        tone: 'professional',
        language: 'en',
        existingContent: 'Bảng giá 2026',
      },
    });
    expect(built.request.structure).toEqual(
      state.structure.map(({ type, variant }) => ({ type, variant })),
    );
  });
});

describe('the proposed structure', () => {
  it('comes from the goal’s blueprint, each section described for what it is', () => {
    const state = run([{ type: 'structure_proposed' }]);
    expect(state.step).toBe('structure');
    expect(namesOf(state)).toEqual([
      'Thanh điều hướng + nút liên hệ',
      'Hero + nút đặt lịch',
      'Lợi ích chính',
      'Cảm nhận khách hàng',
      'Câu hỏi thường gặp',
      'Form đăng ký tư vấn',
      'Chân trang & liên hệ',
    ]);
    expect(descriptionOf({ type: 'hero' })).toBe(
      'Thông điệp chính đầu trang, kèm nút kêu gọi hành động.',
    );
  });

  it('moves sections, the navigation bar and footer staying in place', () => {
    let state = run([{ type: 'structure_proposed' }]);
    expect(canShift(state.structure, 1, -1)).toBe(false);
    expect(canShift(state.structure, 5, 1)).toBe(false);
    expect(canShift(state.structure, 0, 1)).toBe(false);
    state = run([{ type: 'section_moved', key: 'goal-4', offset: -1 }], state);
    expect(namesOf(state).slice(3, 5)).toEqual(['Câu hỏi thường gặp', 'Cảm nhận khách hàng']);
    // A move the registry refuses changes nothing.
    expect(run([{ type: 'section_moved', key: 'goal-0', offset: 1 }], state)).toBe(state);
  });

  it('removes sections down to one, and adds them before the footer', () => {
    let state = run([{ type: 'structure_proposed' }, { type: 'section_removed', key: 'goal-3' }]);
    expect(namesOf(state)).not.toContain('Cảm nhận khách hàng');
    state = run([{ type: 'section_added', sectionType: 'quick_contact' }], state);
    expect(state.structure.at(-2)).toMatchObject({
      key: 'added-0',
      type: 'quick_contact',
      variant: 'buttons',
      name: 'Gọi / Zalo nhanh',
    });
    expect(addBlockedReason(state.structure, 'lead_form')).toBe('Đã có trên trang');
    expect(run([{ type: 'section_added', sectionType: 'footer' }], state)).toBe(state);
    const single = {
      ...state,
      structure: state.structure.slice(0, 1),
    };
    expect(run([{ type: 'section_removed', key: 'goal-0' }], single)).toBe(single);
  });
});

describe('"Chuyển động" of the structure step (ADR-032)', () => {
  it('lets the AI choose until the user picks a style, and sends the choice', () => {
    let state = run([...BRIEF, { type: 'structure_proposed' }]);
    expect(state.motion).toBe('auto');
    expect(motionChoiceLabel(state.motion)).toBe('AI chọn');
    let built = buildAiJobRequest(state);
    expect(built.ok && built.request.motion).toBe('auto');
    state = run([{ type: 'motion_selected', motion: 'luxe' }], state);
    built = buildAiJobRequest(state);
    expect(built.ok && built.request.motion).toBe('luxe');
    // Proposing the structure again keeps it.
    expect(run([{ type: 'structure_proposed' }], state).motion).toBe('luxe');
  });

  it('says which style to expect, from the industry of the brief or else its tone', () => {
    const dental = run(BRIEF);
    expect(motionNoteOf(dental)).toBe(
      'AI chọn phong cách khi viết nội dung, không tốn thêm lượt. Dự kiến: Tinh tế · hợp ngành Nha khoa & y tế.',
    );
    const software = run([
      { type: 'brief_changed', field: 'product', value: 'Phần mềm kế toán' },
      { type: 'tone_selected', tone: 'energetic' },
    ]);
    expect(motionNoteOf(software)).toBe(
      'AI chọn phong cách khi viết nội dung, không tốn thêm lượt. Dự kiến: Năng động · hợp giọng văn Năng động.',
    );
    expect(motionNoteOf(run([{ type: 'motion_selected', motion: 'none' }], dental))).toBe(
      'Mọi section hiện ngay khi trang tải, không chuyển động. Đổi được trong editor, ở Cài đặt trang.',
    );
  });

  it('is choosing the motion once a first run’s sections are settled and some written', () => {
    const job = {
      id: '0123456789abcdef01234567',
      status: 'running',
      pageId: null,
      retriesLeft: 2,
      failure: null,
      sections: [
        { id: 'abcdefgh0001', type: 'hero', variant: 'split', status: 'done' },
        { id: 'abcdefgh0002', type: 'faq', variant: 'accordion', status: 'writing' },
        { id: 'abcdefgh0003', type: 'footer', variant: 'basic', status: 'kept' },
      ],
    } as const satisfies Parameters<typeof isChoosingMotion>[0];
    expect(isChoosingMotion(job, 'auto')).toBe(false);
    const settled = {
      ...job,
      sections: job.sections.map((section) =>
        section.status === 'writing' ? { ...section, status: 'failed' as const } : section,
      ),
    };
    expect(isChoosingMotion(settled, 'auto')).toBe(true);
    expect(isChoosingMotion(settled, 'smooth')).toBe(false);
    // "Thử lại" writes into the draft, whose motion was chosen.
    expect(isChoosingMotion({ ...settled, pageId: '0123456789abcdef01234568' }, 'auto')).toBe(
      false,
    );
    // Nothing written: no draft, no motion.
    expect(
      isChoosingMotion(
        {
          ...settled,
          sections: settled.sections.filter((section) => section.status !== 'done'),
        },
        'auto',
      ),
    ).toBe(false);
  });
});
