import { describe, expect, it } from 'vitest';
import {
  alsoChanged,
  changeOf,
  newDraft,
  publishLevelOf,
  rebased,
  summaryLines,
  toggled,
  withPublishLevel,
} from './custom-role-editor';

describe('the custom role editor (board 16, ADR-024)', () => {
  it('starts as a copy of Biên tập, or of the role chosen', () => {
    expect(newDraft()).toEqual({
      name: '',
      basedOn: 'editor',
      permissions: ['pages.edit', 'templates.manage', 'pages.publish', 'pages.manageLive'],
      wholeWorkspace: false,
    });
    const named = { ...newDraft(), name: 'Trưởng nhóm', wholeWorkspace: true };
    expect(rebased(named, 'support')).toEqual({
      name: 'Trưởng nhóm',
      basedOn: 'support',
      permissions: ['leads.view', 'leads.handle'],
      wholeWorkspace: true,
    });
  });

  it('keeps every draft valid: what a row needs comes along, what needs it goes', () => {
    expect(toggled([], 'leads.export', true)).toEqual(['leads.view', 'leads.export']);
    expect(toggled(['leads.view', 'leads.handle', 'leads.export'], 'leads.view', false)).toEqual(
      [],
    );
    expect(
      toggled(['pages.edit', 'pages.requestPublish'], 'publishApprovals.decide', true),
    ).toEqual(['pages.edit', 'pages.publish', 'publishApprovals.decide']);
    expect(
      toggled(['pages.edit', 'pages.publish', 'pages.manageLive'], 'pages.edit', false),
    ).toEqual([]);
  });

  it('says what else a row changed, for screen readers', () => {
    const before = ['pages.edit', 'pages.publish', 'pages.manageLive'] as const;
    expect(alsoChanged(before, toggled([...before], 'pages.edit', false), ['pages.edit'])).toBe(
      'Cũng tắt: Xuất bản, cập nhật trang live, Rollback, hoàn tác, gỡ trang khỏi live.',
    );
    expect(alsoChanged([], toggled([], 'leads.export', true), ['leads.export'])).toBe(
      'Cũng bật: Xem lead và nơi nhận lead.',
    );
    expect(alsoChanged([...before], toggled([...before], 'leads.view', true), ['leads.view'])).toBe(
      '',
    );
  });

  it('sets publishing to no, ask or yes', () => {
    const editor = newDraft().permissions;
    expect(publishLevelOf(editor)).toBe('on');
    const asking = withPublishLevel(editor, 'request');
    expect(asking).toEqual([
      'pages.edit',
      'templates.manage',
      'pages.manageLive',
      'pages.requestPublish',
    ]);
    expect(publishLevelOf(asking)).toBe('request');
    expect(
      withPublishLevel(['pages.edit', 'pages.publish', 'publishApprovals.decide'], 'off'),
    ).toEqual(['pages.edit']);
    expect(withPublishLevel([], 'on')).toEqual(['pages.edit', 'pages.publish']);
  });

  it('marks and sums up what differs from the role it started from', () => {
    // Board 16's "Trưởng nhóm nội dung": Biên tập without rollback, with leads.
    const draft = {
      ...newDraft(),
      permissions: toggled(
        toggled(newDraft().permissions, 'pages.manageLive', false),
        'leads.view',
        true,
      ),
    };
    expect(changeOf(draft, 'leads.view')).toBe('added');
    expect(changeOf(draft, 'pages.manageLive')).toBe('removed');
    expect(changeOf(draft, 'pages.edit')).toBeNull();
    expect(summaryLines(draft)).toEqual([
      { change: 'removed', label: 'Rollback, hoàn tác, gỡ trang khỏi live' },
      { change: 'added', label: 'Xem lead và nơi nhận lead' },
    ]);
  });
});
