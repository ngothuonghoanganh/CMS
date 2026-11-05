'use client';

import {
  type ContactBulkRequest,
  type ContactPerson,
  contactTagSchema,
  endpoints,
} from '@plp/contracts';
import {
  Button,
  Dialog,
  DropdownMenu,
  DropdownMenuItem,
  DropdownMenuSeparator,
  Field,
  Input,
  useToast,
} from '@plp/ui';
import { useMutation } from '@tanstack/react-query';
import { type SubmitEvent, useId, useState } from 'react';
import { api } from '../../lib/api';
import { CreateOpportunityDialog } from '../pipeline/CreateOpportunityDialog';
import { problemMessage, reportUnexpected } from '../shell/problem-message';
import styles from './Contacts.module.css';

export interface ContactBulkBarProps {
  siteId: string;
  selected: readonly string[];
  assignees: readonly ContactPerson[];
  tags: readonly string[];
  /** The profiles changed: the list loads again and the selection clears. */
  onDone: () => void;
}

/**
 * "Thao tác hàng loạt" of board 22, on at most `CONTACT_BULK_MAX` selected profiles: assign, tag,
 * and one new opportunity each.
 */
export function ContactBulkBar({ siteId, selected, assignees, tags, onDone }: ContactBulkBarProps) {
  const { toast } = useToast();
  const [tagOpen, setTagOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [tag, setTag] = useState('');
  const [tagError, setTagError] = useState<string | null>(null);
  const formId = useId();
  const listId = useId();

  const bulk = useMutation({
    mutationFn: (body: ContactBulkRequest) => api(endpoints.bulkUpdateContacts, [siteId], { body }),
    onSuccess: (result, body) => {
      toast({
        tone: 'success',
        title:
          body.action === 'assign'
            ? `Đã giao ${result.updated} khách hàng`
            : `Đã gắn nhãn cho ${result.updated} khách hàng`,
      });
      setTagOpen(false);
      onDone();
    },
    onError: (error, body) => {
      if (body.action === 'tag') {
        setTagError(problemMessage(error));
        return;
      }
      reportUnexpected('Assigning contacts failed', error);
      toast({ tone: 'danger', title: 'Chưa giao được', description: problemMessage(error) });
    },
  });

  function submitTag(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsed = contactTagSchema.safeParse(tag);
    if (!parsed.success) {
      setTagError(parsed.error.issues[0]?.message ?? 'Nhãn chưa hợp lệ');
      return;
    }
    bulk.mutate({ action: 'tag', contactIds: [...selected], tag: parsed.data });
  }

  return (
    <div role="toolbar" aria-label="Thao tác hàng loạt" className={styles.bulkBar}>
      <span className={styles.bulkCount}>{selected.length} khách đã chọn</span>
      <DropdownMenu
        align="start"
        trigger={
          <Button size="sm" variant="secondary" className={styles.bulkButton}>
            Giao cho…
          </Button>
        }
      >
        {assignees.map((person) => (
          <DropdownMenuItem
            key={person.id}
            onSelect={() => {
              bulk.mutate({ action: 'assign', contactIds: [...selected], ownerId: person.id });
            }}
          >
            {person.name}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={() => {
            bulk.mutate({ action: 'assign', contactIds: [...selected], ownerId: null });
          }}
        >
          Bỏ giao
        </DropdownMenuItem>
      </DropdownMenu>
      <Button
        size="sm"
        variant="secondary"
        className={styles.bulkButton}
        onClick={() => {
          setTag('');
          setTagError(null);
          setTagOpen(true);
        }}
      >
        Gắn nhãn…
      </Button>
      <Button
        size="sm"
        variant="secondary"
        className={styles.bulkButton}
        onClick={() => {
          setCreateOpen(true);
        }}
      >
        Tạo cơ hội
      </Button>
      <CreateOpportunityDialog
        siteId={siteId}
        open={createOpen}
        onOpenChange={setCreateOpen}
        target={{ kind: 'selected', contactIds: selected }}
        onCreated={(created) => {
          setCreateOpen(false);
          toast({ tone: 'success', title: `Đã tạo ${created} cơ hội` });
          onDone();
        }}
      />
      <Dialog
        open={tagOpen}
        onOpenChange={(next) => {
          if (!next && bulk.isPending) {
            return;
          }
          setTagOpen(next);
        }}
        title="Gắn nhãn"
        description={`Cho ${selected.length} khách hàng đã chọn.`}
        footer={
          <>
            <Button
              variant="secondary"
              disabled={bulk.isPending}
              onClick={() => {
                setTagOpen(false);
              }}
            >
              Hủy
            </Button>
            <Button type="submit" form={formId} loading={bulk.isPending}>
              Gắn nhãn
            </Button>
          </>
        }
      >
        <form id={formId} noValidate onSubmit={submitTag}>
          <Field label="Nhãn" error={tagError ?? undefined} help="Tối đa 30 ký tự.">
            <Input
              value={tag}
              maxLength={30}
              list={listId}
              autoComplete="off"
              onChange={(event) => {
                setTag(event.target.value);
                setTagError(null);
              }}
            />
          </Field>
          <datalist id={listId}>
            {tags.map((existing) => (
              <option key={existing} value={existing} />
            ))}
          </datalist>
        </form>
      </Dialog>
    </div>
  );
}
