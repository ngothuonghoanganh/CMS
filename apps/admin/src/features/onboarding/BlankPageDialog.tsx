'use client';

import { createPageRequestSchema, endpoints, type Site } from '@plp/contracts';
import { Button, Callout, Dialog, Field, Input } from '@plp/ui';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { type SubmitEvent, useState } from 'react';
import { api, ApiError } from '../../lib/api';
import { siteQueryKeys } from '../dashboard/queries';
import { finalizeSlug, normalizeSlugTyping } from '../seo/seo-presentation';
import { pageHref } from '../shell/navigation';
import { problemMessage, reportUnexpected } from '../shell/problem-message';
import { PageSlugField } from './PageSlugField';
import { useSlugAvailability } from './use-slug-availability';
import { suggestSlug } from './wizard-state';
import styles from './CreatePageWizard.module.css';

const TITLE_MAX = 120;
const FORM_ID = 'blank-page-form';

type BlankField = 'title' | 'slug';
type BlankErrors = Partial<Record<BlankField, string>>;

function withoutError(errors: BlankErrors, field: BlankField): BlankErrors {
  if (field === 'title') {
    return errors.slug === undefined ? {} : { slug: errors.slug };
  }
  return errors.title === undefined ? {} : { title: errors.title };
}

export interface BlankPageDialogProps {
  site: Site;
  host: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function BlankPageForm({ site, host, onOpenChange }: Omit<BlankPageDialogProps, 'open'>) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [title, setTitle] = useState('');
  const [slug, setSlug] = useState('');
  const [slugEdited, setSlugEdited] = useState(false);
  const [errors, setErrors] = useState<BlankErrors>({});
  const check = useSlugAvailability(site.id, slug);

  const create = useMutation({
    mutationFn: () =>
      api(endpoints.createPage, [site.id], {
        body: { title, slug: finalizeSlug(slug), start: { kind: 'blank' } },
      }),
    onSuccess: (detail) => {
      void queryClient.invalidateQueries({ queryKey: siteQueryKeys.site(site.id) });
      router.push(pageHref(site.id, detail.page.id, 'edit'));
    },
    onError: (error) => {
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
      reportUnexpected('Creating a blank page failed', error);
    },
  });

  function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsed = createPageRequestSchema.safeParse({
      title,
      slug: finalizeSlug(slug),
      start: { kind: 'blank' },
    });
    const next: BlankErrors = {};
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
      document.getElementById(`blank-page-${first}`)?.focus();
      return;
    }
    create.mutate();
  }

  const fieldProblem =
    create.error instanceof ApiError &&
    (create.error.code === 'slug_taken' || Object.keys(create.error.fieldErrors()).length > 0);

  return (
    <form id={FORM_ID} noValidate onSubmit={submit} className={styles.blankForm}>
      <Field label="Tên trang" id="blank-page-title" required error={errors.title}>
        <Input
          value={title}
          maxLength={TITLE_MAX}
          placeholder="Ví dụ: Bảng giá dịch vụ"
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
        id="blank-page-slug"
        host={host}
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
      {create.error === null || fieldProblem ? null : (
        <Callout tone="danger" role="alert">
          {problemMessage(create.error)}
        </Callout>
      )}
      <div className={styles.blankActions}>
        <Button
          variant="secondary"
          disabled={create.isPending}
          onClick={() => {
            onOpenChange(false);
          }}
        >
          Hủy
        </Button>
        <Button type="submit" loading={create.isPending}>
          Tạo trang trống
        </Button>
      </div>
    </form>
  );
}

/** "Bắt đầu trống": a page without sections, named and placed before the editor opens. */
export function BlankPageDialog({ site, host, open, onOpenChange }: BlankPageDialogProps) {
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Bắt đầu trống"
      description="Trang mới chưa có section nào. Bạn tự thêm section trong editor."
    >
      <BlankPageForm site={site} host={host} onOpenChange={onOpenChange} />
    </Dialog>
  );
}
