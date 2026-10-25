'use client';

import { EMPTY_IMAGE, imageRefSchema } from '@plp/contracts';
import { getAtPath, type ImageField } from '@plp/sections/schema';
import { Button, Checkbox, Field, Input } from '@plp/ui';
import { useState } from 'react';
import { AssetPickerDialog, AssetThumb } from '../../assets';
import { ALT_MAX_LENGTH } from '../content-fields';
import { useEditor, useEditorServices, useEditorStoreApi } from '../editor-context';
import type { ControlProps } from './field-shared';
import styles from './fields.module.css';

/**
 * An image used in a section: the asset, its description for this use and the "decorative" flag
 * (ARCHITECTURE §2.1 rule 3). Picking an asset copies the asset's default description.
 */
export function ImageControl({ section, field, path }: ControlProps<ImageField>) {
  const store = useEditorStoreApi();
  const { siteId } = useEditorServices();
  const [pickerOpen, setPickerOpen] = useState(false);
  const parsed = imageRefSchema.safeParse(getAtPath(section.content, path));
  const image = parsed.success ? parsed.data : EMPTY_IMAGE;
  const asset = useEditor((state) =>
    image.assetId === null ? undefined : state.assetsById[image.assetId],
  );
  const chosen = image.assetId !== null;
  const missingAlt = chosen && !image.decorative && image.alt.trim() === '';
  const altPath = `${path}.alt`;

  return (
    <fieldset data-field-path={path} className={styles.group}>
      <legend className={styles.groupLegend}>{field.label}</legend>
      <div className={styles.imageRow}>
        <AssetThumb asset={asset ?? null} />
        <Button
          variant="secondary"
          size="sm"
          data-field-focus={chosen ? undefined : ''}
          onClick={() => {
            setPickerOpen(true);
          }}
        >
          {chosen ? 'Thay ảnh' : 'Chọn ảnh'}
        </Button>
        {chosen ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              store.getState().updateContent(section.id, path, { ...EMPTY_IMAGE });
            }}
          >
            Gỡ ảnh
          </Button>
        ) : null}
      </div>
      {chosen && !asset ? (
        <p className={styles.note}>Ảnh này không còn trong thư viện của site. Hãy chọn ảnh khác.</p>
      ) : null}
      {field.recommendedSize ? (
        <p className={styles.note}>Khuyên dùng {field.recommendedSize}.</p>
      ) : null}
      <div data-field-path={altPath}>
        <Field
          label="Mô tả ảnh cho người dùng trình đọc màn hình"
          warning={missingAlt ? 'Cảnh báo: chưa có mô tả ảnh' : undefined}
          counter={{ length: image.alt.length, max: ALT_MAX_LENGTH }}
        >
          <Input
            value={image.alt}
            maxLength={ALT_MAX_LENGTH}
            placeholder="Ví dụ: Bác sĩ tư vấn cho khách hàng"
            data-field-focus={chosen ? '' : undefined}
            onChange={(event) => {
              store.getState().updateContent(section.id, altPath, event.target.value, {
                merge: true,
              });
            }}
            onBlur={() => {
              store.getState().closeHistoryStep();
            }}
          />
        </Field>
      </div>
      <div data-field-path={`${path}.decorative`}>
        <Checkbox
          label="Ảnh chỉ để trang trí"
          checked={image.decorative}
          onChange={(event) => {
            store.getState().updateContent(section.id, `${path}.decorative`, event.target.checked);
          }}
        />
      </div>
      <AssetPickerDialog
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        siteId={siteId}
        recommendedSize={field.recommendedSize}
        onSelect={(selection, picked) => {
          store.getState().addAssets([picked]);
          store.getState().updateContent(section.id, path, selection);
        }}
      />
    </fieldset>
  );
}
