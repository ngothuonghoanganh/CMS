'use client';

import {
  endpoints,
  type TemplateRef,
  type TemplateSummary,
  templateUsableIn,
} from '@plp/contracts';
import { Button, Callout, Dialog, Field, Select } from '@plp/ui';
import { useMutation, useQuery } from '@tanstack/react-query';
import { type SubmitEvent, useState } from 'react';
import { api, ApiError } from '../../lib/api';
import { problemMessage, reportUnexpected } from '../shell/problem-message';
import { templateQueryKeys } from '../templates/queries';
import { TemplateThumb } from '../templates/TemplateThumb';
import { useEditor, useEditorServices, useEditorStoreApi } from './editor-context';
import styles from './ApplyTemplateInEditorDialog.module.css';

/** The library the editor applies from: the templates this site may use (ADR-030). */
function libraryQuery(workspaceId: string) {
  return {
    queryKey: templateQueryKeys.all(workspaceId),
    queryFn: ({ signal }: { signal: AbortSignal }) =>
      api(endpoints.listTemplates, [workspaceId], { signal }),
  };
}

function refOf(template: TemplateSummary): TemplateRef {
  return template.source === 'system'
    ? { source: 'system', templateId: template.id, version: template.version }
    : { source: 'workspace', templateId: template.id, version: template.version };
}

/** "Thay toàn bộ section" in words, with the draft's and the template's real counts. */
export function replaceSentence(current: number, template: Pick<TemplateSummary, 'sections'>) {
  const next = template.sections.length;
  return current === 0
    ? `Bản nháp chưa có section nào; mẫu thêm ${next} section.`
    : `${current} section hiện có trong bản nháp được thay bằng ${next} section của mẫu.`;
}

function ApplyForm({ onOpenChange }: { onOpenChange: (open: boolean) => void }) {
  const store = useEditorStoreApi();
  const { announce } = useEditorServices();
  const site = useEditor((state) => state.site);
  const pageId = useEditor((state) => state.page.id);
  const current = useEditor((state) => state.draft.composition.sections.length);
  const library = useQuery(libraryQuery(site.workspaceId));
  const usable = (library.data?.items ?? []).filter((template) =>
    templateUsableIn(template.siteIds, site.id),
  );
  const [templateId, setTemplateId] = useState<string | null>(null);
  const chosen = usable.find((template) => template.id === templateId) ?? usable[0] ?? null;
  const [failure, setFailure] = useState<string | null>(null);

  const prepare = useMutation({
    mutationFn: (template: TemplateSummary) =>
      api(endpoints.templateComposition, [site.id, pageId], { body: refOf(template) }),
    onSuccess: (result) => {
      // The images first, so the canvas never shows them missing.
      store.getState().addAssets(result.assets);
      if (!store.getState().applyTemplate(result.composition)) {
        setFailure('Mẫu này không áp dụng được cho trang. Hãy chọn mẫu khác.');
        return;
      }
      onOpenChange(false);
      announce(`Đã áp dụng mẫu “${result.template.name}”. Nhấn Ctrl+Z để hoàn tác.`);
    },
    onError: (error) => {
      if (error instanceof ApiError && error.code === 'template_changed') {
        // The list is read again: the newer version is the one chosen now.
        void library.refetch();
        setFailure(`${error.problem.title}. Đã tải phiên bản mới; bấm lần nữa để áp dụng.`);
        return;
      }
      if (!(error instanceof ApiError)) {
        reportUnexpected('Applying a template in the editor failed', error);
      }
      setFailure(problemMessage(error));
    },
  });

  function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (chosen !== null) {
      setFailure(null);
      prepare.mutate(chosen);
    }
  }

  const system = usable.filter((template) => template.source === 'system');
  const own = usable.filter((template) => template.source === 'workspace');

  return (
    <form noValidate onSubmit={submit} className={styles.form}>
      {library.isPending ? (
        <p className={styles.quiet} role="status">
          Đang tải thư viện mẫu…
        </p>
      ) : library.isError ? (
        <Callout tone="danger" role="alert">
          Chưa tải được thư viện mẫu. {problemMessage(library.error)}
        </Callout>
      ) : (
        <Field label="Mẫu" id="editor-apply-template">
          <Select
            value={chosen?.id ?? ''}
            onChange={(event) => {
              setTemplateId(event.target.value);
              setFailure(null);
            }}
          >
            <optgroup label="Hệ thống">
              {system.map((template) => (
                <option key={template.id} value={template.id}>
                  {template.name}
                </option>
              ))}
            </optgroup>
            {own.length === 0 ? null : (
              <optgroup label="Của workspace">
                {own.map((template) => (
                  <option key={template.id} value={template.id}>
                    {template.name} · v{template.version}
                  </option>
                ))}
              </optgroup>
            )}
          </Select>
        </Field>
      )}
      {chosen === null ? null : (
        <div className={styles.preview}>
          <TemplateThumb
            sections={chosen.sections}
            themePresetId={site.themePresetId}
            label={`Bản xem thu nhỏ: ${chosen.name}`}
            className={styles.thumb}
          />
          <div className={styles.facts} role="status">
            <p>
              <strong>Thay toàn bộ section.</strong> {replaceSentence(current, chosen)}
            </p>
            <p>Tên trang, đường dẫn, SEO và trang live giữ nguyên.</p>
            <p>Hoàn tác được bằng Ctrl+Z, như mọi thay đổi trong editor.</p>
          </div>
        </div>
      )}
      {failure === null ? null : (
        <Callout tone="warning" role="alert">
          {failure}
        </Callout>
      )}
      <div className={styles.actions}>
        <Button
          variant="secondary"
          disabled={prepare.isPending}
          onClick={() => {
            onOpenChange(false);
          }}
        >
          Hủy
        </Button>
        <Button type="submit" loading={prepare.isPending} disabled={chosen === null}>
          Áp dụng mẫu
        </Button>
      </div>
    </form>
  );
}

/**
 * "Áp dụng mẫu…" of the editor's "…" menu (ADR-030): a template of the library this site may use,
 * its images copied to the site, then one command of the store that replaces every section: one
 * undo step, saved by autosave (ADR-008).
 */
export function ApplyTemplateInEditorDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Áp dụng mẫu"
      description="Các section của bản nháp được thay bằng các section của mẫu."
    >
      <ApplyForm onOpenChange={onOpenChange} />
    </Dialog>
  );
}
