'use client';

import {
  DEFAULT_THEME_PRESET,
  endpoints,
  type PageGoal,
  pageStatusLabels,
  type Site,
  type TemplateContentMode,
  type TemplateIndustry,
  templateNameSchema,
  type WorkspaceTemplate,
} from '@plp/contracts';
import { compositionOutline } from '@plp/sections/schema';
import { Button, Callout, Dialog, Field, Input, RadioCardGroup, Select } from '@plp/ui';
import { useIsMutating, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { type SubmitEvent, useState } from 'react';
import { api, ApiError } from '../../lib/api';
import { problemBesideFields, problemMessage, reportUnexpected } from '../shell/problem-message';
import { keepFieldFocus } from '../shell/use-schema-form';
import { pageDetailQuery, sitePagesQuery, templateQueryKeys } from './queries';
import { GoalIndustryFields, TemplateScopeField } from './TemplateInfoFields';
import { TemplateThumb } from './TemplateThumb';
import { initialScope, keptPagesNote, type ScopeDraft } from './workspace-templates';
import styles from './SaveTemplateDialog.module.css';

/** Where the page comes from: picked on board 19, or the page open in the editor. */
export type SaveTemplateSource =
  { kind: 'pick'; initialSiteId: string } | { kind: 'page'; siteId: string; pageId: string };

const NAME_MAX = 120;
const DESCRIPTION_MAX = 300;
const NOTE_MAX = 200;

const savingKey = ['save-template'] as const;

/** The workspace templates the member sees, for "Phiên bản mới của …" (board 19). */
export function workspaceTemplatesQuery(workspaceId: string) {
  return {
    queryKey: [...templateQueryKeys.all(workspaceId), 'workspace'] as const,
    queryFn: ({ signal }: { signal: AbortSignal }) =>
      api(endpoints.listWorkspaceTemplates, [workspaceId], { signal }),
  };
}

export interface SaveTemplateDialogProps {
  workspaceId: string;
  /** The member's sites: where the page may come from and who may use the template. */
  sites: readonly Site[];
  source: SaveTemplateSource;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** After the save: the template with its new version. */
  onSaved: (template: WorkspaceTemplate) => void;
}

/** A message per field; cleared to undefined as soon as the field changes. */
interface FormErrors {
  name?: string | undefined;
  scope?: string | undefined;
}

function SaveTemplateForm({
  workspaceId,
  sites,
  source,
  onOpenChange,
  onSaved,
}: Omit<SaveTemplateDialogProps, 'open'>) {
  const queryClient = useQueryClient();
  const [siteId, setSiteId] = useState(
    source.kind === 'page' ? source.siteId : source.initialSiteId,
  );
  const [pickedPage, setPickedPage] = useState<string | null>(null);
  const [from, setFrom] = useState<'live' | 'draft' | null>(null);
  const [target, setTarget] = useState<'new' | 'version'>('new');
  const [templateId, setTemplateId] = useState<string | null>(null);
  const [name, setName] = useState<string | null>(null);
  const [description, setDescription] = useState('');
  const [goal, setGoal] = useState<PageGoal | null | undefined>(undefined);
  const [industry, setIndustry] = useState<TemplateIndustry | null>(null);
  const [note, setNote] = useState('');
  const [content, setContent] = useState<TemplateContentMode>('sample');
  const [scope, setScope] = useState<ScopeDraft>(() => initialScope(null));
  const [errors, setErrors] = useState<FormErrors>({});

  const pages = useQuery({ ...sitePagesQuery(siteId), enabled: source.kind === 'pick' });
  const pageId = source.kind === 'page' ? source.pageId : (pickedPage ?? pages.data?.[0]?.id);
  const detail = useQuery({
    ...pageDetailQuery(siteId, pageId ?? ''),
    enabled: pageId !== undefined,
  });
  const templates = useQuery(workspaceTemplatesQuery(workspaceId));
  const choices = (templates.data?.items ?? []).filter((template) => !template.archived);
  const chosen = choices.find((template) => template.id === templateId) ?? choices[0] ?? null;
  const asVersion = target === 'version' && chosen !== null;

  const page = detail.data;
  const live = page?.page.liveRelease ?? null;
  // The live release by default when there is one; a page that is not live has its draft only.
  const kind: 'live' | 'draft' = live === null ? 'draft' : (from ?? 'live');
  const effectiveName = name ?? (asVersion ? chosen.name : (page?.page.title ?? ''));
  const effectiveGoal = goal === undefined ? (page?.page.goal ?? null) : goal;

  const save = useMutation({
    mutationKey: savingKey,
    mutationFn: async () => {
      if (pageId === undefined) {
        throw new Error('No page to save as a template');
      }
      const saved = { source: { siteId, pageId, kind }, content, note };
      return asVersion
        ? api(endpoints.createTemplateVersion, [workspaceId, chosen.id], {
            body: { ...saved, name: effectiveName, baseVersion: chosen.currentVersion },
          })
        : api(endpoints.createWorkspaceTemplate, [workspaceId], {
            body: {
              ...saved,
              name: effectiveName,
              description,
              goal: effectiveGoal,
              industry,
              scope,
            },
          });
    },
    onSuccess: (template) => {
      void queryClient.invalidateQueries({ queryKey: templateQueryKeys.all(workspaceId) });
      onSaved(template);
      onOpenChange(false);
    },
    onError: (error) => {
      if (error instanceof ApiError) {
        const fields = error.fieldErrors();
        if (fields['name'] !== undefined || fields['scope.siteIds'] !== undefined) {
          setErrors({
            ...(fields['name'] === undefined ? {} : { name: fields['name'] }),
            ...(fields['scope.siteIds'] === undefined ? {} : { scope: fields['scope.siteIds'] }),
          });
        }
        if (error.code === 'template_changed') {
          void templates.refetch();
        }
        return;
      }
      reportUnexpected('Saving a page as a template failed', error);
    },
  });

  function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    const next: FormErrors = {};
    const parsed = templateNameSchema.safeParse(effectiveName);
    if (!parsed.success) {
      next.name = parsed.error.issues[0]?.message ?? 'Nhập tên template';
    }
    if (!asVersion && scope.kind === 'sites' && scope.siteIds.length === 0) {
      next.scope = 'Chọn ít nhất một site';
    }
    setErrors(next);
    if (next.name !== undefined) {
      document.getElementById('save-template-name')?.focus();
      return;
    }
    if (next.scope !== undefined || page === undefined) {
      return;
    }
    save.mutate();
  }

  const failure = save.error;
  // The scope is chosen for a new template only.
  const unshown =
    failure === null
      ? null
      : problemBesideFields(failure, asVersion ? ['name'] : ['name', 'scope.siteIds']);
  const outline =
    page === undefined || kind === 'live' ? null : compositionOutline(page.draft.composition);
  const site = sites.find((item) => item.id === siteId);
  const kept = asVersion ? keptPagesNote(chosen) : null;

  return (
    <form noValidate onSubmit={submit} className={styles.form}>
      <div className={styles.columns}>
        <div className={styles.main}>
          {source.kind === 'pick' ? (
            <div className={styles.pair}>
              {sites.length > 1 ? (
                <Field label="Site" id="save-template-site">
                  <Select
                    value={siteId}
                    onChange={(event) => {
                      setSiteId(event.target.value);
                      setPickedPage(null);
                      setFrom(null);
                      setName(null);
                      setGoal(undefined);
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
              <Field label="Trang nguồn" id="save-template-page">
                <Select
                  value={pageId ?? ''}
                  disabled={pages.data === undefined || pages.data.length === 0}
                  onChange={(event) => {
                    setPickedPage(event.target.value);
                    setFrom(null);
                    setName(null);
                    setGoal(undefined);
                  }}
                >
                  {pages.data?.length === 0 ? <option value="">Site chưa có trang</option> : null}
                  {(pages.data ?? []).map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.title} · {pageStatusLabels[item.status.kind]}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
          ) : null}
          {pages.isError || detail.isError ? (
            <Callout tone="danger" role="alert">
              Chưa đọc được trang nguồn. {problemMessage(pages.error ?? detail.error)}
            </Callout>
          ) : null}
          <Field label="Lấy từ" id="save-template-from">
            <Select
              value={kind}
              disabled={page === undefined}
              onChange={(event) => {
                setFrom(event.target.value === 'live' ? 'live' : 'draft');
              }}
            >
              {live === null ? null : <option value="live">Bản live v{live.version}</option>}
              <option value="draft">Bản nháp hiện tại</option>
            </Select>
          </Field>

          {choices.length === 0 ? null : (
            <RadioCardGroup<'new' | 'version'>
              legend="Lưu thành"
              showLegend
              minColumnWidth={240}
              value={asVersion ? 'version' : 'new'}
              onChange={(value) => {
                setTarget(value);
                setName(null);
                setErrors({});
              }}
              options={[
                { value: 'new', label: 'Template mới' },
                {
                  value: 'version',
                  label:
                    chosen === null
                      ? 'Phiên bản mới của một template'
                      : `Phiên bản mới của “${chosen.name}” (v${chosen.currentVersion} → v${chosen.currentVersion + 1})`,
                },
              ]}
            />
          )}
          {asVersion && choices.length > 1 ? (
            <Field label="Template" id="save-template-target">
              <Select
                value={chosen.id}
                onChange={(event) => {
                  setTemplateId(event.target.value);
                  setName(null);
                }}
              >
                {choices.map((template) => (
                  <option key={template.id} value={template.id}>
                    {template.name} · v{template.currentVersion}
                  </option>
                ))}
              </Select>
            </Field>
          ) : null}

          <Field label="Tên" id="save-template-name" required error={errors.name}>
            <Input
              value={effectiveName}
              maxLength={NAME_MAX}
              onChange={(event) => {
                setName(event.target.value);
                setErrors((current) => ({ ...current, name: undefined }));
              }}
            />
          </Field>
          {asVersion ? null : (
            <>
              <Field label="Mô tả ngắn" id="save-template-description" optional>
                <Input
                  value={description}
                  maxLength={DESCRIPTION_MAX}
                  onChange={(event) => {
                    setDescription(event.target.value);
                  }}
                />
              </Field>
              <GoalIndustryFields
                idPrefix="save-template"
                goal={effectiveGoal}
                industry={industry}
                onGoalChange={setGoal}
                onIndustryChange={setIndustry}
              />
            </>
          )}
          <Field label="Có gì mới trong phiên bản này" id="save-template-note" optional>
            <Input
              value={note}
              maxLength={NOTE_MAX}
              onChange={(event) => {
                setNote(event.target.value);
              }}
            />
          </Field>
          <RadioCardGroup<TemplateContentMode>
            legend="Nội dung"
            showLegend
            minColumnWidth={240}
            value={content}
            onChange={setContent}
            options={[
              {
                value: 'sample',
                label: 'Đánh dấu toàn bộ chữ là chữ mẫu',
                description: 'Trang tạo sau phải thay chữ trước khi xuất bản. Khung ảnh để trống.',
              },
              { value: 'keep', label: 'Giữ chữ và ảnh như hiện tại' },
            ]}
          />
        </div>

        <div className={styles.side}>
          <span className={styles.sideTitle}>Ảnh thu nhỏ</span>
          {outline === null ? (
            <p className={styles.quiet}>
              {kind === 'live'
                ? 'Ảnh thu nhỏ được vẽ từ bản live khi lưu.'
                : 'Chọn một trang để xem ảnh thu nhỏ.'}
            </p>
          ) : (
            <TemplateThumb
              sections={outline}
              themePresetId={site?.themePresetId ?? DEFAULT_THEME_PRESET}
              label={`Ảnh thu nhỏ vẽ từ trang: ${page?.page.title ?? ''}`}
              className={styles.thumb}
            />
          )}
          {asVersion ? null : (
            <TemplateScopeField
              idPrefix="save-template"
              scope={scope}
              sites={sites}
              error={errors.scope}
              onChange={(next) => {
                setScope(next);
                setErrors((current) => ({ ...current, scope: undefined }));
              }}
            />
          )}
          <p className={styles.notSaved}>
            <strong>Không lưu vào template:</strong> lead, tên miền, nơi nhận lead, nội dung đồng ý,
            đường dẫn và SEO riêng của trang, nút dẫn tới trang khác của site.
          </p>
        </div>
      </div>

      {unshown === null ? null : (
        <Callout
          tone={failure instanceof ApiError && failure.status === 409 ? 'warning' : 'danger'}
          role="alert"
        >
          {unshown}
        </Callout>
      )}

      <div className={styles.footer}>
        {kept === null ? <span /> : <span className={styles.quiet}>{kept}</span>}
        <span className={styles.actions}>
          <Button
            variant="secondary"
            disabled={save.isPending}
            onClick={() => {
              onOpenChange(false);
            }}
          >
            Hủy
          </Button>
          <Button
            type="submit"
            loading={save.isPending}
            disabled={page === undefined || detail.isFetching}
            onMouseDown={keepFieldFocus}
          >
            {asVersion ? `Lưu phiên bản v${chosen.currentVersion + 1}` : 'Lưu template'}
          </Button>
        </span>
      </div>
    </form>
  );
}

/**
 * "Lưu trang thành template" (board 19, ADR-030): a page's live release or draft, as a new
 * template or a new version of one, its texts marked as sample or kept. Leads, domains, consent,
 * slug and SEO never go into a template.
 */
export function SaveTemplateDialog({ open, onOpenChange, ...form }: SaveTemplateDialogProps) {
  const saving = useIsMutating({ mutationKey: savingKey }) > 0;
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        // A template being saved cannot be dismissed half-way: its answer shows here.
        if (!next && saving) {
          return;
        }
        onOpenChange(next);
      }}
      title="Lưu trang thành template"
      size="lg"
    >
      <SaveTemplateForm {...form} onOpenChange={onOpenChange} />
    </Dialog>
  );
}
