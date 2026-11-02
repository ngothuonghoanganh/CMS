'use client';

import {
  type Access,
  can,
  DEFAULT_THEME_PRESET,
  endpoints,
  holdersOf,
  type Membership,
  type Site,
  type WorkspaceTemplate,
} from '@plp/contracts';
import {
  ArrowLeftIcon,
  Button,
  Callout,
  DropdownMenu,
  DropdownMenuItem,
  DuplicateIcon,
  EmptyState,
  GridIcon,
  HistoryIcon,
  IconButton,
  InboxIcon,
  MoreHorizontalIcon,
  PlusIcon,
  SettingsIcon,
  TabsNav,
  useToast,
  VisuallyHidden,
} from '@plp/ui';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { api } from '../../lib/api';
import { formatDayMonth } from '../../lib/format';
import { templateHref, templatesHref, workspaceTemplatesHref } from '../shell/navigation';
import { PageContainer, PageHeader } from '../shell/PageHeader';
import { problemMessage, reportUnexpected } from '../shell/problem-message';
import { ScrollRegion } from '../shell/ScrollRegion';
import { EditTemplateDialog } from './EditTemplateDialog';
import { templateTags } from './library-filters';
import { templateQueryKeys } from './queries';
import { SaveTemplateDialog } from './SaveTemplateDialog';
import { TemplateThumb } from './TemplateThumb';
import { TemplateVersionsDialog } from './TemplateVersionsDialog';
import { scopeLabel, templatesOfTab, usedLabel } from './workspace-templates';
import styles from './WorkspaceTemplatesScreen.module.css';

export interface WorkspaceTemplatesScreenProps {
  workspace: Membership['workspace'];
  role: Access;
  /** Every workspace template the member sees, archived ones too. */
  templates: readonly WorkspaceTemplate[];
  /** The sites the member may open. */
  sites: readonly Site[];
  /** The site of `?site=` or the one opened last: the thumbnails take its theme. */
  initialSiteId: string | null;
  /** "Lưu trữ" rather than "Đang dùng". */
  archived: boolean;
}

/** The tabs "Đang dùng" and "Lưu trữ"; the current one is where focus goes when no row is left. */
const TABS_LABEL = 'Trạng thái';

type Dialog =
  | { kind: 'save' }
  | { kind: 'versions'; templateId: string }
  | { kind: 'edit'; templateId: string };

/**
 * "Template của workspace" (board 19, ADR-030): the workspace's own templates in use or archived,
 * with their versions, who may use them and the pages made from them. Every member sees those a
 * site of theirs may use; saving a page, editing, duplicating, archiving and reusing a version
 * need `templates.manage`. There is no delete: pages made from a template keep its id.
 */
export function WorkspaceTemplatesScreen({
  workspace,
  role,
  templates,
  sites,
  initialSiteId,
  archived,
}: WorkspaceTemplatesScreenProps) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const canManage = can(role, 'templates.manage');
  const [dialog, setDialog] = useState<{ value: Dialog; open: boolean } | null>(null);
  // A template archived or restored leaves this tab once the refresh renders the list again; its
  // "…" button had the focus, which then goes to the next row's, else the previous row's, else
  // the tab.
  const focusAfterChange = useRef<{ gone: string; next: readonly string[] } | null>(null);
  const site = sites.find((item) => item.id === initialSiteId) ?? sites[0] ?? null;
  const themePresetId = site?.themePresetId ?? DEFAULT_THEME_PRESET;
  const active = templatesOfTab(templates, false);
  const stored = templatesOfTab(templates, true);
  const shown = archived ? stored : active;
  // The table's name; also the scroll region's while it scrolls sideways.
  const tableLabel = archived ? 'Template đã lưu trữ' : 'Template đang dùng';
  const subjectId =
    dialog !== null && dialog.value.kind !== 'save' ? dialog.value.templateId : null;
  // Looked up on every render: after a change the list holds the template as it is now.
  const subject = templates.find((item) => item.id === subjectId) ?? null;

  useEffect(() => {
    const request = focusAfterChange.current;
    if (
      request === null ||
      templatesOfTab(templates, archived).some(({ id }) => id === request.gone)
    ) {
      return;
    }
    focusAfterChange.current = null;
    const active = document.activeElement;
    // Someone who moved on meanwhile keeps their focus.
    if (active !== null && active !== document.body && active.isConnected) {
      return;
    }
    const target =
      request.next
        .map((id) => document.querySelector<HTMLElement>(`[data-template-menu="${id}"]`))
        .find((button) => button !== null) ??
      document.querySelector<HTMLElement>(`nav[aria-label="${TABS_LABEL}"] [aria-current="page"]`);
    target?.focus();
  }, [templates, archived]);

  function open(value: Dialog) {
    setDialog({ value, open: true });
  }

  function closeWith(openNow: boolean) {
    setDialog((current) => (current === null ? null : { ...current, open: openNow }));
  }

  const change = useMutation({
    mutationFn: ({ template, action }: { template: WorkspaceTemplate; action: Action }) => {
      const args = [workspace.id, template.id] as const;
      switch (action) {
        case 'duplicate':
          return api(endpoints.duplicateWorkspaceTemplate, args);
        case 'archive':
          return api(endpoints.archiveWorkspaceTemplate, args);
        case 'restore':
          return api(endpoints.restoreWorkspaceTemplate, args);
      }
    },
    onSuccess: (result, { template, action }) => {
      toast({ tone: 'success', title: doneTitles[action](result.name) });
      if (action !== 'duplicate') {
        const index = shown.findIndex(({ id }) => id === template.id);
        focusAfterChange.current = {
          gone: template.id,
          next: [...shown.slice(index + 1), ...shown.slice(0, index).reverse()].map(({ id }) => id),
        };
      }
      // The save dialog's "Phiên bản mới của …" and the editor's "Áp dụng mẫu…" read these.
      void queryClient.invalidateQueries({ queryKey: templateQueryKeys.all(workspace.id) });
      router.refresh();
    },
    onError: (error, { action }) => {
      reportUnexpected(`Workspace template ${action} failed`, error);
      toast({ tone: 'danger', title: 'Chưa làm được', description: problemMessage(error) });
    },
  });

  const saveButton =
    canManage && sites.length > 0 ? (
      <Button
        leadingIcon={<PlusIcon size={16} />}
        onClick={() => {
          open({ kind: 'save' });
        }}
      >
        Lưu trang thành template
      </Button>
    ) : undefined;

  return (
    <PageContainer>
      <Link href={templatesHref(workspace.id)} className={styles.back}>
        <ArrowLeftIcon size={16} />
        Templates
      </Link>
      <PageHeader
        context={workspace.name}
        title="Template của workspace"
        description={`Mẫu nội bộ của ${workspace.name}, lưu từ những trang chạy tốt để dùng lại cho khách hàng khác.`}
        actions={saveButton}
      />

      {canManage ? null : (
        <Callout tone="info">
          Bạn xem và dùng được các template này. Chỉ {holdersOf('templates.manage')} lưu và quản lý
          template của workspace.
        </Callout>
      )}

      <TabsNav
        aria-label={TABS_LABEL}
        as={Link}
        items={[
          {
            href: workspaceTemplatesHref(workspace.id),
            label: `Đang dùng · ${active.length}`,
            current: !archived,
          },
          {
            href: workspaceTemplatesHref(workspace.id, true),
            label: `Lưu trữ · ${stored.length}`,
            current: archived,
          },
        ]}
      />

      {shown.length === 0 ? (
        archived ? (
          <EmptyState
            icon={<InboxIcon size={24} />}
            title="Chưa có template nào được lưu trữ"
            description="Template lưu trữ không còn trong thư viện; trang đã tạo từ chúng không đổi."
          />
        ) : (
          <EmptyState
            icon={<GridIcon size={24} />}
            title="Chưa có template nội bộ"
            description="Trang nào chạy tốt cho một khách hàng, hãy lưu thành template để lần sau dựng nhanh hơn. Mở trang trong editor, chọn “…” rồi “Lưu thành template”, hoặc bấm nút dưới đây."
            action={saveButton}
          />
        )
      ) : (
        <>
          <div className={styles.tableCard}>
            <ScrollRegion label={tableLabel}>
              <table className={styles.table} aria-label={tableLabel}>
                <thead>
                  <tr>
                    <th scope="col">TEMPLATE</th>
                    <th scope="col">PHIÊN BẢN</th>
                    <th scope="col">AI ĐƯỢC DÙNG</th>
                    <th scope="col">ĐÃ TẠO</th>
                    <th scope="col">CẬP NHẬT</th>
                    <th scope="col">
                      <VisuallyHidden>Thao tác</VisuallyHidden>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {shown.map((template) => {
                    const tags = templateTags(template);
                    return (
                      <tr key={template.id}>
                        <td>
                          <span className={styles.templateCell}>
                            <TemplateThumb
                              sections={template.sections}
                              themePresetId={themePresetId}
                              label={`Thu nhỏ: ${template.name}`}
                              className={styles.thumb}
                            />
                            <span className={styles.names}>
                              <Link
                                href={templateHref(workspace.id, template.id, site?.id)}
                                className={styles.name}
                              >
                                {template.name}
                              </Link>
                              {tags === '' ? null : <span className={styles.tags}>{tags}</span>}
                            </span>
                          </span>
                        </td>
                        <td className={styles.version}>v{template.currentVersion}</td>
                        <td>{scopeLabel(template.scope, sites)}</td>
                        <td>{usedLabel(template.usedCount)}</td>
                        <td>
                          {formatDayMonth(template.updatedAt)} · {template.updatedBy.name}
                        </td>
                        <td>
                          <span className={styles.actions}>
                            <Button
                              variant="secondary"
                              size="sm"
                              onClick={() => {
                                open({ kind: 'versions', templateId: template.id });
                              }}
                            >
                              Phiên bản <VisuallyHidden>của {template.name}</VisuallyHidden>
                            </Button>
                            {canManage ? (
                              <TemplateMenu
                                template={template}
                                pending={change.isPending}
                                onEdit={() => {
                                  open({ kind: 'edit', templateId: template.id });
                                }}
                                onAction={(action) => {
                                  change.mutate({ template, action });
                                }}
                              />
                            ) : null}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </ScrollRegion>
          </div>
          <p className={styles.note}>
            Lưu trữ ẩn mẫu khỏi thư viện; trang đã tạo từ mẫu không bị ảnh hưởng. Không có xóa:
            trang đã tạo vẫn ghi mẫu nguồn của nó.
          </p>
        </>
      )}

      {dialog?.value.kind === 'save' && site !== null ? (
        <SaveTemplateDialog
          workspaceId={workspace.id}
          sites={sites}
          source={{ kind: 'pick', initialSiteId: site.id }}
          open={dialog.open}
          onOpenChange={closeWith}
          onSaved={(template) => {
            toast({
              tone: 'success',
              title: `Đã lưu template “${template.name}”, phiên bản ${template.currentVersion}`,
            });
            router.refresh();
          }}
        />
      ) : null}
      {dialog?.value.kind === 'versions' && subject !== null ? (
        <TemplateVersionsDialog
          workspaceId={workspace.id}
          template={subject}
          canManage={canManage}
          siteId={site?.id ?? null}
          open={dialog.open}
          onOpenChange={closeWith}
          onChanged={() => {
            router.refresh();
          }}
        />
      ) : null}
      {dialog?.value.kind === 'edit' && subject !== null ? (
        <EditTemplateDialog
          workspaceId={workspace.id}
          template={subject}
          sites={sites}
          open={dialog.open}
          onOpenChange={closeWith}
          onSaved={(template) => {
            toast({ tone: 'success', title: `Đã lưu thông tin “${template.name}”` });
            router.refresh();
          }}
        />
      ) : null}
    </PageContainer>
  );
}

type Action = 'duplicate' | 'archive' | 'restore';

const doneTitles: Record<Action, (name: string) => string> = {
  duplicate: (name) => `Đã tạo “${name}”`,
  archive: (name) => `Đã lưu trữ “${name}”`,
  restore: (name) => `Đã khôi phục “${name}”`,
};

function TemplateMenu({
  template,
  pending,
  onEdit,
  onAction,
}: {
  template: WorkspaceTemplate;
  pending: boolean;
  onEdit: () => void;
  onAction: (action: Action) => void;
}) {
  // The button stays enabled while a change runs: the menu gives the focus back to it, and a
  // disabled button would drop it to <body>. The changes wait instead, one at a time.
  return (
    <DropdownMenu
      trigger={
        <IconButton
          aria-label={`Sửa thông tin, nhân bản hoặc lưu trữ ${template.name}`}
          icon={<MoreHorizontalIcon size={18} />}
          data-template-menu={template.id}
        />
      }
    >
      <DropdownMenuItem icon={<SettingsIcon size={18} />} onSelect={onEdit}>
        Sửa thông tin
      </DropdownMenuItem>
      <DropdownMenuItem
        icon={<DuplicateIcon size={18} />}
        disabled={pending}
        onSelect={() => {
          onAction('duplicate');
        }}
      >
        Nhân bản
      </DropdownMenuItem>
      <DropdownMenuItem
        icon={<HistoryIcon size={18} />}
        disabled={pending}
        onSelect={() => {
          onAction(template.archived ? 'restore' : 'archive');
        }}
      >
        {template.archived ? 'Khôi phục' : 'Lưu trữ'}
      </DropdownMenuItem>
    </DropdownMenu>
  );
}
