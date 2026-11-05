import { describe, expect, it } from 'vitest';
import {
  conditionsHold,
  missingSteps,
  recipeDefinition,
  renderSubject,
  retryAt,
  type RunFacts,
} from './automation-rules.js';

const NOW = new Date('2026-11-05T03:00:00.000Z');
const A = '64b0000000000000000000a1';
const B = '64b0000000000000000000b2';

const FACTS: RunFacts = {
  source: { source: 'Facebook', medium: 'cpc', campaign: 'Ưu đãi tháng 11' },
  pageId: A,
  tags: ['Niềng răng'],
  opportunityValue: 38_000_000,
  stage: 'scheduled',
};

describe('automation rules (ADR-034)', () => {
  it('tries a failed step again after 5, 15 and 40 minutes, then gives up', () => {
    expect(retryAt(1, NOW)?.toISOString()).toBe('2026-11-05T03:05:00.000Z');
    expect(retryAt(2, NOW)?.toISOString()).toBe('2026-11-05T03:15:00.000Z');
    expect(retryAt(3, NOW)?.toISOString()).toBe('2026-11-05T03:40:00.000Z');
    expect(retryAt(4, NOW)).toBeNull();
  });

  it('fills a recipe from the site’s members, missing nothing when there are some', () => {
    const assign = recipeDefinition('assign_new_leads', { assignees: [A, B], managers: [A] });
    expect(assign.name).toBe('Giao lead mới cho người trực');
    expect(assign.definition.actions[0]).toEqual({ kind: 'assign', memberIds: [A, B] });
    expect(missingSteps(assign.definition)).toBe(0);
    const won = recipeDefinition('notify_won', { assignees: [], managers: [] });
    expect(won.definition.trigger).toEqual({ kind: 'opportunity_stage_changed', stage: 'won' });
    // Nobody to tell: the step waits for a member (A2).
    expect(missingSteps(won.definition)).toBe(1);
    expect(missingSteps({ ...won.definition, actions: [] })).toBe(1);
  });

  it('holds every condition, sources without regard to case and accents', () => {
    expect(conditionsHold([], FACTS)).toBe(true);
    expect(
      conditionsHold(
        [
          { kind: 'source_contains', field: 'source', text: 'facebook' },
          { kind: 'source_contains', field: 'campaign', text: 'uu dai' },
          { kind: 'page_in', pageIds: [A] },
          { kind: 'contact_has_tag', tag: 'Niềng răng' },
          { kind: 'opportunity_value_at_least', value: 30_000_000 },
          { kind: 'stage_is', stages: ['scheduled', 'visited'] },
        ],
        FACTS,
      ),
    ).toBe(true);
    expect(conditionsHold([{ kind: 'page_in', pageIds: [B] }], FACTS)).toBe(false);
    expect(
      conditionsHold([{ kind: 'opportunity_value_at_least', value: 1 }], {
        ...FACTS,
        opportunityValue: null,
      }),
    ).toBe(false);
  });

  it('fills the placeholders of an email subject', () => {
    expect(
      renderSubject('«Tên khách» từ «Trang nguồn», phụ trách «Người phụ trách»', {
        contactName: 'Nguyễn Thu Trang',
        pageTitle: null,
        ownerName: null,
        profileUrl: 'https://app.example/x',
      }),
    ).toBe('Nguyễn Thu Trang từ trang đã xóa, phụ trách chưa giao');
  });
});
