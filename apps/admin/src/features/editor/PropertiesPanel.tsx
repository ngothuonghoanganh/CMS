'use client';

import {
  colorSchemeIds,
  mobileOrderLabels,
  mobileOrderSchema,
  type SectionInstance,
  spacingLabels,
  spacingPresets,
} from '@plp/contracts';
import { getSectionDefinition, getVariant, themePresets } from '@plp/sections/schema';
import {
  CheckIcon,
  CloseIcon,
  Field,
  IconButton,
  SegmentedControl,
  Select,
  SettingsIcon,
  Switch,
} from '@plp/ui';
import { isFieldHidden } from './content-fields';
import { useEditor, useEditorServices, useEditorStoreApi } from './editor-context';
import { FieldControl } from './fields/FieldControl';
import { focusOutlineRow, PROPERTIES_PANEL_ID } from './focus-target';
import { GuardedLink } from './GuardedLink';
import styles from './PropertiesPanel.module.css';
import { SectionThumbnail } from './SectionThumbnail';

function ContentGroup({ section }: { section: SectionInstance }) {
  const definition = getSectionDefinition(section.type);
  const fields = definition.fields.filter((field) => !isFieldHidden(section, field.key));
  return (
    <div className={styles.group}>
      <h3 className={styles.groupTitle}>NỘI DUNG</h3>
      {fields.map((field) => (
        <FieldControl key={field.key} section={section} field={field} path={field.key} />
      ))}
    </div>
  );
}

function LayoutGroup({ section }: { section: SectionInstance }) {
  const store = useEditorStoreApi();
  const themePresetId = useEditor((state) => state.site.themePresetId);
  const definition = getSectionDefinition(section.type);
  const schemes = themePresets[themePresetId].schemes;
  return (
    <div className={styles.group}>
      <h3 className={styles.groupTitle}>BỐ CỤC</h3>
      {definition.variants.length > 1 ? (
        <div role="group" aria-label="Kiểu bố cục" className={styles.variants}>
          {definition.variants.map((variant) => (
            <button
              key={variant.id}
              type="button"
              aria-pressed={variant.id === section.variant}
              className={styles.variant}
              title={variant.description}
              onClick={() => {
                store.getState().setVariant(section.id, variant.id);
              }}
            >
              <SectionThumbnail type={section.type} variant={variant.id} size="sm" />
              {variant.label}
            </button>
          ))}
        </div>
      ) : null}
      <div className={styles.row}>
        <span className={styles.rowHeader}>
          <span className={styles.rowLabel}>Bảng màu</span>
          <span className={styles.aa}>
            <CheckIcon size={12} strokeWidth={2.4} />
            Đạt tương phản AA
          </span>
        </span>
        <div role="group" aria-label="Bảng màu của section" className={styles.schemes}>
          {colorSchemeIds.map((id) => {
            const scheme = schemes[id];
            return (
              <button
                key={id}
                type="button"
                aria-pressed={id === section.colorScheme}
                aria-label={scheme.label}
                className={styles.scheme}
                onClick={() => {
                  store.getState().setColorScheme(section.id, id);
                }}
              >
                <span
                  aria-hidden="true"
                  className={styles.swatch}
                  style={{
                    background: scheme.background,
                    color: scheme.heading,
                    borderColor: scheme.border,
                  }}
                >
                  Aa
                  <span className={styles.swatchAccent} style={{ background: scheme.accent }} />
                </span>
                {scheme.label}
              </button>
            );
          })}
        </div>
      </div>
      <div className={styles.row}>
        <span className={styles.rowLabel}>Khoảng cách</span>
        <SegmentedControl
          aria-label="Khoảng cách"
          fullWidth
          value={section.spacing}
          options={spacingPresets.map((preset) => ({
            value: preset,
            label: spacingLabels[preset],
          }))}
          onChange={(spacing) => {
            store.getState().setSpacing(section.id, spacing);
          }}
        />
      </div>
    </div>
  );
}

function VisibilityGroup({ section }: { section: SectionInstance }) {
  const store = useEditorStoreApi();
  const variant = getVariant(getSectionDefinition(section.type), section.variant);
  return (
    <div className={styles.group}>
      <h3 className={styles.groupTitle}>HIỂN THỊ</h3>
      <Switch
        label="Hiện trên máy tính"
        checked={section.visibility.desktop}
        onCheckedChange={(visible) => {
          store.getState().setVisibility(section.id, 'desktop', visible);
        }}
      />
      <Switch
        label="Hiện trên điện thoại"
        checked={section.visibility.mobile}
        onCheckedChange={(visible) => {
          store.getState().setVisibility(section.id, 'mobile', visible);
        }}
      />
      {variant?.hasMedia ? (
        <Field label="Thứ tự trên điện thoại">
          <Select
            value={section.mobileOrder}
            onChange={(event) => {
              const order = mobileOrderSchema.safeParse(event.target.value);
              if (order.success) {
                store.getState().setMobileOrder(section.id, order.data);
              }
            }}
          >
            {mobileOrderSchema.options.map((order) => (
              <option key={order} value={order}>
                {mobileOrderLabels[order]}
              </option>
            ))}
          </Select>
        </Field>
      ) : null}
      <p className={styles.help}>
        Nội dung luôn giống nhau trên mọi thiết bị; chỉ thứ tự và ẩn/hiện được tùy chỉnh.
      </p>
    </div>
  );
}

/** The right column: fields of the selected section, generated from its definition. */
export function PropertiesPanel() {
  const store = useEditorStoreApi();
  const { siteId, pageId } = useEditorServices();
  const sections = useEditor((state) => state.draft.composition.sections);
  const selectedId = useEditor((state) => state.selection.sectionId);
  const index = sections.findIndex((section) => section.id === selectedId);
  const section = sections[index];

  if (!section) {
    return (
      <aside id={PROPERTIES_PANEL_ID} aria-labelledby="panel-title" className={styles.panel}>
        <div className={styles.header}>
          <h2 id="panel-title" className={styles.title}>
            Thuộc tính
          </h2>
        </div>
        <div className={styles.empty}>
          <p className={styles.emptyText}>
            Chọn một section trên trang hoặc trong cấu trúc trang để sửa nội dung, bố cục và cách
            hiển thị.
          </p>
          <GuardedLink href={`/sites/${siteId}/pages/${pageId}/seo`} className={styles.shortcut}>
            <SettingsIcon size={18} />
            Cài đặt trang &amp; SEO
          </GuardedLink>
        </div>
      </aside>
    );
  }

  const definition = getSectionDefinition(section.type);
  return (
    <aside id={PROPERTIES_PANEL_ID} aria-labelledby="panel-title" className={styles.panel}>
      <div className={styles.header}>
        <div className={styles.heading}>
          <h2 id="panel-title" className={styles.title} tabIndex={-1}>
            {definition.label}
          </h2>
          <span className={styles.position}>
            Section {index + 1} / {sections.length}
          </span>
        </div>
        <IconButton
          size="sm"
          aria-label="Đóng bảng thuộc tính"
          icon={<CloseIcon size={18} />}
          onClick={() => {
            store.getState().select(null);
            focusOutlineRow(section.id);
          }}
        />
      </div>
      <div className={styles.body} key={section.id}>
        <ContentGroup section={section} />
        <div className={styles.divider} />
        <LayoutGroup section={section} />
        <div className={styles.divider} />
        <VisibilityGroup section={section} />
      </div>
    </aside>
  );
}
