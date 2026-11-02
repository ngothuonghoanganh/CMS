'use client';

import {
  type PageGoal,
  pageGoalIds,
  pageGoalSchema,
  type Site,
  type TemplateIndustry,
  templateIndustries,
  templateIndustryLabels,
  templateIndustrySchema,
} from '@plp/contracts';
import { Checkbox, Field, Select } from '@plp/ui';
import { goalLabel } from './library-filters';
import { type ScopeDraft, withScopeSite } from './workspace-templates';
import styles from './TemplateInfoFields.module.css';

const NONE = '';

export interface GoalIndustryFieldsProps {
  idPrefix: string;
  goal: PageGoal | null;
  industry: TemplateIndustry | null;
  onGoalChange: (goal: PageGoal | null) => void;
  onIndustryChange: (industry: TemplateIndustry | null) => void;
}

/** "Mục tiêu" and "Ngành" of a workspace template: the filters of board 17 find it by them. */
export function GoalIndustryFields({
  idPrefix,
  goal,
  industry,
  onGoalChange,
  onIndustryChange,
}: GoalIndustryFieldsProps) {
  return (
    <div className={styles.pair}>
      <Field label="Mục tiêu" id={`${idPrefix}-goal`} optional>
        <Select
          value={goal ?? NONE}
          onChange={(event) => {
            const parsed = pageGoalSchema.safeParse(event.target.value);
            onGoalChange(parsed.success ? parsed.data : null);
          }}
        >
          <option value={NONE}>Chưa chọn</option>
          {pageGoalIds.map((id) => (
            <option key={id} value={id}>
              {goalLabel(id)}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Ngành" id={`${idPrefix}-industry`} optional>
        <Select
          value={industry ?? NONE}
          onChange={(event) => {
            const parsed = templateIndustrySchema.safeParse(event.target.value);
            onIndustryChange(parsed.success ? parsed.data : null);
          }}
        >
          <option value={NONE}>Chưa chọn</option>
          {templateIndustries.map((id) => (
            <option key={id} value={id}>
              {templateIndustryLabels[id]}
            </option>
          ))}
        </Select>
      </Field>
    </div>
  );
}

export interface TemplateScopeFieldProps {
  idPrefix: string;
  scope: ScopeDraft;
  /** The member's sites: the only ones they may choose (ADR-030). */
  sites: readonly Site[];
  error?: string | undefined;
  onChange: (scope: ScopeDraft) => void;
}

/** "Ai được dùng": every site of the workspace, or the sites checked. */
export function TemplateScopeField({
  idPrefix,
  scope,
  sites,
  error,
  onChange,
}: TemplateScopeFieldProps) {
  return (
    <div className={styles.scope}>
      <Field label="Ai được dùng" id={`${idPrefix}-scope`}>
        <Select
          value={scope.kind}
          onChange={(event) => {
            onChange(
              event.target.value === 'workspace'
                ? { kind: 'workspace' }
                : { kind: 'sites', siteIds: sites[0] === undefined ? [] : [sites[0].id] },
            );
          }}
        >
          <option value="workspace">Toàn workspace</option>
          <option value="sites">Chỉ site được chọn</option>
        </Select>
      </Field>
      {scope.kind === 'sites' ? (
        <fieldset
          className={styles.sites}
          aria-describedby={error === undefined ? undefined : `${idPrefix}-scope-error`}
        >
          <legend className={styles.legend}>Site được dùng mẫu</legend>
          {sites.map((site) => (
            <Checkbox
              key={site.id}
              label={site.name}
              checked={scope.siteIds.includes(site.id)}
              onChange={(event) => {
                onChange(withScopeSite(scope, site.id, event.target.checked, sites));
              }}
            />
          ))}
          {error === undefined ? null : (
            <p id={`${idPrefix}-scope-error`} className={styles.error} role="alert">
              {error}
            </p>
          )}
        </fieldset>
      ) : null}
    </div>
  );
}
