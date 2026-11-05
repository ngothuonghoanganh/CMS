'use client';

import {
  CONTACT_NOTE_MAX,
  type ContactPerson,
  createMeetingRequestSchema,
  createNoteRequestSchema,
  createTaskRequestSchema,
  endpoints,
  MEETING_NOTE_MAX,
  MEETING_PLACE_MAX,
  MEETING_WITH_MAX,
  TASK_TITLE_MAX,
} from '@plp/contracts';
import { Button, Callout, Field, Input, Select, Textarea, useToast } from '@plp/ui';
import { useMutation } from '@tanstack/react-query';
import { type KeyboardEvent, type SubmitEvent, useId, useRef, useState } from 'react';
import type { z } from 'zod';
import { ApiError, api } from '../../../lib/api';
import { cx } from '../../shell/cx';
import { problemBesideFields, reportUnexpected } from '../../shell/problem-message';
import { defaultDue, fromLocalInput, toLocalInput } from './profile-presentation';
import styles from './ContactProfile.module.css';

type ComposerTab = 'note' | 'task' | 'meeting';

const TABS: ReadonlyArray<{ id: ComposerTab; label: string; cta: string }> = [
  { id: 'note', label: 'Ghi chú', cta: 'Lưu ghi chú' },
  { id: 'task', label: 'Công việc', cta: 'Thêm công việc' },
  { id: 'meeting', label: 'Lịch hẹn', cta: 'Đặt lịch hẹn' },
];

/** The fields each tab shows, for the messages beside them. */
const FIELDS: Record<ComposerTab, readonly string[]> = {
  note: ['text'],
  task: ['title', 'dueAt', 'assigneeId'],
  meeting: ['at', 'place', 'with', 'note'],
};

type Errors = Record<string, string>;

function issuesOf(error: z.ZodError): Errors {
  const errors: Errors = {};
  for (const issue of error.issues) {
    errors[issue.path.join('.')] ??= issue.message;
  }
  return errors;
}

export interface ProfileComposerProps {
  siteId: string;
  contactId: string;
  assignees: readonly ContactPerson[];
  now: number;
  /** A note, task or meeting was written. */
  onWritten: () => void;
}

/**
 * "Thêm vào hồ sơ" (board 23): one box with three tabs, the arrow keys move between them. Each
 * write is an interaction of the profile (ADR-033).
 */
export function ProfileComposer({
  siteId,
  contactId,
  assignees,
  now,
  onWritten,
}: ProfileComposerProps) {
  const { toast } = useToast();
  const baseId = useId();
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const [tab, setTab] = useState<ComposerTab>('note');
  const [errors, setErrors] = useState<Errors>({});
  const [text, setText] = useState('');
  const [title, setTitle] = useState('');
  const [due, setDue] = useState(() => toLocalInput(defaultDue(now)));
  const [assigneeId, setAssigneeId] = useState(assignees[0]?.id ?? '');
  const [meetingAt, setMeetingAt] = useState('');
  const [place, setPlace] = useState('');
  const [withWhom, setWithWhom] = useState('');
  const [meetingNote, setMeetingNote] = useState('');

  const write = useMutation({
    mutationFn: async (kind: ComposerTab) => {
      switch (kind) {
        case 'note':
          return api(endpoints.createContactNote, [siteId, contactId], { body: { text } });
        case 'task':
          return api(endpoints.createContactTask, [siteId, contactId], {
            body: { title, dueAt: fromLocalInput(due) ?? '', assigneeId },
          });
        case 'meeting':
          return api(endpoints.createContactMeeting, [siteId, contactId], {
            body: {
              at: fromLocalInput(meetingAt) ?? '',
              place,
              with: withWhom,
              note: meetingNote,
            },
          });
      }
    },
    onSuccess: (_result, kind) => {
      setErrors({});
      if (kind === 'note') {
        setText('');
      } else if (kind === 'task') {
        setTitle('');
        setDue(toLocalInput(defaultDue(Date.now())));
      } else {
        setMeetingAt('');
        setPlace('');
        setWithWhom('');
        setMeetingNote('');
      }
      toast({
        tone: 'success',
        title:
          kind === 'note'
            ? 'Đã lưu ghi chú'
            : kind === 'task'
              ? 'Đã thêm công việc'
              : 'Đã đặt lịch hẹn',
      });
      onWritten();
    },
    onError: (error) => {
      if (error instanceof ApiError && Object.keys(error.fieldErrors()).length > 0) {
        setErrors(error.fieldErrors());
        return;
      }
      reportUnexpected('Writing to a contact failed', error);
    },
  });

  function validate(kind: ComposerTab): Errors {
    switch (kind) {
      case 'note': {
        const parsed = createNoteRequestSchema.safeParse({ text });
        return parsed.success ? {} : issuesOf(parsed.error);
      }
      case 'task': {
        const dueAt = fromLocalInput(due);
        const parsed = createTaskRequestSchema.safeParse({ title, dueAt, assigneeId });
        const found = parsed.success ? {} : issuesOf(parsed.error);
        return dueAt === null ? { ...found, dueAt: 'Chọn hạn' } : found;
      }
      case 'meeting': {
        const at = fromLocalInput(meetingAt);
        const parsed = createMeetingRequestSchema.safeParse({
          at,
          place,
          with: withWhom,
          note: meetingNote,
        });
        const found = parsed.success ? {} : issuesOf(parsed.error);
        return at === null ? { ...found, at: 'Chọn ngày giờ' } : found;
      }
    }
  }

  function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    write.reset();
    const found = validate(tab);
    setErrors(found);
    if (Object.keys(found).length > 0) {
      return;
    }
    write.mutate(tab);
  }

  function onTabKey(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const step = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
    if (step === 0) {
      return;
    }
    event.preventDefault();
    const next = (index + step + TABS.length) % TABS.length;
    const target = TABS[next];
    if (target) {
      setTab(target.id);
      setErrors({});
      tabRefs.current[next]?.focus();
    }
  }

  const current = TABS.find((item) => item.id === tab) ?? TABS[0];
  const formError = write.error === null ? null : problemBesideFields(write.error, FIELDS[tab]);
  const panelId = `${baseId}-panel`;

  return (
    <form className={styles.composer} noValidate onSubmit={submit}>
      <div role="tablist" aria-label="Thêm vào hồ sơ" className={styles.composerTabs}>
        {TABS.map((item, index) => (
          <button
            key={item.id}
            ref={(node) => {
              tabRefs.current[index] = node;
            }}
            type="button"
            role="tab"
            id={`${baseId}-${item.id}`}
            aria-selected={item.id === tab}
            aria-controls={panelId}
            tabIndex={item.id === tab ? 0 : -1}
            className={styles.composerTab}
            onClick={() => {
              setTab(item.id);
              setErrors({});
              write.reset();
            }}
            onKeyDown={(event) => {
              onTabKey(event, index);
            }}
          >
            {item.label}
          </button>
        ))}
      </div>
      <div
        role="tabpanel"
        id={panelId}
        aria-labelledby={`${baseId}-${tab}`}
        className={styles.dialogForm}
      >
        {tab === 'note' ? (
          <Field label="Ghi chú" hideLabel error={errors.text}>
            <Textarea
              rows={2}
              className={styles.composerText}
              value={text}
              maxLength={CONTACT_NOTE_MAX}
              placeholder="Ghi lại cuộc gọi, nhu cầu, điều cần lưu ý…"
              onChange={(event) => {
                setText(event.target.value);
              }}
            />
          </Field>
        ) : null}
        {tab === 'task' ? (
          <div className={styles.composerGrid}>
            <Field label="Việc cần làm" error={errors.title}>
              <Input
                value={title}
                maxLength={TASK_TITLE_MAX}
                autoComplete="off"
                onChange={(event) => {
                  setTitle(event.target.value);
                }}
              />
            </Field>
            <Field label="Hạn" error={errors.dueAt}>
              <Input
                type="datetime-local"
                value={due}
                onChange={(event) => {
                  setDue(event.target.value);
                }}
              />
            </Field>
            <Field label="Giao cho" error={errors.assigneeId}>
              <Select
                value={assigneeId}
                onChange={(event) => {
                  setAssigneeId(event.target.value);
                }}
              >
                {assignees.map((person) => (
                  <option key={person.id} value={person.id}>
                    {person.name}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
        ) : null}
        {tab === 'meeting' ? (
          <>
            <div className={cx(styles.composerGrid, styles.composerGridEven)}>
              <Field label="Ngày giờ" error={errors.at}>
                <Input
                  type="datetime-local"
                  value={meetingAt}
                  min={toLocalInput(now)}
                  onChange={(event) => {
                    setMeetingAt(event.target.value);
                  }}
                />
              </Field>
              <Field label="Nơi" error={errors.place}>
                <Input
                  value={place}
                  maxLength={MEETING_PLACE_MAX}
                  onChange={(event) => {
                    setPlace(event.target.value);
                  }}
                />
              </Field>
              <Field label="Người gặp" optional error={errors.with}>
                <Input
                  value={withWhom}
                  maxLength={MEETING_WITH_MAX}
                  onChange={(event) => {
                    setWithWhom(event.target.value);
                  }}
                />
              </Field>
            </div>
            <Field label="Nội dung hẹn" optional error={errors.note}>
              <Textarea
                rows={2}
                value={meetingNote}
                maxLength={MEETING_NOTE_MAX}
                placeholder="Ví dụ: Khám và chụp phim 3D"
                onChange={(event) => {
                  setMeetingNote(event.target.value);
                }}
              />
            </Field>
          </>
        ) : null}
      </div>
      {formError === null ? null : (
        <Callout tone="danger" role="alert" title="Chưa lưu được">
          {formError}
        </Callout>
      )}
      <div className={styles.composerFoot}>
        <Button type="submit" loading={write.isPending}>
          {current?.cta}
        </Button>
      </div>
    </form>
  );
}
