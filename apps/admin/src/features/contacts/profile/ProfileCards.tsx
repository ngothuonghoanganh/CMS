'use client';

import {
  type ContactMeeting,
  type ContactPerson,
  type ContactProfile,
  type ContactTask,
  contactTagSchema,
  endpoints,
  type UpdateContactRequest,
} from '@plp/contracts';
import { CheckIcon, CloseIcon, Input, Select, useToast, VisuallyHidden } from '@plp/ui';
import { useMutation } from '@tanstack/react-query';
import Link from 'next/link';
import { type KeyboardEvent, useEffect, useId, useRef, useState } from 'react';
import { api } from '../../../lib/api';
import { cx } from '../../shell/cx';
import { leadHref } from '../../shell/navigation';
import { problemMessage, reportUnexpected } from '../../shell/problem-message';
import {
  isOverdue,
  manualOriginLine,
  marketingLine,
  meetingDetail,
  meetingMoment,
  processingLine,
  taskDueLine,
} from './profile-presentation';
import styles from './ContactProfile.module.css';

/** Meetings "Lịch hẹn sắp tới" lists; the rest wait until these are past. */
const MEETINGS_SHOWN = 3;

export interface InfoCardProps {
  siteId: string;
  contact: ContactProfile;
  assignees: readonly ContactPerson[];
  siteTags: readonly string[];
  onChanged: (contact: ContactProfile) => void;
}

/** "Thông tin": the owner and the tags, changed with `leads.handle`. */
export function InfoCard({ siteId, contact, assignees, siteTags, onChanged }: InfoCardProps) {
  const { toast } = useToast();
  const ownerId = useId();
  const listId = useId();
  const [adding, setAdding] = useState(false);
  const [tag, setTag] = useState('');
  const [tagError, setTagError] = useState<string | null>(null);
  const tagRef = useRef<HTMLInputElement>(null);
  const canHandle = contact.can.handle;
  // The field appears where "+ Nhãn" was: focus follows the action that opened it.
  useEffect(() => {
    if (adding) {
      tagRef.current?.focus();
    }
  }, [adding]);
  // Someone who lost access to the site still shows as the owner until the profile is given on.
  const choices =
    contact.owner === null || assignees.some((person) => person.id === contact.owner?.id)
      ? assignees
      : [contact.owner, ...assignees];

  const update = useMutation({
    mutationFn: (body: UpdateContactRequest) =>
      api(endpoints.updateContact, [siteId, contact.id], { body }),
    onSuccess: (next, body) => {
      onChanged(next);
      if (body.action === 'add_tag') {
        setAdding(false);
        setTag('');
      }
    },
    onError: (error, body) => {
      if (body.action === 'add_tag') {
        setTagError(problemMessage(error));
        return;
      }
      reportUnexpected('Updating a contact failed', error);
      toast({ tone: 'danger', title: 'Chưa lưu được', description: problemMessage(error) });
    },
  });

  function addTag() {
    const parsed = contactTagSchema.safeParse(tag);
    if (!parsed.success) {
      setTagError(parsed.error.issues[0]?.message ?? 'Nhãn chưa hợp lệ');
      return;
    }
    update.mutate({ action: 'add_tag', tag: parsed.data });
  }

  function onTagKey(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Enter') {
      event.preventDefault();
      addTag();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      setAdding(false);
      setTagError(null);
    }
  }

  return (
    <section aria-labelledby="info-title" className={styles.card}>
      <h2 id="info-title" className={styles.cardTitle}>
        Thông tin
      </h2>
      <div className={styles.fieldGroup}>
        <label htmlFor={ownerId} className={styles.fieldLabel}>
          Người phụ trách
        </label>
        <Select
          id={ownerId}
          value={contact.owner?.id ?? ''}
          disabled={!canHandle || update.isPending}
          onChange={(event) => {
            update.mutate({
              action: 'assign',
              ownerId: event.target.value === '' ? null : event.target.value,
            });
          }}
        >
          <option value="">Chưa giao</option>
          {choices.map((person) => (
            <option key={person.id} value={person.id}>
              {person.name}
            </option>
          ))}
        </Select>
      </div>
      <div className={styles.fieldGroup}>
        <span className={styles.fieldLabel} id="tags-label">
          Nhãn
        </span>
        <span className={styles.tags} role="group" aria-labelledby="tags-label">
          {contact.tags.map((name) => (
            <span key={name} className={styles.tag}>
              {name}
              {canHandle ? (
                <button
                  type="button"
                  className={styles.tagRemove}
                  disabled={update.isPending}
                  onClick={() => {
                    update.mutate({ action: 'remove_tag', tag: name });
                  }}
                >
                  <CloseIcon size={12} />
                  <VisuallyHidden>Bỏ nhãn {name}</VisuallyHidden>
                </button>
              ) : null}
            </span>
          ))}
          {canHandle && !adding ? (
            <button
              type="button"
              className={styles.addTag}
              onClick={() => {
                setTag('');
                setTagError(null);
                setAdding(true);
              }}
            >
              + Nhãn
            </button>
          ) : null}
        </span>
        {adding ? (
          <>
            <Input
              ref={tagRef}
              aria-label="Nhãn mới"
              value={tag}
              maxLength={30}
              list={listId}
              autoComplete="off"
              invalid={tagError !== null}
              disabled={update.isPending}
              placeholder="Gõ nhãn rồi bấm Enter"
              onChange={(event) => {
                setTag(event.target.value);
                setTagError(null);
              }}
              onKeyDown={onTagKey}
              onBlur={() => {
                if (tag.trim() === '') {
                  setAdding(false);
                }
              }}
            />
            <datalist id={listId}>
              {siteTags
                .filter((name) => !contact.tags.includes(name))
                .map((name) => (
                  <option key={name} value={name} />
                ))}
            </datalist>
            {tagError === null ? null : (
              <span role="alert" className={styles.taskLate}>
                {tagError}
              </span>
            )}
          </>
        ) : null}
      </div>
    </section>
  );
}

/** "Đồng ý": from the latest lead with a link to its evidence, or from the recorded source. */
export function ConsentCard({ siteId, contact }: { siteId: string; contact: ContactProfile }) {
  const processing = processingLine(contact);
  const manual = manualOriginLine(contact);
  const leadId = contact.consent.processing?.leadId ?? null;
  return (
    <section aria-labelledby="consent-title" className={cx(styles.card, styles.consent)}>
      <h2 id="consent-title" className={styles.cardTitle}>
        Đồng ý
      </h2>
      {processing === null ? null : (
        <span className={styles.consentLine}>
          <CheckIcon size={16} className={styles.consentCheck} />
          <span>{processing}</span>
        </span>
      )}
      {manual === null ? null : (
        <span className={styles.consentLine}>
          <span aria-hidden="true" className={styles.consentDash}>
            –
          </span>
          <span>{manual}</span>
        </span>
      )}
      <span className={styles.consentLine}>
        {contact.consent.marketing.consented ? (
          <CheckIcon size={16} className={styles.consentCheck} />
        ) : (
          <span aria-hidden="true" className={styles.consentDash}>
            –
          </span>
        )}
        <span>{marketingLine(contact)}</span>
      </span>
      {leadId === null ? null : (
        <Link href={leadHref(siteId, leadId)} className={styles.textLink}>
          Xem bằng chứng trong lead
        </Link>
      )}
    </section>
  );
}

export interface TasksCardProps {
  siteId: string;
  contactId: string;
  tasks: readonly ContactTask[];
  now: number;
  canHandle: boolean;
  /** The task as the server saved it; the profile reads its tasks again after. */
  onChanged: (task: ContactTask) => void;
}

/** "Công việc": open tasks by due time, overdue in red, then the latest done ones. */
export function TasksCard({ siteId, contactId, tasks, now, canHandle, onChanged }: TasksCardProps) {
  const { toast } = useToast();
  // Set in the click itself, so the controlled box never flips back while the request runs.
  const [ticking, setTicking] = useState<{ taskId: string; done: boolean } | null>(null);
  const tick = useMutation({
    mutationFn: ({ taskId, done }: { taskId: string; done: boolean }) =>
      api(endpoints.updateContactTask, [siteId, contactId, taskId], { body: { done } }),
    onSuccess: onChanged,
    onSettled: () => {
      setTicking(null);
    },
    onError: (error) => {
      reportUnexpected('Ticking a task failed', error);
      toast({ tone: 'danger', title: 'Chưa lưu được', description: problemMessage(error) });
    },
  });
  return (
    <section aria-labelledby="tasks-title" className={cx(styles.card, styles.tasks)}>
      <h2 id="tasks-title" className={styles.cardTitle}>
        Công việc
      </h2>
      {tasks.length === 0 ? <p className={styles.empty}>Chưa có công việc.</p> : null}
      {tasks.map((task) => {
        // The box follows the click at once; the server's answer replaces it.
        const done = ticking?.taskId === task.id ? ticking.done : task.doneAt !== null;
        const late = isOverdue(task, now);
        return (
          <label key={task.id} className={cx(styles.taskRow, done && styles.taskDone)}>
            <input
              type="checkbox"
              checked={done}
              disabled={!canHandle || ticking !== null}
              onChange={(event) => {
                const next = { taskId: task.id, done: event.target.checked };
                setTicking(next);
                tick.mutate(next);
              }}
            />
            <span>
              <span className={styles.taskTitle}>{task.title}</span>
              {done ? null : (
                <span className={cx(styles.taskMeta, late && styles.taskLate)}>
                  {taskDueLine(task, now)}
                </span>
              )}
            </span>
          </label>
        );
      })}
    </section>
  );
}

/** "Lịch hẹn sắp tới", soonest first. */
export function MeetingsCard({ meetings }: { meetings: readonly ContactMeeting[] }) {
  return (
    <section aria-labelledby="meetings-title" className={cx(styles.card, styles.meetings)}>
      <h2 id="meetings-title" className={styles.cardTitle}>
        Lịch hẹn sắp tới
      </h2>
      {meetings.length === 0 ? <p className={styles.empty}>Chưa có lịch hẹn.</p> : null}
      {meetings.slice(0, MEETINGS_SHOWN).map((meeting) => (
        <div key={meeting.id} className={styles.meeting}>
          <span className={styles.meetingWhen}>{meetingMoment(meeting.at)}</span>
          <span className={styles.meetingDetail}>{meetingDetail(meeting)}</span>
        </div>
      ))}
    </section>
  );
}
