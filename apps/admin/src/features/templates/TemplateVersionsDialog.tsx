'use client';

import { endpoints, type WorkspaceTemplate } from '@plp/contracts';
import { Badge, Button, ButtonLink, Callout, Dialog, VisuallyHidden } from '@plp/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { api, ApiError } from '../../lib/api';
import { formatDate } from '../../lib/format';
import { templateHref } from '../shell/navigation';
import { problemMessage, reportUnexpected } from '../shell/problem-message';
import { templateQueryKeys, versionsQuery } from './queries';
import { versionOrigin, versionUsedLabel } from './workspace-templates';
import styles from './TemplateVersionsDialog.module.css';

export interface TemplateVersionsDialogProps {
  workspaceId: string;
  template: WorkspaceTemplate;
  /** "Dùng lại vN" needs `templates.manage` (ADR-030). */
  canManage: boolean;
  /** The site the previews are drawn for, as chosen in the library. */
  siteId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** A version was reused: the list shows the new current version. */
  onChanged: () => void;
}

function VersionList({
  workspaceId,
  template,
  canManage,
  siteId,
  onChanged,
}: Omit<TemplateVersionsDialogProps, 'open' | 'onOpenChange'>) {
  const queryClient = useQueryClient();
  const versions = useQuery(versionsQuery(workspaceId, template.id));
  const reuse = useMutation({
    mutationFn: (version: number) =>
      api(endpoints.reuseTemplateVersion, [workspaceId, template.id, String(version)], {
        body: { baseVersion: template.currentVersion },
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: templateQueryKeys.all(workspaceId) });
      onChanged();
    },
    onError: (error) => {
      if (error instanceof ApiError && error.code === 'template_changed') {
        // Saved elsewhere meanwhile: the history and the list are read again.
        void versions.refetch();
        onChanged();
        return;
      }
      if (!(error instanceof ApiError)) {
        reportUnexpected('Reusing a template version failed', error);
      }
    },
  });

  if (versions.isPending) {
    return (
      <p className={styles.quiet} role="status">
        Đang tải lịch sử phiên bản…
      </p>
    );
  }
  if (versions.isError) {
    return (
      <Callout tone="danger" role="alert">
        Chưa tải được lịch sử phiên bản. {problemMessage(versions.error)}
      </Callout>
    );
  }
  const next = template.currentVersion + 1;
  return (
    <>
      <ol className={styles.list}>
        {versions.data.items.map((version) => {
          const current = version.version === template.currentVersion;
          return (
            <li key={version.version} className={styles.item} data-current={current}>
              <span className={styles.head}>
                <span className={styles.version}>v{version.version}</span>
                {current ? (
                  <Badge size="sm" tone="info">
                    ĐANG DÙNG
                  </Badge>
                ) : null}
              </span>
              <span className={styles.line}>
                {versionOrigin(version)} · {version.createdBy.name} ·{' '}
                {formatDate(version.createdAt)}
              </span>
              <span className={styles.used}>{versionUsedLabel(version.usedCount)}</span>
              {current ? null : (
                <span className={styles.actions}>
                  <ButtonLink
                    as={Link}
                    href={templateHref(
                      workspaceId,
                      template.id,
                      siteId ?? undefined,
                      version.version,
                    )}
                    variant="secondary"
                    size="sm"
                  >
                    Xem trước <VisuallyHidden>v{version.version}</VisuallyHidden>
                  </ButtonLink>
                  {canManage ? (
                    <Button
                      variant="secondary"
                      size="sm"
                      loading={reuse.isPending && reuse.variables === version.version}
                      disabled={reuse.isPending}
                      onClick={() => {
                        reuse.mutate(version.version);
                      }}
                    >
                      Dùng lại v{version.version}
                    </Button>
                  ) : null}
                </span>
              )}
            </li>
          );
        })}
      </ol>
      {reuse.isError ? (
        <Callout tone="warning" role="alert">
          {problemMessage(reuse.error)}
        </Callout>
      ) : null}
      <p className={styles.quiet}>
        Phiên bản không bị sửa sau khi lưu. “Dùng lại” tạo v{next} có nội dung của phiên bản đó;
        trang đã tạo từ mẫu không bị ảnh hưởng.
      </p>
    </>
  );
}

/** "Lịch sử phiên bản" of a workspace template (board 19, ADR-030): immutable versions. */
export function TemplateVersionsDialog({
  open,
  onOpenChange,
  ...list
}: TemplateVersionsDialogProps) {
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={list.template.name}
      description="Lịch sử phiên bản"
    >
      <VersionList {...list} />
    </Dialog>
  );
}
