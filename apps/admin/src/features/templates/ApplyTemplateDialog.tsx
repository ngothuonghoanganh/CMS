'use client';

import {
  type Access,
  endpoints,
  pageStatusLabels,
  type Site,
  type TemplateRef,
  type TemplateSummary,
} from '@plp/contracts';
import { Button, Callout, Dialog, Field, RadioCardGroup, Select } from '@plp/ui';
import { useIsMutating, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { api, ApiError } from '../../lib/api';
import { siteQueryKeys } from '../dashboard/queries';
import { pageHref } from '../shell/navigation';
import { problemMessage, reportUnexpected } from '../shell/problem-message';
import { applySummary } from './apply-summary';
import { pageDetailQuery, sitePagesQuery, templateQueryKeys } from './queries';
import { archivedHint } from './workspace-templates';
import styles from './ApplyTemplateDialog.module.css';

/** The template applied: what the request names, and what the dialog says of it. */
export type ApplyTemplate = Pick<
  TemplateSummary,
  'id' | 'source' | 'version' | 'name' | 'sections'
>;

function applyingKey(templateId: string) {
  return ['apply-template', templateId] as const;
}

export interface ApplyTemplateDialogProps {
  workspaceId: string;
  template: ApplyTemplate;
  /** Who may restore an archived template is told so; others are told who can. */
  role: Access;
  /** Sites the user may edit pages in and the template may be used in. Never empty. */
  sites: readonly Site[];
  /** The site chosen on the screen; the dialog may change it. */
  initialSiteId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /**
   * The template is not as shown: the API has a newer version ("Xem phiên bản mới"), or it was
   * archived meanwhile (called at once). The screen reads it again.
   */
  onTemplateChanged: () => void;
}

function ApplyTemplateForm({
  workspaceId,
  template,
  role,
  sites,
  initialSiteId,
  onOpenChange,
  onTemplateChanged,
}: Omit<ApplyTemplateDialogProps, 'open'>) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [siteId, setSiteId] = useState(initialSiteId);
  const [pageId, setPageId] = useState<string | null>(null);
  const pages = useQuery(sitePagesQuery(siteId));
  const chosen = pageId ?? pages.data?.[0]?.id ?? null;
  const detail = useQuery({
    ...pageDetailQuery(siteId, chosen ?? ''),
    enabled: chosen !== null,
  });

  const ref: TemplateRef =
    template.source === 'system'
      ? { source: 'system', templateId: template.id, version: template.version }
      : { source: 'workspace', templateId: template.id, version: template.version };

  const apply = useMutation({
    mutationKey: applyingKey(template.id),
    mutationFn: ({ page, revision }: { page: string; revision: number }) =>
      api(endpoints.applyTemplate, [siteId, page], {
        body: { baseRevision: revision, template: ref },
      }),
    onSuccess: (result) => {
      void queryClient.invalidateQueries({ queryKey: siteQueryKeys.site(siteId) });
      router.push(pageHref(siteId, result.page.id, 'edit'));
    },
    onError: (error) => {
      if (error instanceof ApiError && error.code === 'revision_conflict') {
        // Saved elsewhere since it was read: read it again and let the user confirm again.
        void detail.refetch();
        return;
      }
      if (error instanceof ApiError && error.code === 'template_archived') {
        // Every list that offers it is read again, the screen too; the dialog says why.
        void queryClient.invalidateQueries({ queryKey: templateQueryKeys.all(workspaceId) });
        onTemplateChanged();
        return;
      }
      if (!(error instanceof ApiError)) {
        reportUnexpected('Applying a template to a draft failed', error);
      }
    },
  });

  const failure = apply.error;
  const conflict = failure instanceof ApiError && failure.code === 'revision_conflict';
  const templateChanged = failure instanceof ApiError && failure.code === 'template_changed';
  const templateArchived = failure instanceof ApiError && failure.code === 'template_archived';
  const summary = detail.data === undefined ? null : applySummary(detail.data, template);

  return (
    <form
      noValidate
      className={styles.form}
      onSubmit={(event) => {
        event.preventDefault();
        if (chosen !== null && detail.data !== undefined) {
          apply.mutate({ page: chosen, revision: detail.data.draft.revision });
        }
      }}
    >
      {sites.length > 1 ? (
        <Field label="Site" id="apply-template-site">
          <Select
            value={siteId}
            onChange={(event) => {
              setSiteId(event.target.value);
              setPageId(null);
              apply.reset();
            }}
          >
            {sites.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </Select>
        </Field>
      ) : null}
      {pages.isPending ? (
        <p className={styles.quiet} role="status">
          Đang tải các trang…
        </p>
      ) : pages.isError ? (
        <Callout tone="danger" role="alert">
          Chưa tải được các trang của site. {problemMessage(pages.error)}
        </Callout>
      ) : pages.data.length === 0 ? (
        <Callout tone="info">Site này chưa có trang nào. Hãy tạo trang từ mẫu.</Callout>
      ) : (
        <Field label="Trang" id="apply-template-page">
          <Select
            value={chosen ?? ''}
            onChange={(event) => {
              setPageId(event.target.value);
              apply.reset();
            }}
          >
            {pages.data.map((page) => (
              <option key={page.id} value={page.id}>
                {page.title} · {pageStatusLabels[page.status.kind]}
              </option>
            ))}
          </Select>
        </Field>
      )}

      {chosen === null ? null : detail.isError ? (
        <Callout tone="danger" role="alert">
          Chưa đọc được bản nháp của trang. {problemMessage(detail.error)}
        </Callout>
      ) : (
        <>
          <RadioCardGroup
            legend="Áp dụng gì"
            showLegend
            minColumnWidth={320}
            value="replace"
            onChange={() => undefined}
            options={[
              {
                value: 'replace',
                label: 'Thay toàn bộ section',
                description: summary?.replaces ?? 'Đang đọc bản nháp…',
              },
            ]}
          />
          {/* The counts follow the page picked, as a status (WCAG 4.1.3). */}
          <div className={styles.boxes} role="status">
            {summary === null ? null : (
              <>
                <p className={styles.box} data-tone="success">
                  <strong>Giữ nguyên</strong> {summary.keeps}
                </p>
                <p className={styles.box} data-tone={summary.undo.tone}>
                  <strong>{summary.undo.title}</strong> {summary.undo.text}
                </p>
              </>
            )}
          </div>
        </>
      )}

      {conflict ? (
        <Callout tone="warning" role="alert">
          {failure.problem.title}. Đã đọc lại bản nháp mới nhất; bấm lần nữa để thay.
        </Callout>
      ) : templateChanged ? (
        <Callout
          tone="warning"
          role="alert"
          action={
            <Button variant="secondary" size="sm" onClick={onTemplateChanged}>
              Xem phiên bản mới
            </Button>
          }
        >
          {failure.problem.title}. {failure.problem.detail}
        </Callout>
      ) : templateArchived ? (
        <Callout tone="warning" role="alert">
          {failure.problem.title}. {archivedHint(role)}
        </Callout>
      ) : failure === null ? null : (
        <Callout tone="danger" role="alert">
          {problemMessage(failure)}
        </Callout>
      )}

      <div className={styles.actions}>
        <Button
          variant="secondary"
          disabled={apply.isPending}
          onClick={() => {
            onOpenChange(false);
          }}
        >
          Hủy
        </Button>
        <Button
          type="submit"
          loading={apply.isPending}
          disabled={
            detail.data === undefined || detail.isFetching || templateChanged || templateArchived
          }
        >
          Thay bản nháp và mở editor
        </Button>
      </div>
    </form>
  );
}

/**
 * "Áp dụng vào trang đang sửa…" (board 18, ADR-030): a page of the site, what stays and how to go
 * back, then one save of its draft at the revision read, and the editor opens on it. Only "Thay
 * toàn bộ section": the theme belongs to the site (ADR-004).
 */
export function ApplyTemplateDialog({ open, onOpenChange, ...form }: ApplyTemplateDialogProps) {
  const applying = useIsMutating({ mutationKey: applyingKey(form.template.id) }) > 0;
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        // A draft being replaced cannot be dismissed half-way: its answer shows here.
        if (!next && applying) {
          return;
        }
        onOpenChange(next);
      }}
      title="Áp dụng mẫu vào trang đang sửa"
      description={`Mẫu “${form.template.name}” thay các section của bản nháp. Trang live không đổi.`}
    >
      <ApplyTemplateForm
        key={`${form.template.id}@${form.template.version}`}
        {...form}
        onOpenChange={onOpenChange}
      />
    </Dialog>
  );
}
