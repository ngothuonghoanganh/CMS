'use client';

import {
  type Cta,
  ctaSchema,
  type Link,
  type LinkKind,
  linkKindLabels,
  linkSchema,
  phoneSchema,
} from '@plp/contracts';
import {
  type CtaField,
  getAtPath,
  getSectionDefinition,
  isCtaUsed,
  isLinkComplete,
} from '@plp/sections/schema';
import { Field, Input, Select } from '@plp/ui';
import { useEditor, useEditorServices, useEditorStoreApi } from '../editor-context';
import { CommittedInput } from './CommittedInput';
import { type ControlProps, sampleNote } from './field-shared';
import styles from './fields.module.css';

const linkKinds: readonly LinkKind[] = ['none', 'section', 'page', 'url', 'phone', 'zalo'];

const EMPTY_CTA: Cta = { label: '', link: { kind: 'none' } };

function firstIssue(result: { success: boolean; error?: { issues: { message: string }[] } }) {
  return result.success ? null : (result.error?.issues[0]?.message ?? 'Giá trị không hợp lệ');
}

function validateUrl(url: string): string | null {
  return firstIssue(linkSchema.safeParse({ kind: 'url', url }));
}

function validatePhone(phone: string): string | null {
  return firstIssue(phoneSchema.safeParse(phone));
}

/** "Nút chính": the label ("Chữ trên nút") and where it leads ("Khi bấm, đưa tới"). */
export function CtaControl({ section, field, path }: ControlProps<CtaField>) {
  const store = useEditorStoreApi();
  const { sitePages, pageId } = useEditorServices();
  const sections = useEditor((state) => state.draft.composition.sections);
  const parsed = ctaSchema.safeParse(getAtPath(section.content, path));
  const cta = parsed.success ? parsed.data : EMPTY_CTA;
  const link = cta.link;
  const otherPages = sitePages.filter((page) => page.id !== pageId);
  const targets = sections.filter((candidate) => candidate.id !== section.id);
  const labelPath = `${path}.label`;
  const linkPath = `${path}.link`;

  function setLink(next: Link) {
    store.getState().updateContent(section.id, linkPath, next);
  }

  function linkOfKind(kind: LinkKind): Link | null {
    switch (kind) {
      case 'none':
        return { kind: 'none' };
      case 'section':
        return { kind: 'section', sectionId: link.kind === 'section' ? link.sectionId : '' };
      case 'page': {
        const first = otherPages[0];
        if (link.kind === 'page') {
          return link;
        }
        return first ? { kind: 'page', pageId: first.id } : null;
      }
      case 'url':
        return { kind: 'url', url: link.kind === 'url' ? link.url : '' };
      case 'phone':
      case 'zalo':
        return {
          kind,
          phone: link.kind === 'phone' || link.kind === 'zalo' ? link.phone : '',
        };
    }
  }

  const used = isCtaUsed(cta);
  const labelMissing = field.required === true && !used;
  const linkMissing = (field.required === true || used) && !isLinkComplete(link);
  const brokenSection =
    link.kind === 'section' &&
    link.sectionId !== '' &&
    !targets.some((target) => target.id === link.sectionId);

  return (
    <fieldset data-field-path={path} className={styles.group}>
      <legend className={styles.groupLegend}>{field.label}</legend>
      <div data-field-path={labelPath}>
        <Field
          label="Chữ trên nút"
          labelNote={sampleNote(section, labelPath)}
          required={field.required}
          warning={labelMissing ? 'Cần nhập trước khi xuất bản.' : undefined}
          counter={{ length: cta.label.length, max: field.labelMaxLength }}
        >
          <Input
            value={cta.label}
            maxLength={field.labelMaxLength}
            onChange={(event) => {
              store
                .getState()
                .updateContent(section.id, labelPath, event.target.value, { merge: true });
            }}
            onBlur={() => {
              store.getState().closeHistoryStep();
            }}
          />
        </Field>
      </div>
      <div data-field-path={linkPath} className={styles.stack}>
        <Field
          label="Khi bấm, đưa tới"
          warning={
            brokenSection
              ? 'Section đích đã bị xóa. Chọn section khác.'
              : linkMissing && link.kind === 'none'
                ? 'Chọn nơi nút đưa tới trước khi xuất bản.'
                : undefined
          }
        >
          <Select
            value={link.kind}
            onChange={(event) => {
              const kind = linkKinds.find((candidate) => candidate === event.target.value);
              const next = kind ? linkOfKind(kind) : null;
              if (next) {
                setLink(next);
              }
            }}
          >
            {linkKinds.map((kind) => (
              <option key={kind} value={kind} disabled={kind === 'page' && otherPages.length === 0}>
                {kind === 'page' && otherPages.length === 0
                  ? `${linkKindLabels.page} (site chưa có trang khác)`
                  : linkKindLabels[kind]}
              </option>
            ))}
          </Select>
        </Field>
        {link.kind === 'section' ? (
          <Field
            label="Section đích"
            warning={link.sectionId === '' ? 'Chọn section mà nút sẽ cuộn tới.' : undefined}
          >
            <Select
              value={brokenSection ? '' : link.sectionId}
              onChange={(event) => {
                setLink({ kind: 'section', sectionId: event.target.value });
              }}
            >
              <option value="">Chọn section</option>
              {targets.map((target, index) => {
                const definition = getSectionDefinition(target.type);
                return (
                  <option key={target.id} value={target.id}>
                    {`${index + 1}. ${definition.label} · ${definition.summarize(target.content)}`}
                  </option>
                );
              })}
            </Select>
          </Field>
        ) : null}
        {link.kind === 'page' ? (
          <Field label="Trang đích">
            <Select
              value={link.pageId}
              onChange={(event) => {
                const page = otherPages.find((candidate) => candidate.id === event.target.value);
                if (page) {
                  setLink({ kind: 'page', pageId: page.id });
                }
              }}
            >
              {otherPages.some((page) => page.id === link.pageId) ? null : (
                <option value={link.pageId}>Trang không còn trong site</option>
              )}
              {otherPages.map((page) => (
                <option key={page.id} value={page.id}>
                  {page.liveRelease ? page.title : `${page.title} (chưa live)`}
                </option>
              ))}
            </Select>
          </Field>
        ) : null}
        {link.kind === 'url' ? (
          <CommittedInput
            label="Đường dẫn"
            type="url"
            inputMode="url"
            mono
            placeholder="https://"
            value={link.url}
            validate={validateUrl}
            onCommit={(url) => {
              setLink({ kind: 'url', url });
            }}
          />
        ) : null}
        {link.kind === 'phone' || link.kind === 'zalo' ? (
          <CommittedInput
            label={link.kind === 'phone' ? 'Số điện thoại' : 'Số Zalo'}
            type="tel"
            inputMode="tel"
            placeholder="0901 234 567"
            value={link.phone}
            validate={validatePhone}
            onCommit={(phone) => {
              setLink({ kind: link.kind, phone });
            }}
          />
        ) : null}
      </div>
    </fieldset>
  );
}
