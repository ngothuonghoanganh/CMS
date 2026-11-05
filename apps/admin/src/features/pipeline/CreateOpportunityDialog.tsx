'use client';

import {
  type ContactPerson,
  endpoints,
  OPPORTUNITY_TITLE_MAX,
  opportunityTitleSchema,
  opportunityValueSchema,
} from '@plp/contracts';
import { Button, Callout, Dialog, Field, Input, Select } from '@plp/ui';
import { useMutation, useQuery } from '@tanstack/react-query';
import { type SubmitEvent, useId, useState } from 'react';
import { api } from '../../lib/api';
import { normalizeLeadSearch } from '../leads/filters';
import { problemMessage, reportUnexpected } from '../shell/problem-message';
import { useDebouncedValue } from '../shell/use-debounced-value';
import { formatVnd, parseVnd } from './pipeline-presentation';
import styles from './Pipeline.module.css';

const SEARCH_DEBOUNCE_MS = 300;

/** Who the opportunity is for: picked here, one known profile, or profiles selected on board 22. */
export type OpportunityFor =
  | { kind: 'pick' }
  | { kind: 'contact'; contact: ContactPerson }
  | { kind: 'selected'; contactIds: readonly string[] };

export interface CreateOpportunityDialogProps {
  siteId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** How many opportunities were created. */
  onCreated: (created: number) => void;
  target?: OpportunityFor;
}

/**
 * "Tạo cơ hội" (ADR-033): a "Mới" opportunity with a name and an expected value, given to the
 * profile's owner. From the pipeline it first finds the customer; the search stays in the body.
 */
export function CreateOpportunityDialog({
  siteId,
  open,
  onOpenChange,
  onCreated,
  target = { kind: 'pick' },
}: CreateOpportunityDialogProps) {
  const formId = useId();
  const [search, setSearch] = useState('');
  const [contactId, setContactId] = useState('');
  const [title, setTitle] = useState('');
  const [value, setValue] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const query = useDebouncedValue(normalizeLeadSearch(search), SEARCH_DEBOUNCE_MS);

  const found = useQuery({
    queryKey: ['sites', siteId, 'contacts', 'pick', query],
    queryFn: ({ signal }) =>
      query === ''
        ? api(endpoints.listContacts, [siteId], { query: { view: 'all' }, signal })
        : api(endpoints.searchContacts, [siteId], { body: { view: 'all', q: query }, signal }),
    enabled: open && target.kind === 'pick',
  });
  const choices = found.data?.items ?? [];
  const picked = contactId !== '' ? contactId : (choices[0]?.id ?? '');

  const create = useMutation({
    mutationFn: async (body: { title: string; value: number | null }) => {
      switch (target.kind) {
        case 'selected':
          return (
            await api(endpoints.bulkCreateOpportunities, [siteId], {
              body: { contactIds: [...target.contactIds], ...body },
            })
          ).created;
        case 'contact':
          await api(endpoints.createOpportunity, [siteId], {
            body: { contactId: target.contact.id, ...body },
          });
          return 1;
        case 'pick':
          await api(endpoints.createOpportunity, [siteId], {
            body: { contactId: picked, ...body },
          });
          return 1;
      }
    },
    onSuccess: (created) => {
      setTitle('');
      setValue('');
      onCreated(created);
    },
    onError: (error) => {
      reportUnexpected('Creating an opportunity failed', error);
    },
  });

  function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    create.reset();
    const next: Record<string, string> = {};
    const parsedTitle = opportunityTitleSchema.safeParse(title);
    if (!parsedTitle.success) {
      next.title = parsedTitle.error.issues[0]?.message ?? 'Nhập tên cơ hội';
    }
    const amount = parseVnd(value);
    const parsedValue = amount === null ? null : opportunityValueSchema.safeParse(amount);
    if (parsedValue !== null && !parsedValue.success) {
      next.value = parsedValue.error.issues[0]?.message ?? 'Số tiền chưa hợp lệ';
    }
    if (target.kind === 'pick' && picked === '') {
      next.contact = 'Chọn khách hàng';
    }
    setErrors(next);
    if (Object.keys(next).length > 0 || !parsedTitle.success) {
      return;
    }
    create.mutate({ title: parsedTitle.data, value: amount });
  }

  const description =
    target.kind === 'contact'
      ? `Cho ${target.contact.name}.`
      : target.kind === 'selected'
        ? `Mỗi khách hàng đã chọn một cơ hội, ${target.contactIds.length} khách.`
        : 'Cơ hội bắt đầu ở giai đoạn Mới và giao cho người phụ trách khách hàng.';

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next && create.isPending) {
          return;
        }
        onOpenChange(next);
      }}
      title="Tạo cơ hội"
      description={description}
      footer={
        <>
          <Button
            variant="secondary"
            disabled={create.isPending}
            onClick={() => {
              onOpenChange(false);
            }}
          >
            Hủy
          </Button>
          <Button type="submit" form={formId} loading={create.isPending}>
            Tạo cơ hội
          </Button>
        </>
      }
    >
      <form id={formId} className={styles.dialogForm} noValidate onSubmit={submit}>
        {target.kind === 'pick' ? (
          <div className={styles.dialogPair}>
            <Field label="Tìm khách hàng" optional>
              <Input
                type="search"
                autoComplete="off"
                value={search}
                placeholder="Tên, số điện thoại hoặc email"
                onChange={(event) => {
                  setSearch(event.target.value);
                  setContactId('');
                }}
              />
            </Field>
            <Field label="Khách hàng" error={errors.contact}>
              <Select
                value={picked}
                aria-busy={found.isFetching}
                onChange={(event) => {
                  setContactId(event.target.value);
                }}
              >
                {choices.length === 0 ? (
                  <option value="">Không có khách hàng phù hợp</option>
                ) : null}
                {choices.map((contact) => (
                  <option key={contact.id} value={contact.id}>
                    {contact.name}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
        ) : null}
        <Field label="Tên cơ hội" error={errors.title}>
          <Input
            value={title}
            maxLength={OPPORTUNITY_TITLE_MAX}
            autoComplete="off"
            placeholder="Ví dụ: Niềng răng Invisalign"
            onChange={(event) => {
              setTitle(event.target.value);
            }}
          />
        </Field>
        <Field label="Giá trị dự kiến" optional error={errors.value}>
          <Input
            inputMode="numeric"
            autoComplete="off"
            value={value}
            placeholder="38.000.000 ₫"
            onChange={(event) => {
              setValue(event.target.value);
            }}
            onBlur={() => {
              const amount = parseVnd(value);
              if (amount !== null) {
                setValue(formatVnd(amount));
              }
            }}
          />
        </Field>
        {create.isError ? (
          <Callout tone="danger" role="alert" title="Chưa tạo được cơ hội">
            {problemMessage(create.error)}
          </Callout>
        ) : null}
      </form>
    </Dialog>
  );
}
