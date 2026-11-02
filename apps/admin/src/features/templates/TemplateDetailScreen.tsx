'use client';

import {
  type Access,
  can,
  DEFAULT_THEME_PRESET,
  holdersOf,
  type Membership,
  type Site,
  type TemplateDetail,
  templateIndustryLabels,
  templateSourceLabels,
  templateUsableIn,
} from '@plp/contracts';
import { themePresets } from '@plp/sections/schema';
import {
  ArrowLeftIcon,
  Badge,
  Button,
  Callout,
  Card,
  CheckIcon,
  DesktopIcon,
  ImageIcon,
  InfoCircleIcon,
  MobileIcon,
  SegmentedControl,
  WarningTriangleIcon,
} from '@plp/ui';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { type ReactNode, useState } from 'react';
import { formatDate } from '../../lib/format';
import { templateHref, templatesHref, workspaceTemplatesHref } from '../shell/navigation';
import { PageContainer } from '../shell/PageHeader';
import { ApplyTemplateDialog } from './ApplyTemplateDialog';
import { CreateFromTemplateDialog } from './CreateFromTemplateDialog';
import { goalLabel } from './library-filters';
import { type ReadinessItem, readinessItems } from './readiness';
import { type PreviewDevice, previewDeviceLabels, TemplatePreview } from './TemplatePreview';
import styles from './TemplateDetailScreen.module.css';

const readinessIcons: Record<ReadinessItem['tone'], ReactNode> = {
  ready: <CheckIcon size={18} strokeWidth={2.4} />,
  missing: <WarningTriangleIcon size={18} strokeWidth={2} />,
  info: <InfoCircleIcon size={18} />,
};

export interface TemplateDetailScreenProps {
  workspace: Membership['workspace'];
  role: Access;
  /** Whether the member is kept to some sites: "Đã dùng" counts in those (ADR-020). */
  siteLimited: boolean;
  template: TemplateDetail;
  /** The sites the user may open. */
  sites: readonly Site[];
  /** The site chosen in the library ("Tạo trang cho"), whose needs `template.site` holds. */
  siteId: string | null;
}

/**
 * One template (board 18, ADR-030): its page on a computer or a phone in the chosen site's theme,
 * its sections, what that site still needs before a page from it goes live, and "Tạo trang từ
 * mẫu" and "Áp dụng vào trang đang sửa…". An earlier version of a workspace template, or an
 * archived one, is shown without them.
 */
export function TemplateDetailScreen({
  workspace,
  role,
  siteLimited,
  template,
  sites,
  siteId,
}: TemplateDetailScreenProps) {
  const router = useRouter();
  const [device, setDevice] = useState<PreviewDevice>('desktop');
  const [createOpen, setCreateOpen] = useState(false);
  const [applyOpen, setApplyOpen] = useState(false);
  const site = sites.find((item) => item.id === siteId) ?? null;
  // A workspace template limited to some sites is used only there (ADR-030).
  const targets = can(role, 'pages.edit')
    ? sites.filter((item) => templateUsableIn(template.siteIds, item.id))
    : [];
  // An earlier version is shown, never made into a page; an archived template neither.
  const earlier = template.version !== template.currentVersion;
  const usable = !earlier && !template.archived;
  const theme = themePresets[site?.themePresetId ?? DEFAULT_THEME_PRESET];
  const items = readinessItems({
    hasForm: template.hasForm,
    composition: template.composition,
    siteName: site?.name ?? null,
    site: site === null ? null : template.site,
  });
  const libraryHref = templatesHref(
    workspace.id,
    site === null ? '' : `?site=${encodeURIComponent(site.id)}`,
  );
  const initialSiteId = site !== null && targets.includes(site) ? site.id : targets[0]?.id;

  return (
    <PageContainer>
      <Link href={libraryHref} className={styles.back}>
        <ArrowLeftIcon size={16} />
        Templates
      </Link>

      <header className={styles.header}>
        <div className={styles.heading}>
          <div className={styles.badges}>
            <Badge size="sm" tone={template.source === 'workspace' ? 'info' : 'neutral'}>
              {templateSourceLabels[template.source].toUpperCase()}
            </Badge>
            {template.goal === null ? null : <Badge size="sm">{goalLabel(template.goal)}</Badge>}
            {template.industry === null ? null : (
              <Badge size="sm">{templateIndustryLabels[template.industry]}</Badge>
            )}
          </div>
          <h1 className={styles.title}>{template.name}</h1>
          <p className={styles.details}>{template.details}</p>
        </div>
        <SegmentedControl<PreviewDevice>
          aria-label="Xem theo thiết bị"
          value={device}
          onChange={setDevice}
          options={[
            {
              value: 'desktop',
              label: previewDeviceLabels.desktop,
              icon: <DesktopIcon size={16} />,
            },
            { value: 'mobile', label: previewDeviceLabels.mobile, icon: <MobileIcon size={16} /> },
          ]}
        />
      </header>

      <div className={styles.layout}>
        <div className={styles.preview}>
          <TemplatePreview
            name={template.name}
            composition={template.composition}
            themePresetId={theme.id}
            images={template.images}
            siteName={site?.name ?? 'Tên site'}
            device={device}
          />
        </div>

        <div className={styles.aside}>
          <Card className={styles.panel}>
            {earlier ? (
              <Callout tone="info">
                Bạn đang xem v{template.version}. Trang mới được tạo từ phiên bản đang dùng, v
                {template.currentVersion}.{' '}
                <Link
                  href={templateHref(workspace.id, template.id, site?.id)}
                  className={styles.inlineLink}
                >
                  Xem v{template.currentVersion}
                </Link>
              </Callout>
            ) : template.archived ? (
              <Callout tone="info">
                Mẫu này đã được lưu trữ. Khôi phục ở{' '}
                <Link
                  href={workspaceTemplatesHref(workspace.id, true)}
                  className={styles.inlineLink}
                >
                  Template của workspace
                </Link>{' '}
                để dùng lại.
              </Callout>
            ) : initialSiteId === undefined ? (
              <p className={styles.note}>
                {!can(role, 'pages.edit')
                  ? `Chỉ ${holdersOf('pages.edit')} tạo được trang từ mẫu.`
                  : template.siteIds === null
                    ? 'Chưa có site nào để tạo trang từ mẫu.'
                    : 'Mẫu này chỉ dùng cho các site đã chọn khi lưu, không có site nào của bạn.'}
              </p>
            ) : (
              <>
                <Button
                  fullWidth
                  onClick={() => {
                    setCreateOpen(true);
                  }}
                >
                  Tạo trang từ mẫu
                </Button>
                <Button
                  variant="secondary"
                  fullWidth
                  onClick={() => {
                    setApplyOpen(true);
                  }}
                >
                  Áp dụng vào trang đang sửa…
                </Button>
              </>
            )}
            <p className={styles.note}>
              Chữ mẫu được đánh dấu. Checklist xuất bản sẽ nhắc bạn thay trước khi live.
            </p>
          </Card>

          <Card as="section" className={styles.panel} aria-labelledby="template-sections">
            <h2 id="template-sections" className={styles.panelTitle}>
              Gồm {template.sections.length} section
            </h2>
            <ol className={styles.outline}>
              {template.sections.map((section, index) => (
                <li key={index}>{section.label}</li>
              ))}
            </ol>
          </Card>

          <Card as="section" className={styles.panel} aria-labelledby="template-needs">
            <h2 id="template-needs" className={styles.panelTitle}>
              Cần có trước khi xuất bản
            </h2>
            {items.length === 0 ? (
              <p className={styles.note}>Mẫu này không cần thiết lập thêm cho site.</p>
            ) : (
              <ul className={styles.needs}>
                {items.map((item) => (
                  <li key={item.key} className={styles.need} data-tone={item.tone}>
                    <span className={styles.needIcon} aria-hidden="true">
                      {item.key === 'images' ? <ImageIcon size={18} /> : readinessIcons[item.tone]}
                    </span>
                    <span>
                      <strong>{item.title}</strong> · {item.text}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card className={styles.panel}>
            <dl className={styles.facts}>
              <dt>Phiên bản</dt>
              <dd>
                v{template.version} · cập nhật {formatDate(template.updatedAt)}
              </dd>
              <dt>Theme</dt>
              <dd>{theme.label} · 4 color scheme đạt AA</dd>
              <dt>Đã dùng</dt>
              <dd>
                {template.usedCount} trang{' '}
                {siteLimited ? 'trong các site của bạn' : 'trong workspace'}
              </dd>
            </dl>
          </Card>
        </div>
      </div>

      {initialSiteId === undefined || !usable ? null : (
        <>
          <CreateFromTemplateDialog
            workspaceId={workspace.id}
            template={template}
            sites={targets}
            initialSiteId={initialSiteId}
            initialReadiness={initialSiteId === site?.id ? template.site : undefined}
            role={role}
            open={createOpen}
            onOpenChange={setCreateOpen}
            onTemplateChanged={() => {
              router.refresh();
            }}
          />
          <ApplyTemplateDialog
            template={template}
            sites={targets}
            initialSiteId={initialSiteId}
            open={applyOpen}
            onOpenChange={setApplyOpen}
            onTemplateChanged={() => {
              router.refresh();
            }}
          />
        </>
      )}
    </PageContainer>
  );
}
