import { describe, expect, it } from 'vitest';
import {
  buildCreatePageRequest,
  contentErrorsOf,
  initialWizardState,
  type WizardAction,
  wizardReducer,
  type WizardState,
} from './wizard-state';

function run(actions: WizardAction[], state: WizardState = initialWizardState()): WizardState {
  return actions.reduce(wizardReducer, state);
}

describe('wizardReducer', () => {
  it('starts on the lead goal with its title and suggested slug', () => {
    const state = initialWizardState();
    expect(state).toMatchObject({
      step: 1,
      goal: 'lead',
      title: 'Thu lead tư vấn',
      slug: 'thu-lead-tu-van',
      style: 'calm',
    });
  });

  it('lets the title follow the goal until the user edits it', () => {
    let state = run([{ type: 'goal_selected', goal: 'promo' }]);
    expect(state.title).toBe('Ưu đãi có thời hạn');
    expect(state.slug).toBe('uu-dai-co-thoi-han');

    state = run(
      [
        { type: 'title_changed', title: 'Ưu đãi niềng răng tháng 11' },
        { type: 'goal_selected', goal: 'event' },
      ],
      state,
    );
    expect(state.goal).toBe('event');
    expect(state.title).toBe('Ưu đãi niềng răng tháng 11');
    expect(state.slug).toBe('uu-dai-nieng-rang-thang-11');
  });

  it('lets the slug follow the title until the user edits it', () => {
    const state = run([
      { type: 'slug_changed', slug: 'Ưu đãi ' },
      { type: 'title_changed', title: 'Trang khác' },
    ]);
    expect(state.slug).toBe('uu-dai-');
    expect(run([{ type: 'slug_finished' }], state).slug).toBe('uu-dai');
  });

  it('clears a field error as the field changes', () => {
    const state = run([
      { type: 'errors_shown', errors: { title: 'Nhập tên trang', phone: 'Sai số' }, step: 2 },
      { type: 'brief_changed', field: 'phone', value: '0901' },
    ]);
    expect(state.step).toBe(2);
    expect(state.errors).toEqual({ title: 'Nhập tên trang' });
  });
});

describe('buildCreatePageRequest', () => {
  it('builds the goal request with the trimmed brief and the style', () => {
    const state = run([
      { type: 'goal_selected', goal: 'promo' },
      { type: 'brief_changed', field: 'offer', value: '  Giảm 30% niềng răng ' },
      { type: 'brief_changed', field: 'phone', value: '0901 234 567' },
      { type: 'style_selected', style: 'bold' },
    ]);
    expect(buildCreatePageRequest(state)).toEqual({
      ok: true,
      request: {
        title: 'Ưu đãi có thời hạn',
        slug: 'uu-dai-co-thoi-han',
        start: {
          kind: 'goal',
          goal: 'promo',
          brief: { offer: 'Giảm 30% niềng răng', audience: '', phone: '0901 234 567' },
          style: 'bold',
        },
      },
    });
  });

  it('reports contract problems by field', () => {
    const state = run([
      { type: 'title_changed', title: '  ' },
      { type: 'slug_changed', slug: 'api' },
      { type: 'brief_changed', field: 'phone', value: 'gọi em' },
    ]);
    expect(buildCreatePageRequest(state)).toEqual({
      ok: false,
      errors: {
        title: 'Nhập tên trang',
        slug: 'Đường dẫn này được hệ thống giữ lại',
        phone: 'Số điện thoại chỉ gồm chữ số, dấu + và khoảng trắng',
      },
    });
  });

  it('maps server issue paths to the fields', () => {
    expect(
      contentErrorsOf({
        slug: 'Đường dẫn đã được dùng',
        'start.brief.audience': 'Tối đa 120 ký tự',
        'start.goal': 'ignored',
      }),
    ).toEqual({ slug: 'Đường dẫn đã được dùng', audience: 'Tối đa 120 ký tự' });
  });
});
