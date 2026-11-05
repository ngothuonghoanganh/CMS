'use client';

import {
  type ContactOptionsResponse,
  type ContactProfile,
  type ContactProfileResponse,
  type ContactTask,
  endpoints,
  LEAD_PERSON_EXPORT_MAX,
  type Site,
  type TimelineResponse,
} from '@plp/contracts';
import {
  ButtonLink,
  ChevronLeftIcon,
  DropdownMenu,
  DropdownMenuItem,
  IconButton,
  MoreHorizontalIcon,
  PhoneIcon,
  useToast,
} from '@plp/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { api, downloadFile } from '../../../lib/api';
import { formatDate } from '../../../lib/format';
import { contactsHref } from '../../shell/navigation';
import { PageContainer } from '../../shell/PageHeader';
import { problemMessage, reportUnexpected } from '../../shell/problem-message';
import { useNow } from '../../shell/use-now';
import { contactQueryKeys } from '../queries';
import { DeletePersonDialog } from './DeletePersonDialog';
import { EditContactDialog } from './EditContactDialog';
import { ProfileComposer } from './ProfileComposer';
import { CreateOpportunityDialog } from '../../pipeline/CreateOpportunityDialog';
import { pipelineQueryKeys } from '../../pipeline/queries';
import { ConsentCard, InfoCard, MeetingsCard, OpportunitiesCard, TasksCard } from './ProfileCards';
import { ProfileTimeline } from './ProfileTimeline';
import {
  displayPhone,
  missingPermissionNote,
  profileInitials,
  telHref,
  zaloHref,
} from './profile-presentation';
import styles from './ContactProfile.module.css';

export interface ContactProfileScreenProps {
  site: Site;
  profile: ContactProfileResponse;
  timeline: TimelineResponse;
  options: ContactOptionsResponse;
  loadedAt: number;
}

/**
 * Screen 23 "Hồ sơ khách hàng" (ADR-033): who the person is, what they agreed to, what the team
 * noted, has to do and booked, and the person's data.
 */
export function ContactProfileScreen({
  site,
  profile: initialProfile,
  timeline,
  options: initialOptions,
  loadedAt,
}: ContactProfileScreenProps) {
  const queryClient = useQueryClient();
  const router = useRouter();
  const { toast } = useToast();
  const now = useNow(loadedAt);
  const contactId = initialProfile.contact.id;
  const profileKey = contactQueryKeys.profile(site.id, contactId);
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const profileQuery = useQuery({
    queryKey: profileKey,
    queryFn: ({ signal }) => api(endpoints.contactProfile, [site.id, contactId], { signal }),
    initialData: initialProfile,
    initialDataUpdatedAt: loadedAt,
  });
  const optionsQuery = useQuery({
    queryKey: contactQueryKeys.options(site.id),
    queryFn: ({ signal }) => api(endpoints.contactOptions, [site.id], { signal }),
    initialData: initialOptions,
    initialDataUpdatedAt: loadedAt,
  });
  const { contact, tasks, meetings, opportunities } = profileQuery.data;
  const [createOpen, setCreateOpen] = useState(false);

  /** The card changed: the profile shows it at once, the list reads it again. */
  function adopt(next: ContactProfile) {
    queryClient.setQueryData<ContactProfileResponse>(profileKey, (current) =>
      current === undefined ? current : { ...current, contact: next },
    );
    void queryClient.invalidateQueries({ queryKey: contactQueryKeys.lists(site.id) });
  }

  /** A task was ticked: it shows at once, then the profile reads its tasks again. */
  function adoptTask(task: ContactTask) {
    queryClient.setQueryData<ContactProfileResponse>(profileKey, (current) =>
      current === undefined
        ? current
        : { ...current, tasks: current.tasks.map((item) => (item.id === task.id ? task : item)) },
    );
    void queryClient.invalidateQueries({ queryKey: profileKey, exact: true });
  }

  /** A note, task or meeting was written: the profile, its timeline and the list move. */
  function refresh() {
    void queryClient.invalidateQueries({ queryKey: profileKey });
    void queryClient.invalidateQueries({ queryKey: contactQueryKeys.lists(site.id) });
  }

  const exportPerson = useMutation({
    mutationFn: () => downloadFile(endpoints.exportContactPerson, [site.id, contactId]),
    onSuccess: (file) => {
      toast(
        file.truncated
          ? {
              tone: 'warning',
              title: 'Đã xuất một phần dữ liệu',
              description: `File gồm ${LEAD_PERSON_EXPORT_MAX} lead mới nhất của người này.`,
            }
          : { tone: 'success', title: 'Đã xuất dữ liệu của người này' },
      );
    },
    onError: (error) => {
      reportUnexpected('Exporting a person failed', error);
      toast({ tone: 'danger', title: 'Chưa xuất được', description: problemMessage(error) });
    },
  });

  return (
    <PageContainer>
      <div className={styles.page}>
        <ButtonLink
          as={Link}
          href={contactsHref(site.id)}
          variant="ghost"
          size="sm"
          className={styles.back}
          leadingIcon={<ChevronLeftIcon size={16} />}
        >
          Khách hàng
        </ButtonLink>
        <header className={styles.header}>
          <div className={styles.identity}>
            <span aria-hidden="true" className={styles.avatar}>
              {profileInitials(contact.name)}
            </span>
            <div className={styles.nameBlock}>
              <h1 className={styles.name}>{contact.name}</h1>
              <span className={styles.reach}>
                {contact.phone === null ? null : (
                  <span className={styles.mono}>{displayPhone(contact.phone)}</span>
                )}
                {contact.email === null ? null : <span>{contact.email}</span>}
                <span>Khách từ {formatDate(contact.createdAt)}</span>
              </span>
            </div>
          </div>
          <div className={styles.actions}>
            {contact.phone === null ? null : (
              <>
                <ButtonLink href={telHref(contact.phone)} leadingIcon={<PhoneIcon size={16} />}>
                  Gọi
                </ButtonLink>
                <ButtonLink
                  href={zaloHref(contact.phone)}
                  variant="secondary"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Nhắn Zalo
                </ButtonLink>
              </>
            )}
            <DropdownMenu
              align="end"
              trigger={
                <IconButton
                  variant="secondary"
                  aria-label="Thao tác dữ liệu"
                  icon={<MoreHorizontalIcon size={18} />}
                />
              }
            >
              <DropdownMenuItem
                disabled={!contact.can.manage}
                description={
                  contact.can.manage ? undefined : missingPermissionNote('personalData.manage')
                }
                onSelect={() => {
                  setEditOpen(true);
                }}
              >
                Sửa thông tin
              </DropdownMenuItem>
              <DropdownMenuItem
                disabled={!contact.can.export || exportPerson.isPending}
                description={contact.can.export ? undefined : missingPermissionNote('leads.export')}
                onSelect={() => {
                  exportPerson.mutate();
                }}
              >
                Xuất dữ liệu của người này
              </DropdownMenuItem>
              <DropdownMenuItem
                tone="danger"
                disabled={!contact.can.manage}
                description={
                  contact.can.manage ? undefined : missingPermissionNote('personalData.manage')
                }
                onSelect={() => {
                  setDeleteOpen(true);
                }}
              >
                Xóa dữ liệu của người này
              </DropdownMenuItem>
            </DropdownMenu>
          </div>
        </header>

        <div className={styles.columns}>
          <aside className={styles.left} aria-label="Thông tin khách hàng">
            <InfoCard
              siteId={site.id}
              contact={contact}
              assignees={optionsQuery.data.assignees}
              siteTags={optionsQuery.data.tags}
              onChanged={adopt}
            />
            <OpportunitiesCard
              siteId={site.id}
              contact={contact}
              opportunities={opportunities}
              onCreate={() => {
                setCreateOpen(true);
              }}
            />
            <ConsentCard siteId={site.id} contact={contact} />
          </aside>
          <section className={styles.main} aria-labelledby="timeline-title">
            {contact.can.handle ? (
              <ProfileComposer
                siteId={site.id}
                contactId={contactId}
                assignees={optionsQuery.data.assignees}
                now={now}
                onWritten={refresh}
              />
            ) : null}
            <ProfileTimeline
              siteId={site.id}
              contactId={contactId}
              initial={timeline}
              loadedAt={loadedAt}
            />
          </section>
          <aside className={styles.right} aria-label="Việc và lịch hẹn">
            <TasksCard
              siteId={site.id}
              contactId={contactId}
              tasks={tasks}
              now={now}
              canHandle={contact.can.handle}
              onChanged={adoptTask}
            />
            <MeetingsCard meetings={meetings} />
          </aside>
        </div>
      </div>
      {contact.can.handle ? (
        <CreateOpportunityDialog
          siteId={site.id}
          open={createOpen}
          onOpenChange={setCreateOpen}
          target={{ kind: 'contact', contact: { id: contact.id, name: contact.name } }}
          onCreated={() => {
            setCreateOpen(false);
            toast({ tone: 'success', title: 'Đã tạo cơ hội' });
            refresh();
            void queryClient.invalidateQueries({ queryKey: pipelineQueryKeys.all(site.id) });
          }}
        />
      ) : null}
      {contact.can.manage ? (
        <>
          <EditContactDialog
            siteId={site.id}
            contact={contact}
            open={editOpen}
            onOpenChange={setEditOpen}
            onSaved={(next) => {
              adopt(next);
              setEditOpen(false);
              toast({ tone: 'success', title: 'Đã sửa thông tin' });
            }}
          />
          <DeletePersonDialog
            siteId={site.id}
            contact={contact}
            open={deleteOpen}
            onOpenChange={setDeleteOpen}
            onDeleted={(count) => {
              void queryClient.invalidateQueries({ queryKey: contactQueryKeys.all(site.id) });
              toast({
                tone: 'success',
                title: `Đã xóa dữ liệu của ${contact.name}`,
                description: `${count} lead đã được xóa cùng hồ sơ.`,
              });
              // The sidebar's lead count and the list read the deletion again.
              router.push(contactsHref(site.id));
              router.refresh();
            }}
          />
        </>
      ) : null}
    </PageContainer>
  );
}
