'use client';

import {
  endpoints,
  formatLeadPhone,
  LEAD_NOTE_MAX,
  LEAD_PERSON_EXPORT_MAX,
  type LeadDetail,
  leadDeviceLabels,
  leadStatuses,
  leadStatusLabels,
  leadStatusSchema,
  type PersonExportRequest,
  type UpdateLeadRequest,
} from '@plp/contracts';
import {
  AlertCircleIcon,
  Button,
  ButtonLink,
  Callout,
  CheckIcon,
  ConfirmDialog,
  DownloadIcon,
  DropdownMenu,
  DropdownMenuItem,
  Field,
  PhoneIcon,
  Select,
  ShieldCheckIcon,
  Spinner,
  Textarea,
  useToast,
  VisuallyHidden,
} from '@plp/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useId, useRef, useState } from 'react';
import { ApiError, api, downloadFile } from '../../lib/api';
import { formatDate, formatDateTime } from '../../lib/format';
import { siteQueryKeys } from '../dashboard/queries';
import { problemMessage, reportUnexpected } from '../shell/problem-message';
import { ConsentEvidenceDialog } from './ConsentEvidenceDialog';
import { EditLeadContactDialog } from './EditLeadContactDialog';
import {
  cappedCountLabel,
  consentMoment,
  leadDetailMeta,
  leadSourceLine,
  notificationView,
  spamReasonLabels,
  telUrl,
  zaloUrl,
} from './lead-presentation';
import { leadQueryKeys } from './queries';
import styles from './LeadInbox.module.css';

export interface LeadDetailPanelProps {
  siteId: string;
  leadId: string;
  /** The detail the server loaded for this lead, if any, and when. */
  initialDetail?: LeadDetail | undefined;
  loadedAt: number;
  /** The workspace owner corrects, exports and deletes a person's data (ADR-017). */
  canManage: boolean;
  /** Move focus to the lead's name once it shows: the user just picked it in the list. */
  focusOnShow: boolean;
  /** The lead was deleted or no longer exists; the inbox closes the panel. */
  onGone: () => void;
}

/** After "Gửi lại", when to read the lead again to show how the send went. */
const RESULT_CHECK_MS = 3000;

function isNotFound(error: unknown): boolean {
  return error instanceof ApiError && error.status === 404;
}

/**
 * The detail of one lead (board 10, ADR-018): how to reach them, where they came from, the
 * consent evidence, status and note. Editors triage; the owner also exports and deletes.
 */
export function LeadDetailPanel({
  siteId,
  leadId,
  initialDetail,
  loadedAt,
  canManage,
  focusOnShow,
  onGone,
}: LeadDetailPanelProps) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const headingId = useId();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const deliveryHeadingRef = useRef<HTMLHeadingElement>(null);
  // "Gửi lại" leaves once pressed: keyboard focus then moves to the section, not the page.
  const focusDelivery = useRef(false);
  const detailKey = leadQueryKeys.detail(siteId, leadId);
  const detail = useQuery({
    queryKey: detailKey,
    queryFn: ({ signal }) => api(endpoints.getLead, [leadId], { signal }),
    ...(initialDetail === undefined
      ? {}
      : { initialData: initialDetail, initialDataUpdatedAt: loadedAt }),
  });
  const lead = detail.data;
  const loaded = lead !== undefined;
  const [noteDraft, setNoteDraft] = useState<string | null>(null);
  const [evidenceOpen, setEvidenceOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  // A new key opens "Sửa thông tin" with the lead as it is now.
  const [editKey, setEditKey] = useState(0);
  const [editOpen, setEditOpen] = useState(false);

  useEffect(() => {
    if (focusOnShow && loaded) {
      headingRef.current?.focus();
    }
  }, [focusOnShow, loaded]);

  const deliveryStatus = detail.data?.notification?.status;
  useEffect(() => {
    if (focusDelivery.current && deliveryStatus !== 'failed') {
      focusDelivery.current = false;
      deliveryHeadingRef.current?.focus();
    }
  }, [deliveryStatus]);

  function refreshLists() {
    void queryClient.invalidateQueries({ queryKey: leadQueryKeys.lists(siteId) });
    void queryClient.invalidateQueries({ queryKey: leadQueryKeys.counts(siteId) });
    // "LEAD 7 NGÀY" of the dashboard leaves spam out.
    void queryClient.invalidateQueries({ queryKey: siteQueryKeys.pages(siteId) });
  }

  const update = useMutation({
    mutationFn: (body: UpdateLeadRequest) => api(endpoints.updateLead, [leadId], { body }),
    onSuccess: (updated, body) => {
      queryClient.setQueryData(detailKey, updated);
      refreshLists();
      if (body.note !== undefined) {
        setNoteDraft(null);
        toast({ tone: 'success', title: 'Đã lưu ghi chú' });
      }
      if (body.spam !== undefined) {
        toast({
          tone: 'success',
          title: body.spam ? 'Đã chuyển vào Nghi ngờ spam' : 'Đã chuyển về Hộp thư',
        });
      }
    },
    onError: (error) => {
      reportUnexpected('Lead update failed', error);
      if (isNotFound(error)) {
        refreshLists();
        onGone();
        return;
      }
      toast({
        tone: 'danger',
        title: 'Chưa lưu được thay đổi',
        description: problemMessage(error),
      });
    },
  });

  const exportFile = useMutation({
    mutationFn: (format: PersonExportRequest['format']) =>
      downloadFile(endpoints.exportLeadPerson, [leadId], { body: { format } }),
    onSuccess: (file) => {
      toast(
        file.truncated
          ? {
              tone: 'warning',
              title: 'Đã xuất một phần dữ liệu',
              description: `File gồm ${LEAD_PERSON_EXPORT_MAX} lead mới nhất của người này.`,
            }
          : { tone: 'success', title: 'Đã xuất dữ liệu người này' },
      );
    },
    onError: (error) => {
      reportUnexpected('Person export failed', error);
      toast({
        tone: 'danger',
        title: 'Chưa xuất được dữ liệu',
        description: problemMessage(error),
      });
    },
  });

  const retry = useMutation({
    mutationFn: () => api(endpoints.retryLeadNotification, [leadId]),
    onSuccess: (updated) => {
      focusDelivery.current = true;
      queryClient.setQueryData(detailKey, updated);
      refreshLists();
      toast({ tone: 'success', title: 'Đang gửi lại email thông báo' });
      // The email goes out in the background: look once more shortly after, no polling.
      setTimeout(() => {
        void queryClient.invalidateQueries({ queryKey: detailKey });
      }, RESULT_CHECK_MS);
    },
    onError: (error) => {
      reportUnexpected('Retrying a lead notification failed', error);
      focusDelivery.current = true;
      void queryClient.invalidateQueries({ queryKey: detailKey });
      toast({ tone: 'danger', title: 'Chưa gửi lại được', description: problemMessage(error) });
    },
  });

  const remove = useMutation({
    mutationFn: () => api(endpoints.deleteLeadPerson, [leadId]),
    onSuccess: ({ deletedCount }) => {
      setDeleteOpen(false);
      toast({ tone: 'success', title: `Đã xóa ${deletedCount} lead của người này` });
      queryClient.removeQueries({ queryKey: detailKey });
      refreshLists();
      onGone();
    },
    onError: (error) => {
      reportUnexpected('Person deletion failed', error);
    },
  });

  if (detail.isError) {
    return (
      <aside className={styles.detail} aria-label="Chi tiết lead">
        <div className={styles.detailState}>
          <Callout
            tone={isNotFound(detail.error) ? 'info' : 'danger'}
            role="alert"
            title={isNotFound(detail.error) ? 'Lead này không còn' : 'Chưa tải được lead'}
          >
            {isNotFound(detail.error)
              ? 'Lead đã bị xóa hoặc hết thời gian lưu.'
              : problemMessage(detail.error)}
          </Callout>
          <Button variant="secondary" onClick={onGone}>
            Đóng
          </Button>
        </div>
      </aside>
    );
  }

  if (lead === undefined) {
    return (
      <aside className={styles.detail} aria-label="Chi tiết lead" aria-busy="true">
        <div className={styles.detailState}>
          <Spinner label="Đang tải lead" />
        </div>
      </aside>
    );
  }

  const zalo = zaloUrl(lead.phone);
  const note = noteDraft ?? lead.note;
  const noteChanged = noteDraft !== null && noteDraft.trim() !== lead.note;
  const pendingStatus = update.isPending ? update.variables.status : undefined;
  const { consent } = lead;
  const delivery = notificationView(lead.notification, lead.spam.suspected);

  return (
    <aside className={styles.detail} aria-labelledby={headingId}>
      <div className={styles.detailHeader}>
        <div className={styles.detailTitle}>
          <h2 id={headingId} ref={headingRef} tabIndex={-1} className={styles.detailName}>
            {lead.name}
          </h2>
          <span className={styles.sub}>{leadDetailMeta(lead)}</span>
        </div>
        <Field label="Trạng thái lead" hideLabel className={styles.statusField}>
          <Select
            value={pendingStatus ?? lead.status}
            // Never disabled while saving: that would drop keyboard focus. A choice made before
            // the save answers is ignored; the select shows the status being saved.
            aria-busy={update.isPending}
            onChange={(event) => {
              const status = leadStatusSchema.safeParse(event.target.value);
              if (status.success && !update.isPending) {
                update.mutate({ status: status.data });
              }
            }}
          >
            {leadStatuses.map((status) => (
              <option key={status} value={status}>
                {leadStatusLabels[status]}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      <div className={styles.detailBody}>
        <div className={styles.phoneRow}>
          <span className={styles.phoneNumber}>{formatLeadPhone(lead.phone)}</span>
          <ButtonLink href={telUrl(lead.phone)} size="sm" leadingIcon={<PhoneIcon size={16} />}>
            Gọi
          </ButtonLink>
          {zalo === null ? null : (
            <ButtonLink
              href={zalo}
              target="_blank"
              rel="noopener noreferrer"
              variant="secondary"
              size="sm"
            >
              Nhắn Zalo
              <VisuallyHidden> (mở trong thẻ mới)</VisuallyHidden>
            </ButtonLink>
          )}
        </div>

        <dl className={styles.facts}>
          {lead.email === null ? null : (
            <>
              <dt>Email</dt>
              <dd>
                <a href={`mailto:${lead.email}`}>{lead.email}</a>
              </dd>
            </>
          )}
          {lead.message === null ? null : (
            <>
              <dt>Lời nhắn</dt>
              <dd className={styles.message}>{lead.message}</dd>
            </>
          )}
          <dt>Trang</dt>
          <dd>
            {lead.page.title} <span className={styles.muted}>· v{lead.releaseVersion}</span>
          </dd>
          <dt>Nguồn</dt>
          <dd className={styles.mono}>{leadSourceLine(lead.source)}</dd>
          <dt>Thiết bị</dt>
          <dd>{leadDeviceLabels[lead.device]}</dd>
          <dt>Lưu đến</dt>
          <dd>{lead.expiresAt === null ? 'Không tự xóa' : formatDate(lead.expiresAt)}</dd>
        </dl>

        {lead.spam.suspected ? (
          <Callout tone="warning" title="Nghi ngờ spam">
            {lead.spam.reasons.length === 0
              ? 'Một thành viên đã chuyển lead này vào Nghi ngờ spam.'
              : lead.spam.reasons.map((reason) => spamReasonLabels[reason]).join('. ')}
          </Callout>
        ) : null}

        <section className={styles.evidenceBox} aria-labelledby={`${headingId}-consent`}>
          <h3 id={`${headingId}-consent`} className={styles.evidenceTitle}>
            <ShieldCheckIcon size={16} />
            Bằng chứng đồng ý
          </h3>
          <ul className={styles.evidenceList}>
            <li>
              <CheckIcon size={16} strokeWidth={2.4} className={styles.evidenceYes} />
              Đồng ý để {consent.controllerName} xử lý dữ liệu
            </li>
            {consent.marketingText === null ? null : (
              <li>
                {consent.marketing ? (
                  <CheckIcon size={16} strokeWidth={2.4} className={styles.evidenceYes} />
                ) : (
                  <span className={styles.evidenceNo} aria-hidden="true">
                    —
                  </span>
                )}
                {consent.marketing ? 'Chọn nhận ưu đãi' : 'Không chọn nhận ưu đãi'}
                {consent.marketingWithdrawnAt === null
                  ? ''
                  : ` · đã rút ngày ${formatDate(consent.marketingWithdrawnAt)}`}
              </li>
            )}
          </ul>
          <p className={styles.evidenceMeta}>
            {`Nội dung đồng ý bản ${consent.version} · ${consentMoment(consent.at)} · `}
            <button
              type="button"
              className={styles.linkButton}
              onClick={() => {
                setEvidenceOpen(true);
              }}
            >
              Xem nội dung
            </button>
          </p>
        </section>

        {delivery === null ? null : (
          <section className={styles.delivery} aria-labelledby={`${headingId}-delivery`}>
            <h3
              id={`${headingId}-delivery`}
              ref={deliveryHeadingRef}
              tabIndex={-1}
              className={styles.deliveryTitle}
            >
              Đã gửi tới
            </h3>
            <div className={styles.deliveryRow} data-kind={delivery.kind}>
              {/* Polite: the outcome of "Gửi lại" arrives a few seconds after the press. */}
              <span className={styles.deliveryStatus} role="status">
                {delivery.kind === 'sent' ? (
                  <CheckIcon size={16} strokeWidth={2.4} className={styles.evidenceYes} />
                ) : delivery.kind === 'failed' ? (
                  <AlertCircleIcon size={16} strokeWidth={2} className={styles.deliveryFailed} />
                ) : null}
                <span className={styles.deliveryText}>{delivery.text}</span>
                {delivery.kind === 'sent' && delivery.at !== '' ? (
                  <time dateTime={delivery.at} className={styles.muted}>
                    {formatDateTime(delivery.at)}
                  </time>
                ) : null}
              </span>
              {delivery.kind === 'failed' ? (
                <Button
                  variant="secondary"
                  size="sm"
                  loading={retry.isPending}
                  onClick={() => {
                    retry.mutate();
                  }}
                >
                  Gửi lại
                </Button>
              ) : null}
            </div>
            {delivery.kind === 'sent' && delivery.warning !== null ? (
              <p className={styles.deliveryWarning}>{delivery.warning}</p>
            ) : null}
          </section>
        )}

        <form
          className={styles.noteForm}
          onSubmit={(event) => {
            event.preventDefault();
            if (noteChanged) {
              update.mutate({ note: note.trim() });
            }
          }}
        >
          <Field label="Ghi chú nội bộ" counter={{ length: note.length, max: LEAD_NOTE_MAX }}>
            <Textarea
              rows={2}
              value={note}
              maxLength={LEAD_NOTE_MAX}
              placeholder="Ví dụ: hẹn gọi lại sau 18h"
              onChange={(event) => {
                setNoteDraft(event.target.value);
              }}
            />
          </Field>
          {noteChanged ? (
            <div className={styles.noteActions}>
              <Button
                type="submit"
                variant="secondary"
                size="sm"
                loading={update.isPending && update.variables.note !== undefined}
              >
                Lưu ghi chú
              </Button>
            </div>
          ) : null}
        </form>
      </div>

      <div className={styles.detailActions}>
        <Button
          variant="secondary"
          size="sm"
          loading={update.isPending && update.variables.spam !== undefined}
          onClick={() => {
            update.mutate({ spam: !lead.spam.suspected });
          }}
        >
          {lead.spam.suspected ? 'Không phải spam' : 'Chuyển vào spam'}
        </Button>
        {canManage ? (
          <>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                setEditKey((key) => key + 1);
                setEditOpen(true);
              }}
            >
              Sửa thông tin
            </Button>
            <DropdownMenu
              align="start"
              trigger={
                <Button
                  variant="secondary"
                  size="sm"
                  leadingIcon={<DownloadIcon size={16} />}
                  loading={exportFile.isPending}
                >
                  Xuất dữ liệu người này
                </Button>
              }
            >
              <DropdownMenuItem
                onSelect={() => {
                  exportFile.mutate('json');
                }}
              >
                File JSON
              </DropdownMenuItem>
              <DropdownMenuItem
                onSelect={() => {
                  exportFile.mutate('csv');
                }}
              >
                File CSV (Excel)
              </DropdownMenuItem>
            </DropdownMenu>
            <Button
              variant="secondary"
              size="sm"
              className={styles.dangerAction}
              onClick={() => {
                remove.reset();
                setDeleteOpen(true);
              }}
            >
              Xóa dữ liệu người này
            </Button>
          </>
        ) : null}
      </div>

      <ConsentEvidenceDialog consent={consent} open={evidenceOpen} onOpenChange={setEvidenceOpen} />
      {canManage && editKey > 0 ? (
        <EditLeadContactDialog
          key={editKey}
          lead={lead}
          open={editOpen}
          onOpenChange={setEditOpen}
          onSaved={(updated) => {
            setEditOpen(false);
            queryClient.setQueryData(detailKey, updated);
            refreshLists();
            toast({ tone: 'success', title: 'Đã sửa thông tin của lead' });
          }}
          onGone={() => {
            setEditOpen(false);
            refreshLists();
            onGone();
          }}
        />
      ) : null}
      {canManage ? (
        <ConfirmDialog
          open={deleteOpen}
          onOpenChange={setDeleteOpen}
          tone="danger"
          title={`Xóa dữ liệu của ${lead.name}?`}
          description={`Xóa ${cappedCountLabel(lead.personLeads)} lead có cùng số điện thoại hoặc email trong site này, kèm bằng chứng đồng ý. Không hoàn tác được.`}
          confirmLabel="Xóa dữ liệu"
          pending={remove.isPending}
          error={remove.isError ? problemMessage(remove.error) : undefined}
          onConfirm={() => {
            remove.mutate();
          }}
        >
          <p className={styles.confirmNote}>
            Thông báo đã gửi qua email trước đó không bị xóa theo. Việc xóa được ghi vào nhật ký
            hoạt động, không kèm dữ liệu cá nhân.
          </p>
        </ConfirmDialog>
      ) : null}
    </aside>
  );
}
