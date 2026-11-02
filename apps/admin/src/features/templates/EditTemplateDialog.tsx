'use client';

import {
  endpoints,
  type PageGoal,
  type Site,
  type TemplateIndustry,
  templateNameSchema,
  type WorkspaceTemplate,
} from '@plp/contracts';
import { Button, Callout, Dialog, Field, Input } from '@plp/ui';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { type SubmitEvent, useState } from 'react';
import { api, ApiError } from '../../lib/api';
import { problemMessage, reportUnexpected } from '../shell/problem-message';
import { keepFieldFocus } from '../shell/use-schema-form';
import { templateQueryKeys } from './queries';
import { GoalIndustryFields, TemplateScopeField } from './TemplateInfoFields';
import type { ScopeDraft } from './workspace-templates';
import styles from './EditTemplateDialog.module.css';

export interface EditTemplateDialogProps {
  workspaceId: string;
  template: WorkspaceTemplate;
  /** The member's sites, the only ones they may choose. */
  sites: readonly Site[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: (template: WorkspaceTemplate) => void;
}

/** A message per field; cleared to undefined as soon as the field changes. */
interface FormErrors {
  name?: string | undefined;
  scope?: string | undefined;
}

function EditTemplateForm({
  workspaceId,
  template,
  sites,
  onOpenChange,
  onSaved,
}: Omit<EditTemplateDialogProps, 'open'>) {
  const queryClient = useQueryClient();
  const [name, setName] = useState(template.name);
  const [description, setDescription] = useState(template.description);
  const [goal, setGoal] = useState<PageGoal | null>(template.goal);
  const [industry, setIndustry] = useState<TemplateIndustry | null>(template.industry);
  const [scope, setScope] = useState<ScopeDraft>(template.scope);
  const [errors, setErrors] = useState<FormErrors>({});

  const save = useMutation({
    mutationFn: () =>
      api(endpoints.updateWorkspaceTemplate, [workspaceId, template.id], {
        body: { name, description, goal, industry, scope },
      }),
    onSuccess: (updated) => {
      void queryClient.invalidateQueries({ queryKey: templateQueryKeys.all(workspaceId) });
      onSaved(updated);
      onOpenChange(false);
    },
    onError: (error) => {
      if (error instanceof ApiError) {
        const fields = error.fieldErrors();
        setErrors({
          ...(fields['name'] === undefined ? {} : { name: fields['name'] }),
          ...(fields['scope.siteIds'] === undefined ? {} : { scope: fields['scope.siteIds'] }),
        });
        return;
      }
      reportUnexpected('Editing a workspace template failed', error);
    },
  });

  function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    const next: FormErrors = {};
    const parsed = templateNameSchema.safeParse(name);
    if (!parsed.success) {
      next.name = parsed.error.issues[0]?.message ?? 'Nhập tên template';
    }
    if (scope.kind === 'sites' && scope.siteIds.length === 0) {
      next.scope = 'Chọn ít nhất một site';
    }
    setErrors(next);
    if (next.name !== undefined) {
      document.getElementById('edit-template-name')?.focus();
      return;
    }
    if (next.scope === undefined) {
      save.mutate();
    }
  }

  const failure = save.error;
  const fieldProblem = failure instanceof ApiError && Object.keys(failure.fieldErrors()).length > 0;

  return (
    <form noValidate onSubmit={submit} className={styles.form}>
      <Field label="Tên" id="edit-template-name" required error={errors.name}>
        <Input
          value={name}
          maxLength={120}
          onChange={(event) => {
            setName(event.target.value);
            setErrors((current) => ({ ...current, name: undefined }));
          }}
        />
      </Field>
      <Field label="Mô tả ngắn" id="edit-template-description" optional>
        <Input
          value={description}
          maxLength={300}
          onChange={(event) => {
            setDescription(event.target.value);
          }}
        />
      </Field>
      <GoalIndustryFields
        idPrefix="edit-template"
        goal={goal}
        industry={industry}
        onGoalChange={setGoal}
        onIndustryChange={setIndustry}
      />
      <TemplateScopeField
        idPrefix="edit-template"
        scope={scope}
        sites={sites}
        error={errors.scope}
        onChange={(next) => {
          setScope(next);
          setErrors((current) => ({ ...current, scope: undefined }));
        }}
      />
      {failure === null || fieldProblem ? null : (
        <Callout tone="danger" role="alert">
          {problemMessage(failure)}
        </Callout>
      )}
      <div className={styles.actions}>
        <Button
          variant="secondary"
          disabled={save.isPending}
          onClick={() => {
            onOpenChange(false);
          }}
        >
          Hủy
        </Button>
        <Button type="submit" loading={save.isPending} onMouseDown={keepFieldFocus}>
          Lưu thông tin
        </Button>
      </div>
    </form>
  );
}

/**
 * "Sửa thông tin" of a workspace template (board 19): its name, description, goal, industry and
 * who may use it. Its versions do not change.
 */
export function EditTemplateDialog({ open, onOpenChange, ...form }: EditTemplateDialogProps) {
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Sửa thông tin template"
      description="Các phiên bản và trang đã tạo từ mẫu không đổi."
    >
      <EditTemplateForm key={form.template.id} {...form} onOpenChange={onOpenChange} />
    </Dialog>
  );
}
