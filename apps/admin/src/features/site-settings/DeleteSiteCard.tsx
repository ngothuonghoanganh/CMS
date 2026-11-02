'use client';

import { endpoints, type Site, type SiteDeletionSummary, siteNameConfirms } from '@plp/contracts';
import { Button, ButtonLink, Callout, Card, Dialog, Field, Input, TrashIcon } from '@plp/ui';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { type SubmitEvent, useId, useState } from 'react';
import { api, ApiError } from '../../lib/api';
import { displayUrl } from '../../lib/site-url';
import { formatCount } from '../analytics/analytics-presentation';
import { siteQueryKeys } from '../dashboard/queries';
import { leadsHref, workspaceHref } from '../shell/navigation';
import { problemMessage, reportUnexpected } from '../shell/problem-message';
import styles from './DeleteSiteCard.module.css';

export interface DeleteSiteCardProps {
  site: Site;
  /** What deleting the site removes, read by the server with the page. */
  summary: SiteDeletionSummary;
}

/** "3 trang, 1 đang live" and the like: what the card lists. */
export function deletionLines(summary: SiteDeletionSummary): string[] {
  const pages =
    summary.pages === 0
      ? 'Chưa có trang nào'
      : `${formatCount(summary.pages)} trang, ${formatCount(summary.livePages)} đang live`;
  const leads = summary.leads === 0 ? 'Chưa có lead nào' : `${formatCount(summary.leads)} lead`;
  const domains =
    summary.domains.length === 0
      ? 'Không có tên miền riêng'
      : `Tên miền riêng: ${summary.domains.join(', ')}`;
  return [pages, leads, domains];
}

/**
 * "Xóa site" at the end of the site settings (ADR-027), for Chủ sở hữu and Quản trị: what goes,
 * a reminder to export the leads first, and the site's name typed again to confirm. Once deleted
 * the workspace opens, without the site.
 */
export function DeleteSiteCard({ site, summary }: DeleteSiteCardProps) {
  const headingId = useId();
  const [open, setOpen] = useState(false);
  // Each opening starts again: nothing typed, no answer from a previous attempt.
  const [opening, setOpening] = useState(0);
  return (
    <Card as="section" padding="lg" aria-labelledby={headingId} className={styles.card}>
      <div className={styles.heading}>
        <h2 id={headingId} className={styles.title}>
          Xóa site
        </h2>
        <p className={styles.description}>
          Xóa vĩnh viễn {site.name} cùng mọi trang, phiên bản, ảnh, lead, yêu cầu dữ liệu và số liệu
          Hiệu quả. Không thể hoàn tác.
        </p>
      </div>
      <ul className={styles.summary} aria-label="Sẽ bị xóa">
        {deletionLines(summary).map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
      {summary.leads === 0 ? null : (
        <Callout
          tone="warning"
          action={
            <ButtonLink as={Link} href={leadsHref(site.id, '?range=all')} variant="secondary">
              Mở hộp thư lead
            </ButtonLink>
          }
        >
          Lead bị xóa thật, không khôi phục được. Xuất lead ra file trước khi xóa site.
        </Callout>
      )}
      <div className={styles.actions}>
        <Button
          variant="danger"
          leadingIcon={<TrashIcon size={16} />}
          onClick={() => {
            setOpening((count) => count + 1);
            setOpen(true);
          }}
        >
          Xóa site
        </Button>
      </div>
      <DeleteSiteDialog
        key={opening}
        site={site}
        summary={summary}
        open={open}
        onOpenChange={setOpen}
      />
    </Card>
  );
}

function DeleteSiteDialog({
  site,
  summary,
  open,
  onOpenChange,
}: {
  site: Site;
  summary: SiteDeletionSummary;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [confirmName, setConfirmName] = useState('');
  const confirmed = siteNameConfirms(confirmName, site.name);

  // No toast: the workspace's screens have a frame of their own, which a toast from here would not
  // outlive. The site is simply gone from them.
  function leave() {
    // Nothing of the site is left to show: its cached data goes, and the workspace's site lists
    // (switcher, sidebar) are rendered again by the server.
    queryClient.removeQueries({ queryKey: siteQueryKeys.site(site.id) });
    router.push(workspaceHref(site.workspaceId));
    router.refresh();
  }

  const remove = useMutation({
    mutationFn: () => api(endpoints.deleteSite, [site.id], { body: { confirmName } }),
    onSuccess: leave,
    onError: (error) => {
      if (error instanceof ApiError && error.status === 404) {
        // Deleted by someone else just before: what the user asked for is done.
        leave();
        return;
      }
      reportUnexpected('Deleting the site failed', error);
    },
  });

  function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (confirmed && !remove.isPending) {
      remove.mutate();
    }
  }

  // A wrong name from the server shows on the field itself.
  const nameError =
    remove.error instanceof ApiError ? remove.error.fieldErrors().confirmName : undefined;
  const formError =
    remove.error === null || nameError !== undefined ? null : problemMessage(remove.error);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        // A running deletion cannot be dismissed half-way: its answer shows here.
        if (!next && remove.isPending) {
          return;
        }
        onOpenChange(next);
      }}
      title={`Xóa site ${site.name}?`}
      footer={
        <>
          <Button
            variant="secondary"
            disabled={remove.isPending}
            onClick={() => {
              onOpenChange(false);
            }}
          >
            Hủy
          </Button>
          <Button
            type="submit"
            form="delete-site"
            variant="danger"
            loading={remove.isPending}
            disabled={!confirmed}
          >
            Xóa site
          </Button>
        </>
      }
    >
      <form id="delete-site" className={styles.form} onSubmit={submit} noValidate>
        <ul className={styles.summary} aria-label="Sẽ bị xóa">
          {deletionLines(summary).map((line) => (
            <li key={line}>{line}</li>
          ))}
          <li>Địa chỉ {displayUrl(site.defaultOrigin)} được trả lại cho site khác dùng</li>
        </ul>
        <Field
          label="Nhập tên site để xác nhận"
          id="delete-site-confirm"
          error={nameError}
          help={`Gõ đúng: ${site.name}`}
        >
          <Input
            type="text"
            autoComplete="off"
            placeholder={site.name}
            value={confirmName}
            disabled={remove.isPending}
            onChange={(event) => {
              remove.reset();
              setConfirmName(event.target.value);
            }}
          />
        </Field>
        {formError === null ? null : (
          <Callout tone="danger" role="alert">
            {formError}
          </Callout>
        )}
      </form>
    </Dialog>
  );
}
