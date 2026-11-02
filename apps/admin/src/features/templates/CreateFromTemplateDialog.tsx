'use client';

import {
  type Access,
  can,
  createPageRequestSchema,
  endpoints,
  holdersOf,
  type Site,
  type TemplateSiteReadiness,
  type TemplateSummary,
} from '@plp/contracts';
import { Button, Callout, Dialog, Field, Input, Select } from '@plp/ui';
import { useIsMutating, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { type SubmitEvent, useState } from 'react';
import { api, ApiError } from '../../lib/api';
import { hostOf } from '../../lib/site-url';
import { siteQueryKeys } from '../dashboard/queries';
import { PageSlugField } from '../onboarding/PageSlugField';
import { useSlugAvailability } from '../onboarding/use-slug-availability';
import { suggestSlug } from '../onboarding/wizard-state';
import { finalizeSlug, normalizeSlugTyping } from '../seo/seo-presentation';
import { leadRecipientsHref, pageHref, privacyHref } from '../shell/navigation';
import { problemBesideFields, reportUnexpected } from '../shell/problem-message';
import { keepFieldFocus } from '../shell/use-schema-form';
import { readinessQuery, templateQueryKeys } from './queries';
import { setupGap } from './readiness';
import { archivedHint } from './workspace-templates';
import styles from './CreateFromTemplateDialog.module.css';

const TITLE_MAX = 120;

type FormField = 'title' | 'slug';
type FormErrors = Partial<Record<FormField, string>>;

const fieldIds: Record<FormField, string> = {
  title: 'template-page-title',
  slug: 'template-page-slug',
};

/** The template a page is made from: what the request names, and what the dialog shows. */
export type DialogTemplate = Pick<
  TemplateSummary,
  'id' | 'source' | 'version' | 'name' | 'hasForm'
>;

/** The page being created from this dialog, which keeps it open meanwhile. */
function creatingKey(templateId: string) {
  return ['template-page', templateId] as const;
}

function withoutError(errors: FormErrors, field: FormField): FormErrors {
  if (field === 'title') {
    return errors.slug === undefined ? {} : { slug: errors.slug };
  }
  return errors.title === undefined ? {} : { title: errors.title };
}

export interface CreateFromTemplateDialogProps {
  workspaceId: string;
  template: DialogTemplate;
  /** Sites the user may create pages in (`pages.edit`, within their sites). Never empty. */
  sites: readonly Site[];
  /** The site chosen on the screen ("Tạo trang cho"); the dialog may change it. */
  initialSiteId: string;
  /** What that site needs, when the screen already knows it (board 18). */
  initialReadiness?: TemplateSiteReadiness | null | undefined;
  role: Access;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /**
   * The template is not as shown: the API has a newer version ("Xem phiên bản mới"), or it was
   * archived meanwhile (called at once). The screen reads it again.
   */
  onTemplateChanged: () => void;
}

/** The bold gap, then what to do about it, linking the screens that fix it for who may. */
function SetupNote({
  gap,
  siteId,
  site,
  role,
}: {
  gap: string;
  siteId: string;
  site: TemplateSiteReadiness;
  role: Access;
}) {
  const fixes = can(role, 'privacy.manage');
  const recipients = site.confirmedRecipients === 0;
  const consent = site.consentGaps.length > 0;
  return (
    <Callout tone="warning" role="note">
      <strong>{gap}</strong> Bạn vẫn tạo được bản nháp. Trước khi xuất bản,{' '}
      {fixes ? (
        <>
          hãy thiết lập ở{' '}
          {consent ? (
            <Link href={privacyHref(siteId)} className={styles.link}>
              Dữ liệu &amp; đồng ý
            </Link>
          ) : null}
          {consent && recipients ? ' và ' : null}
          {recipients ? (
            <Link href={leadRecipientsHref(siteId)} className={styles.link}>
              Nơi nhận lead
            </Link>
          ) : null}
          ;
        </>
      ) : (
        `${holdersOf('privacy.manage')} cần thiết lập cho site;`
      )}{' '}
      checklist xuất bản sẽ chặn nếu còn thiếu.
    </Callout>
  );
}

function CreateFromTemplateForm({
  workspaceId,
  template,
  sites,
  initialSiteId,
  initialReadiness,
  role,
  onOpenChange,
  onTemplateChanged,
}: Omit<CreateFromTemplateDialogProps, 'open'>) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [siteId, setSiteId] = useState(initialSiteId);
  const [title, setTitle] = useState(template.name);
  const [slug, setSlug] = useState(() => suggestSlug(template.name));
  const [slugEdited, setSlugEdited] = useState(false);
  const [errors, setErrors] = useState<FormErrors>({});
  const site = sites.find((item) => item.id === siteId) ?? sites[0];
  const check = useSlugAvailability(siteId, slug);
  const readiness = useQuery({
    ...readinessQuery(workspaceId, template.id, siteId),
    enabled: template.hasForm,
    ...(siteId === initialSiteId && initialReadiness ? { initialData: initialReadiness } : {}),
  });

  const body = () => ({
    title,
    slug: finalizeSlug(slug),
    start: {
      kind: 'template' as const,
      source: template.source,
      templateId: template.id,
      version: template.version,
    },
  });

  const create = useMutation({
    mutationKey: creatingKey(template.id),
    mutationFn: () => api(endpoints.createPage, [siteId], { body: body() }),
    onSuccess: (detail) => {
      void queryClient.invalidateQueries({ queryKey: siteQueryKeys.site(siteId) });
      router.push(pageHref(siteId, detail.page.id, 'edit'));
    },
    onError: (error) => {
      if (error instanceof ApiError && error.code === 'template_archived') {
        // Every list that offers it is read again, the screen too; the dialog says why.
        void queryClient.invalidateQueries({ queryKey: templateQueryKeys.all(workspaceId) });
        onTemplateChanged();
        return;
      }
      if (error instanceof ApiError) {
        const fields = error.fieldErrors();
        const slugMessage =
          fields.slug ?? (error.code === 'slug_taken' ? error.problem.title : undefined);
        if (fields.title !== undefined || slugMessage !== undefined) {
          setErrors({
            ...(fields.title === undefined ? {} : { title: fields.title }),
            ...(slugMessage === undefined ? {} : { slug: slugMessage }),
          });
        }
        return;
      }
      reportUnexpected('Creating a page from a template failed', error);
    },
  });

  function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsed = createPageRequestSchema.safeParse(body());
    const next: FormErrors = {};
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        const field = issue.path[0];
        if ((field === 'title' || field === 'slug') && next[field] === undefined) {
          next[field] = issue.message;
        }
      }
    }
    if (next.slug === undefined && check.state === 'rejected') {
      next.slug = check.message;
    }
    setErrors(next);
    const first = (['title', 'slug'] as const).find((field) => next[field] !== undefined);
    if (first !== undefined) {
      document.getElementById(fieldIds[first])?.focus();
      return;
    }
    create.mutate();
  }

  const failure = create.error;
  const templateChanged = failure instanceof ApiError && failure.code === 'template_changed';
  const templateArchived = failure instanceof ApiError && failure.code === 'template_archived';
  // A slug another page took shows on its field, as do the issues of the title and the slug.
  const unshown =
    failure === null || (failure instanceof ApiError && failure.code === 'slug_taken')
      ? null
      : problemBesideFields(failure, ['title', 'slug']);
  const gap =
    template.hasForm && readiness.data !== undefined && site !== undefined
      ? setupGap(true, site.name, readiness.data)
      : null;

  return (
    <form noValidate onSubmit={submit} className={styles.form}>
      <Field label="Site" id="template-page-site">
        <Select
          value={siteId}
          onChange={(event) => {
            setSiteId(event.target.value);
            setErrors((current) => withoutError(current, 'slug'));
          }}
        >
          {sites.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Tên trang" id={fieldIds.title} required error={errors.title}>
        <Input
          value={title}
          maxLength={TITLE_MAX}
          onChange={(event) => {
            const value = event.target.value;
            setTitle(value);
            if (!slugEdited) {
              setSlug(suggestSlug(value));
            }
            setErrors((current) => withoutError(current, 'title'));
          }}
        />
      </Field>
      <PageSlugField
        id={fieldIds.slug}
        host={site === undefined ? '' : hostOf(site.publicOrigin)}
        value={slug}
        error={errors.slug}
        check={check}
        onChange={(value) => {
          setSlug(normalizeSlugTyping(value));
          setSlugEdited(true);
          setErrors((current) => withoutError(current, 'slug'));
        }}
        onBlur={() => {
          setSlug((current) => finalizeSlug(current));
        }}
      />
      {gap !== null && readiness.data !== undefined ? (
        <SetupNote gap={gap} siteId={siteId} site={readiness.data} role={role} />
      ) : null}
      {readiness.isError ? (
        <p className={styles.quiet}>
          Chưa kiểm tra được site cần gì cho form. Checklist xuất bản vẫn kiểm tra trước khi live.
        </p>
      ) : null}
      {templateChanged ? (
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
      ) : unshown === null ? null : (
        <Callout tone="danger" role="alert">
          {unshown}
        </Callout>
      )}
      <div className={styles.actions}>
        <Button
          variant="secondary"
          disabled={create.isPending}
          onClick={() => {
            onOpenChange(false);
          }}
        >
          Hủy
        </Button>
        <Button
          type="submit"
          loading={create.isPending}
          disabled={templateChanged || templateArchived}
          onMouseDown={keepFieldFocus}
        >
          Tạo bản nháp và mở editor
        </Button>
      </div>
    </form>
  );
}

/**
 * "Tạo trang từ mẫu" (board 18): the site, the page's name and address, and what the site still
 * needs for the template's form. It creates the draft and opens the editor (ADR-030).
 */
export function CreateFromTemplateDialog({
  open,
  onOpenChange,
  ...form
}: CreateFromTemplateDialogProps) {
  const creating = useIsMutating({ mutationKey: creatingKey(form.template.id) }) > 0;
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        // A page being created cannot be dismissed half-way: its answer shows here.
        if (!next && creating) {
          return;
        }
        onOpenChange(next);
      }}
      title="Tạo trang từ mẫu"
      description="Trang mới là bản nháp. Chưa ai thấy cho tới khi bạn xuất bản."
    >
      {/* A new form for every opening and every version: nothing typed for another one stays. */}
      <CreateFromTemplateForm
        key={`${form.template.id}@${form.template.version}`}
        {...form}
        onOpenChange={onOpenChange}
      />
    </Dialog>
  );
}
