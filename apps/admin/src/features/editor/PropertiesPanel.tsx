'use client';

import {
  colorSchemeIds,
  mobileOrderLabels,
  mobileOrderSchema,
  type SectionInstance,
  spacingLabels,
  spacingPresets,
} from '@plp/contracts';
import {
  type AnySectionDefinition,
  getSectionDefinition,
  getVariant,
  listLabelsOf,
  listMaximum,
  type SectionVariant,
  themePresets,
} from '@plp/sections/schema';
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
import { type KeyboardEvent, useId, useState } from 'react';
import { PageMotionPanel } from '../motion/PageMotionPanel';
import { SectionMotionGroup } from '../motion/SectionMotionGroup';
import { isFieldHidden, listItemsOf } from './content-fields';
import { useEditor, useEditorServices, useEditorStoreApi } from './editor-context';
import { FieldControl } from './fields/FieldControl';
import { focusOutlineRow, PROPERTIES_PANEL_ID } from './focus-target';
import { GuardedLink } from './GuardedLink';
import { lowerFirst } from './presentation';
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

/**
 * Why a variant cannot be chosen yet: it holds fewer list items than the section has (a process
 * has at most 5 steps). Items are never dropped by a variant switch; the user removes them.
 */
function variantBlocker(
  section: SectionInstance,
  definition: AnySectionDefinition,
  variant: SectionVariant,
): string | null {
  for (const field of definition.fields) {
    if (field.kind !== 'list') {
      continue;
    }
    const maximum = listMaximum(section.type, variant.id, field.key);
    if (listItemsOf(section.content, field.key).length > maximum) {
      // Each layout names the items its own way: a process holds at most 5 steps, and the grid
      // shown now has benefits to remove.
      const limited = lowerFirst(listLabelsOf(section.type, variant.id, field).itemLabel);
      const current = lowerFirst(listLabelsOf(section.type, section.variant, field).itemLabel);
      return `“${variant.label}” có tối đa ${maximum} ${limited}. Xóa bớt ${current} để chọn bố cục này.`;
    }
  }
  return null;
}

function LayoutGroup({ section }: { section: SectionInstance }) {
  const store = useEditorStoreApi();
  const blockerId = useId();
  const themePresetId = useEditor((state) => state.site.themePresetId);
  const definition = getSectionDefinition(section.type);
  const schemes = themePresets[themePresetId].schemes;
  const blockers = definition.variants.map((variant) =>
    variant.id === section.variant ? null : variantBlocker(section, definition, variant),
  );
  return (
    <div className={styles.group}>
      <h3 className={styles.groupTitle}>BỐ CỤC</h3>
      {definition.variants.length > 1 ? (
        <>
          <div role="group" aria-label="Kiểu bố cục" className={styles.variants}>
            {definition.variants.map((variant, index) => {
              const blocker = blockers[index] ?? null;
              const blocked = blocker !== null;
              return (
                <button
                  key={variant.id}
                  type="button"
                  aria-pressed={variant.id === section.variant}
                  aria-disabled={blocked ? true : undefined}
                  aria-describedby={blocked ? `${blockerId}-${variant.id}` : undefined}
                  className={styles.variant}
                  // Pointing at a blocked layout says why it cannot be chosen, not what it is.
                  title={blocker ?? variant.description}
                  onClick={() => {
                    if (!blocked) {
                      store.getState().setVariant(section.id, variant.id);
                    }
                  }}
                >
                  <SectionThumbnail type={section.type} variant={variant.id} size="sm" />
                  {variant.label}
                </button>
              );
            })}
          </div>
          {definition.variants.map((variant, index) => {
            const blocker = blockers[index];
            return blocker === null || blocker === undefined ? null : (
              <p key={variant.id} id={`${blockerId}-${variant.id}`} className={styles.help}>
                {blocker}
              </p>
            );
          })}
        </>
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

type PageTab = 'motion' | 'seo';

const pageTabs: readonly { id: PageTab; label: string }[] = [
  { id: 'motion', label: 'Chuyển động' },
  { id: 'seo', label: 'SEO & chia sẻ' },
];

/**
 * With no section selected: "Cài đặt trang", what applies to the whole page (board 37). Motion is
 * edited here; SEO and sharing keep their own screen. Arrow keys move between the tabs.
 */
function PageSettings() {
  const { siteId, pageId } = useEditorServices();
  const [tab, setTab] = useState<PageTab>('motion');
  const baseId = useId();
  const tabId = (id: PageTab) => `${baseId}-tab-${id}`;
  const panelId = (id: PageTab) => `${baseId}-panel-${id}`;

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') {
      return;
    }
    event.preventDefault();
    const next = tab === 'motion' ? 'seo' : 'motion';
    setTab(next);
    document.getElementById(tabId(next))?.focus();
  }

  return (
    <aside id={PROPERTIES_PANEL_ID} aria-labelledby="panel-title" className={styles.panel}>
      <div className={styles.header}>
        <div className={styles.heading}>
          <h2 id="panel-title" className={styles.title} tabIndex={-1}>
            Cài đặt trang
          </h2>
          <span className={styles.position}>Áp dụng cho cả trang</span>
        </div>
      </div>
      <div role="tablist" aria-label="Cài đặt trang" className={styles.tabs} onKeyDown={onKeyDown}>
        {pageTabs.map((item) => (
          <button
            key={item.id}
            id={tabId(item.id)}
            type="button"
            role="tab"
            aria-selected={tab === item.id}
            aria-controls={panelId(item.id)}
            tabIndex={tab === item.id ? 0 : -1}
            className={styles.tab}
            onClick={() => {
              setTab(item.id);
            }}
          >
            {item.label}
          </button>
        ))}
      </div>
      <div
        id={panelId('motion')}
        role="tabpanel"
        aria-labelledby={tabId('motion')}
        hidden={tab !== 'motion'}
        className={styles.body}
      >
        <PageMotionPanel />
      </div>
      <div
        id={panelId('seo')}
        role="tabpanel"
        aria-labelledby={tabId('seo')}
        hidden={tab !== 'seo'}
        className={styles.body}
      >
        <p className={styles.emptyText}>
          Tiêu đề, mô tả, ảnh khi chia sẻ và đường dẫn của trang nằm ở màn SEO &amp; chia sẻ.
        </p>
        <GuardedLink href={`/sites/${siteId}/pages/${pageId}/seo`} className={styles.shortcut}>
          <SettingsIcon size={18} />
          Cài đặt trang &amp; SEO
        </GuardedLink>
      </div>
      <p className={styles.footnote}>
        Chọn một section trên trang hoặc trong cấu trúc trang để sửa nội dung, bố cục và cách hiển
        thị.
      </p>
    </aside>
  );
}

/** The right column: fields of the selected section, generated from its definition. */
export function PropertiesPanel() {
  const store = useEditorStoreApi();
  const sections = useEditor((state) => state.draft.composition.sections);
  const selectedId = useEditor((state) => state.selection.sectionId);
  const index = sections.findIndex((section) => section.id === selectedId);
  const section = sections[index];

  if (!section) {
    return <PageSettings />;
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
        <SectionMotionGroup section={section} index={index} />
        <div className={styles.divider} />
        <VisibilityGroup section={section} />
      </div>
    </aside>
  );
}
