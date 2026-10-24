'use client';

import {
  type CreateSiteRequest,
  createSiteRequestSchema,
  DEFAULT_THEME_PRESET,
  endpoints,
  slugify,
  type ThemePresetId,
  themePresetIdSchema,
  themePresetIds,
} from '@plp/contracts';
import { themePresets } from '@plp/sections/schema';
import {
  Button,
  ButtonLink,
  Callout,
  CheckCircleIcon,
  Field,
  Input,
  RadioCardGroup,
  type RadioCardOption,
  Spinner,
} from '@plp/ui';
import { useMutation } from '@tanstack/react-query';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { type SubmitEvent, type ReactNode, useState } from 'react';
import { api, ApiError } from '../../lib/api';
import { defaultHostPreview } from '../../lib/site-url';
import { siteHref } from '../shell/navigation';
import { problemMessage, reportUnexpected } from '../shell/problem-message';
import { firstInvalidField, useSchemaForm } from '../shell/use-schema-form';
import { ThemeSwatches } from './ThemeSwatches';
import {
  type SubdomainAvailabilityState,
  useSubdomainAvailability,
} from './use-subdomain-availability';
import styles from './CreateSiteForm.module.css';

/** Same bound as `subdomainFormatSchema`. */
const SUBDOMAIN_MAX = 40;
const SITE_NAME_MAX = 80;

type SiteField = 'name' | 'subdomain' | 'themePresetId';

const fieldIds: Record<SiteField, string> = {
  name: 'site-name',
  subdomain: 'site-subdomain',
  themePresetId: 'site-theme',
};
const fieldOrder: readonly SiteField[] = ['name', 'subdomain', 'themePresetId'];

const themeOptions: ReadonlyArray<RadioCardOption<ThemePresetId>> = themePresetIds.map((id) => {
  const preset = themePresets[id];
  return {
    value: id,
    label: preset.label,
    description: preset.description,
    preview: <ThemeSwatches preset={preset} />,
  };
});

export interface CreateSiteFormProps {
  workspaceId: string;
  /** `PUBLIC_SITE_ORIGIN_TEMPLATE`, e.g. "https://{subdomain}.payload.site". */
  originTemplate: string;
  /** Where "Hủy" goes; null when the workspace has no site to go back to. */
  cancelHref: string | null;
}

function availabilityStatus(state: SubdomainAvailabilityState): ReactNode {
  switch (state.kind) {
    case 'checking':
      return (
        <span className={styles.checking}>
          <Spinner size={14} /> Đang kiểm tra tên miền con…
        </span>
      );
    case 'available':
      return (
        <span className={styles.available}>
          <CheckCircleIcon size={16} /> Tên miền con này dùng được.
        </span>
      );
    case 'failed':
      return (
        <span className={styles.failed}>
          Chưa kiểm tra được tên miền con. Bạn vẫn có thể tạo site, hệ thống sẽ kiểm tra lại.
        </span>
      );
    case 'idle':
    case 'unavailable':
      return null;
  }
}

/** "Tạo site khách hàng": name, default subdomain with a live availability check, and theme. */
export function CreateSiteForm({ workspaceId, originTemplate, cancelHref }: CreateSiteFormProps) {
  const router = useRouter();
  const form = useSchemaForm(createSiteRequestSchema, {
    name: '',
    subdomain: '',
    themePresetId: DEFAULT_THEME_PRESET,
  });
  // The subdomain follows the name until the user edits it.
  const [subdomainEdited, setSubdomainEdited] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const availability = useSubdomainAvailability(form.values.subdomain);

  const create = useMutation({
    mutationFn: (body: CreateSiteRequest) => api(endpoints.createSite, [workspaceId], { body }),
    onSuccess: (site) => {
      router.push(siteHref(site.id));
    },
    onError: (error) => {
      reportUnexpected('Site creation failed', error);
      const fieldErrors = error instanceof ApiError ? error.fieldErrors() : {};
      if (Object.keys(fieldErrors).length > 0) {
        form.setServerErrors(fieldErrors);
        const field = firstInvalidField(fieldOrder, fieldErrors);
        if (field !== undefined) {
          document.getElementById(fieldIds[field])?.focus();
        }
        return;
      }
      setFormError(problemMessage(error));
    },
  });

  function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);
    const result = form.validate();
    if (!result.ok) {
      const field = firstInvalidField(fieldOrder, result.errors);
      if (field !== undefined) {
        document.getElementById(fieldIds[field])?.focus();
      }
      return;
    }
    if (availability.kind === 'unavailable') {
      document.getElementById(fieldIds.subdomain)?.focus();
      return;
    }
    create.mutate(result.data);
  }

  const subdomainError =
    form.errors.subdomain ??
    (availability.kind === 'unavailable' ? availability.message : undefined);
  const host = defaultHostPreview(originTemplate, form.values.subdomain || 'ten-mien-con');
  const theme = themePresetIdSchema.safeParse(form.values.themePresetId);

  return (
    <form noValidate className={styles.form} onSubmit={handleSubmit}>
      <Field
        label="Tên site"
        id={fieldIds.name}
        required
        help="Thường là tên khách hàng hoặc thương hiệu, ví dụ: Nha khoa Smile Care."
        error={form.errors.name}
        counter={{ length: form.values.name.length, max: SITE_NAME_MAX }}
      >
        <Input
          name="name"
          autoComplete="off"
          placeholder="Nha khoa Smile Care"
          value={form.values.name}
          onChange={(event) => {
            const name = event.target.value;
            form.setValue('name', name);
            if (!subdomainEdited) {
              form.setValue('subdomain', slugify(name, SUBDOMAIN_MAX));
            }
          }}
          onBlur={() => {
            form.blur('name');
          }}
        />
      </Field>

      <div className={styles.subdomain}>
        <Field
          label="Tên miền con"
          id={fieldIds.subdomain}
          required
          help={
            <>
              Địa chỉ mặc định: <span className={styles.host}>{host}</span>. Không đổi được sau khi
              tạo site.
            </>
          }
          error={subdomainError}
        >
          <Input
            name="subdomain"
            mono
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            maxLength={SUBDOMAIN_MAX}
            placeholder="smilecare"
            value={form.values.subdomain}
            onChange={(event) => {
              setSubdomainEdited(true);
              form.setValue('subdomain', event.target.value.toLowerCase());
            }}
            onBlur={() => {
              form.blur('subdomain');
            }}
          />
        </Field>
        <p className={styles.status} role="status">
          {availabilityStatus(availability)}
        </p>
      </div>

      <div id={fieldIds.themePresetId} tabIndex={-1} className={styles.theme}>
        <RadioCardGroup
          legend="Giao diện"
          showLegend
          name="themePresetId"
          options={themeOptions}
          value={theme.success ? theme.data : null}
          minColumnWidth={170}
          onChange={(value) => {
            form.setValue('themePresetId', value);
          }}
        />
        <p className={styles.themeHelp}>
          Màu và chữ của toàn site. Owner đổi được sau trong Cài đặt site.
        </p>
      </div>

      {formError === null ? null : (
        <Callout tone="danger" role="alert">
          {formError}
        </Callout>
      )}

      <div className={styles.actions}>
        {cancelHref === null ? null : (
          <ButtonLink as={Link} href={cancelHref} variant="secondary">
            Hủy
          </ButtonLink>
        )}
        <Button type="submit" loading={create.isPending || create.isSuccess}>
          Tạo site
        </Button>
      </div>
    </form>
  );
}
