'use client';

import { type Asset, endpoints, type Site, siteNameSchema } from '@plp/contracts';
import { Button, Callout, Card, Field, Input, useToast } from '@plp/ui';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { type SubmitEvent, useId, useRef, useState } from 'react';
import { api, ApiError } from '../../lib/api';
import { AssetField } from '../assets';
import { siteQueryKeys } from '../dashboard/queries';
import { problemMessage, reportUnexpected } from '../shell/problem-message';
import { fieldError } from '../shell/use-schema-form';
import { ThemePicker } from '../theme';
import {
  hasChanges,
  settingsChanges,
  type SiteSettingsValues,
  settingsValuesOf,
} from './site-settings';
import styles from './SiteSettingsForm.module.css';

/** Same bound as `siteNameSchema`. */
const NAME_MAX = 80;
const SHARE_IMAGE_SIZE = '1200 × 630 px';

export interface SiteSettingsFormProps {
  site: Site;
  /** The logo and default share image, when they exist. */
  assets: Asset[];
  /** Only the workspace owner changes site settings (ADR-004). */
  canEdit: boolean;
}

const UNTOUCHED = { logo: false, shareImage: false };

/**
 * "Cài đặt site": name, theme, logo and default share image. Owners save only what changed;
 * editors see the same settings read-only.
 */
export function SiteSettingsForm({ site, assets, canEdit }: SiteSettingsFormProps) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const nameRef = useRef<HTMLInputElement>(null);
  const themeHeadingId = useId();
  // The saved site: the baseline for "what changed" until the server sends the page again.
  const [saved, setSaved] = useState(site);
  const [values, setValues] = useState<SiteSettingsValues>(() => settingsValuesOf(site, assets));
  const [touched, setTouched] = useState(UNTOUCHED);
  const [nameError, setNameError] = useState<string | undefined>(undefined);
  const patch = settingsChanges(saved, values, touched);
  const changed = hasChanges(patch);
  const disabled = !canEdit;

  const save = useMutation({
    mutationFn: () => api(endpoints.updateSite, [site.id], { body: patch }),
    onSuccess: (updated) => {
      setSaved(updated);
      setTouched(UNTOUCHED);
      setValues((current) => ({ ...current, name: updated.name }));
      toast({ tone: 'success', title: 'Đã lưu cài đặt site' });
      void queryClient.invalidateQueries({ queryKey: siteQueryKeys.site(site.id) });
      // The sidebar, the site switcher and the dashboard read the site on the server.
      router.refresh();
    },
    onError: (error) => {
      if (error instanceof ApiError) {
        const fieldMessage = error.fieldErrors().name;
        if (fieldMessage !== undefined) {
          setNameError(fieldMessage);
          nameRef.current?.focus();
        }
        return;
      }
      reportUnexpected('Saving the site settings failed', error);
    },
  });

  function setValue<K extends keyof SiteSettingsValues>(key: K, value: SiteSettingsValues[K]) {
    save.reset();
    setValues((current) => ({ ...current, [key]: value }));
  }

  function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    const problem = fieldError(siteNameSchema, values.name);
    setNameError(problem);
    if (problem !== undefined) {
      nameRef.current?.focus();
      return;
    }
    if (changed) {
      save.mutate();
    }
  }

  function reset() {
    save.reset();
    setValues(settingsValuesOf(saved, [values.logo, values.shareImage, ...assets].filter(isAsset)));
    setTouched(UNTOUCHED);
    setNameError(undefined);
  }

  // A name problem from the server shows on the field itself.
  const nameRejected =
    save.error instanceof ApiError && save.error.fieldErrors().name !== undefined;
  const formError = save.error === null || nameRejected ? null : problemMessage(save.error);

  return (
    <form className={styles.form} noValidate onSubmit={submit}>
      {canEdit ? null : (
        <Callout tone="info">Chỉ Owner của workspace được thay đổi cài đặt site.</Callout>
      )}

      <Card as="section" padding="lg" aria-labelledby="site-identity" className={styles.card}>
        <h2 id="site-identity" className={styles.cardTitle}>
          Thông tin site
        </h2>
        <Field
          label="Tên site"
          required
          error={nameError}
          counter={canEdit ? { length: values.name.length, max: NAME_MAX } : undefined}
          help="Hiện trong admin và làm tên thương hiệu mặc định trên thanh điều hướng, chân trang."
        >
          <Input
            ref={nameRef}
            value={values.name}
            maxLength={NAME_MAX}
            disabled={disabled}
            onChange={(event) => {
              setValue('name', event.target.value);
              if (nameError !== undefined) {
                setNameError(fieldError(siteNameSchema, event.target.value));
              }
            }}
            onBlur={() => {
              if (canEdit) {
                setNameError(fieldError(siteNameSchema, values.name));
              }
            }}
          />
        </Field>
        <AssetField
          label="Logo"
          siteId={site.id}
          value={values.logo}
          disabled={disabled}
          help="Hiện trên thanh điều hướng của mọi trang. Nên dùng ảnh nền trong suốt."
          onChange={(asset) => {
            setTouched((current) => ({ ...current, logo: true }));
            setValue('logo', asset);
          }}
        />
        <AssetField
          label="Ảnh chia sẻ mặc định"
          siteId={site.id}
          value={values.shareImage}
          disabled={disabled}
          recommendedSize={SHARE_IMAGE_SIZE}
          help={`Khuyên dùng ${SHARE_IMAGE_SIZE}. Dùng khi một trang chưa chọn ảnh chia sẻ riêng.`}
          onChange={(asset) => {
            setTouched((current) => ({ ...current, shareImage: true }));
            setValue('shareImage', asset);
          }}
        />
      </Card>

      <Card as="section" padding="lg" aria-labelledby={themeHeadingId} className={styles.card}>
        <div className={styles.cardHeading}>
          <h2 id={themeHeadingId} className={styles.cardTitle}>
            Giao diện
          </h2>
          <p className={styles.cardDescription}>
            Màu và kiểu chữ dùng chung cho mọi trang của site. Mọi bảng màu đều đạt tương phản AA.
          </p>
        </div>
        <ThemePicker
          legend="Giao diện"
          value={values.themePresetId}
          disabled={disabled}
          onChange={(themePresetId) => {
            setValue('themePresetId', themePresetId);
          }}
        />
      </Card>

      {formError === null ? null : (
        <Callout tone="danger" role="alert" title="Chưa lưu được cài đặt">
          {formError}
        </Callout>
      )}

      {canEdit ? (
        <div className={styles.actions}>
          <Button variant="secondary" disabled={!changed || save.isPending} onClick={reset}>
            Hủy thay đổi
          </Button>
          <Button type="submit" loading={save.isPending} disabled={!changed}>
            Lưu cài đặt
          </Button>
        </div>
      ) : null}
    </form>
  );
}

function isAsset(value: Asset | null): value is Asset {
  return value !== null;
}
