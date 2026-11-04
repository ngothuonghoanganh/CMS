'use client';

import {
  type Access,
  can,
  CONTACT_BULK_MAX,
  CONTACT_PAGE_SIZE,
  type ContactListItem,
  type ContactListQuery,
  type ContactListResponse,
  type ContactOptionsResponse,
  type ContactView,
  contactViewLabels,
  contactViews,
  endpoints,
  type Site,
} from '@plp/contracts';
import {
  Button,
  ButtonLink,
  Callout,
  Checkbox,
  EmptyState,
  Field,
  Input,
  PlusIcon,
  SearchIcon,
  SegmentedControl,
  Select,
  UsersIcon,
  useToast,
  VisuallyHidden,
} from '@plp/ui';
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useState } from 'react';
import { api } from '../../lib/api';
import { formatDateTime, formatRelativeTime } from '../../lib/format';
import { normalizeLeadSearch } from '../leads/filters';
import { cx } from '../shell/cx';
import { leadsHref, siteHref } from '../shell/navigation';
import { PageContainer, PageHeader } from '../shell/PageHeader';
import { problemMessage } from '../shell/problem-message';
import { useDebouncedValue } from '../shell/use-debounced-value';
import { useNow } from '../shell/use-now';
import { AddContactDialog } from './AddContactDialog';
import { ContactBulkBar } from './ContactBulkBar';
import {
  contactCountLabel,
  contactReachLine,
  contactSourceLines,
  rangeLabel,
} from './contact-presentation';
import { MergeSuggestionPanel } from './MergeSuggestionPanel';
import { contactQueryKeys } from './queries';
import styles from './Contacts.module.css';

const SEARCH_DEBOUNCE_MS = 300;

export interface ContactsScreenProps {
  site: Site;
  role: Access;
  initialList: ContactListResponse;
  initialOptions: ContactOptionsResponse;
  loadedAt: number;
}

/** Screen 22 "Khách hàng" (ADR-033): one profile per person, gathered from the site's leads. */
export function ContactsScreen({
  site,
  role,
  initialList,
  initialOptions,
  loadedAt,
}: ContactsScreenProps) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const now = useNow(loadedAt);
  const canHandle = can(role, 'leads.handle');
  const [view, setView] = useState<ContactView>('all');
  const [ownerId, setOwnerId] = useState('');
  const [tag, setTag] = useState('');
  const [searchText, setSearchText] = useState('');
  const q = normalizeLeadSearch(useDebouncedValue(searchText, SEARCH_DEBOUNCE_MS));
  // The cursors of the pages before the one shown: "Trước" goes back through them.
  const [cursors, setCursors] = useState<readonly (string | undefined)[]>([undefined]);
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [addOpen, setAddOpen] = useState(false);
  const [addKey, setAddKey] = useState(0);

  const listView = view === 'duplicates' ? 'all' : view;
  const cursor = cursors.at(-1);
  const query: ContactListQuery = {
    view: listView,
    ...(view === 'all' && ownerId !== '' ? { ownerId } : {}),
    ...(tag === '' ? {} : { tag }),
    ...(q === '' ? {} : { q }),
    ...(cursor === undefined ? {} : { cursor }),
  };
  const firstQuery =
    query.view === 'all' &&
    query.ownerId === undefined &&
    query.tag === undefined &&
    query.q === undefined &&
    query.cursor === undefined;

  const list = useQuery({
    queryKey: contactQueryKeys.list(site.id, query),
    queryFn: ({ signal }) => {
      const { q: search, ...filters } = query;
      return search === undefined
        ? api(endpoints.listContacts, [site.id], { query: filters, signal })
        : api(endpoints.searchContacts, [site.id], { body: { ...filters, q: search }, signal });
    },
    initialData: firstQuery ? initialList : undefined,
    initialDataUpdatedAt: loadedAt,
    placeholderData: keepPreviousData,
  });
  const options = useQuery({
    queryKey: contactQueryKeys.options(site.id),
    queryFn: ({ signal }) => api(endpoints.contactOptions, [site.id], { signal }),
    initialData: initialOptions,
    initialDataUpdatedAt: loadedAt,
  });
  const suggestions = useQuery({
    queryKey: contactQueryKeys.suggestions(site.id),
    queryFn: ({ signal }) => api(endpoints.listMergeSuggestions, [site.id], { signal }),
    enabled: view === 'duplicates',
  });

  const counts = list.data?.counts ?? initialList.counts;
  const items = list.data?.items ?? [];
  const firstIndex = (cursors.length - 1) * CONTACT_PAGE_SIZE + 1;
  const filtered = ownerId !== '' || tag !== '' || q !== '';
  const neverAny = !filtered && counts.all.count === 0 && counts.duplicates.count === 0;

  function resetPaging() {
    setCursors([undefined]);
    setSelected(new Set());
  }

  function refresh() {
    setSelected(new Set());
    void queryClient.invalidateQueries({ queryKey: contactQueryKeys.all(site.id) });
  }

  function toggle(id: string, on: boolean) {
    setSelected((current) => {
      const next = new Set(current);
      if (on) {
        next.add(id);
      } else {
        next.delete(id);
      }
      return next;
    });
  }

  const allOnPage = items.length > 0 && items.every((contact) => selected.has(contact.id));
  const tooMany = selected.size > CONTACT_BULK_MAX;

  return (
    <PageContainer width="wide">
      <PageHeader
        title="Khách hàng"
        description={
          <>
            Mỗi người một hồ sơ, tự gom từ lead của các trang {site.name}. Lead gốc vẫn ở{' '}
            <Link href={leadsHref(site.id)}>Leads</Link>.
          </>
        }
        actions={
          canHandle ? (
            <Button
              leadingIcon={<PlusIcon size={16} />}
              onClick={() => {
                setAddKey((key) => key + 1);
                setAddOpen(true);
              }}
            >
              Thêm khách hàng
            </Button>
          ) : null
        }
      />
      {canHandle ? (
        <AddContactDialog
          key={addKey}
          siteId={site.id}
          open={addOpen}
          onOpenChange={setAddOpen}
          onAdded={(contact) => {
            setAddOpen(false);
            toast({ tone: 'success', title: `Đã thêm ${contact.name}` });
            refresh();
          }}
          onFindExisting={(phone) => {
            setAddOpen(false);
            setView('all');
            setOwnerId('');
            setTag('');
            setSearchText(phone);
            resetPaging();
          }}
        />
      ) : null}

      {neverAny ? (
        <EmptyState
          icon={<UsersIcon size={24} />}
          title="Chưa có khách hàng nào"
          description="Mỗi khi có người gửi form trên trang live, hồ sơ khách hàng được tạo tự động. Bạn cũng có thể thêm tay khách gọi điện hoặc đến trực tiếp."
          action={
            <ButtonLink as={Link} href={siteHref(site.id)}>
              Thêm form vào một trang
            </ButtonLink>
          }
          className={styles.empty}
        />
      ) : (
        <>
          <div className={styles.toolbar}>
            <SegmentedControl<ContactView>
              aria-label="Danh sách"
              options={contactViews.map((id) => ({
                value: id,
                label: `${contactViewLabels[id]} · ${contactCountLabel(counts[id])}`,
              }))}
              value={view}
              onChange={(next) => {
                setView(next);
                resetPaging();
              }}
              className={counts.duplicates.count > 0 ? styles.viewsWithPairs : undefined}
            />
            <div className={styles.filters}>
              <Field label="Người phụ trách" hideLabel className={styles.filter}>
                <Select
                  value={view === 'all' ? ownerId : ''}
                  disabled={view !== 'all'}
                  onChange={(event) => {
                    setOwnerId(event.target.value);
                    resetPaging();
                  }}
                >
                  <option value="">Mọi người phụ trách</option>
                  {options.data.assignees.map((person) => (
                    <option key={person.id} value={person.id}>
                      {person.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Nhãn" hideLabel className={styles.filter}>
                <Select
                  value={tag}
                  disabled={view === 'duplicates'}
                  onChange={(event) => {
                    setTag(event.target.value);
                    resetPaging();
                  }}
                >
                  <option value="">Mọi nhãn</option>
                  {options.data.tags.map((name) => (
                    <option key={name} value={name}>
                      {name}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Tìm khách hàng" hideLabel className={styles.search}>
                <Input
                  type="search"
                  leadingIcon={<SearchIcon size={16} />}
                  placeholder="Tên, số điện thoại, email"
                  autoComplete="off"
                  value={searchText}
                  disabled={view === 'duplicates'}
                  onChange={(event) => {
                    setSearchText(event.target.value);
                    resetPaging();
                  }}
                />
              </Field>
            </div>
          </div>

          {view === 'duplicates' ? (
            suggestions.isError ? (
              <Callout tone="danger" role="alert" title="Chưa tải được các cặp hồ sơ">
                {problemMessage(suggestions.error)}
              </Callout>
            ) : suggestions.data === undefined ? (
              <p className={styles.loading}>Đang tải…</p>
            ) : (
              <MergeSuggestionPanel
                siteId={site.id}
                pairs={suggestions.data.items}
                total={suggestions.data.total.count}
                canHandle={canHandle}
                onDone={refresh}
              />
            )
          ) : (
            <>
              {canHandle && selected.size > 0 ? (
                tooMany ? (
                  <Callout tone="warning" role="status">
                    Chọn tối đa {CONTACT_BULK_MAX} khách hàng mỗi lần.
                  </Callout>
                ) : (
                  <ContactBulkBar
                    siteId={site.id}
                    selected={[...selected]}
                    assignees={options.data.assignees}
                    tags={options.data.tags}
                    onDone={refresh}
                  />
                )
              ) : null}
              <section aria-label="Danh sách khách hàng" className={styles.listCard}>
                <VisuallyHidden aria-live="polite">
                  {!list.isPlaceholderData && items.length === 0
                    ? 'Không có khách hàng nào khớp'
                    : ''}
                </VisuallyHidden>
                {list.isError ? (
                  <Callout tone="danger" role="alert" title="Chưa tải được danh sách">
                    {problemMessage(list.error)}
                  </Callout>
                ) : null}
                <div className={styles.tableScroll}>
                  <table className={cx(styles.table, canHandle && styles.selectable)}>
                    <thead>
                      <tr>
                        {canHandle ? (
                          <th scope="col" className={styles.checkCell}>
                            <Checkbox
                              className={styles.rowCheck}
                              label={<VisuallyHidden>Chọn tất cả</VisuallyHidden>}
                              checked={allOnPage}
                              disabled={items.length === 0}
                              onChange={(event) => {
                                const on = event.target.checked;
                                setSelected((current) => {
                                  const next = new Set(current);
                                  for (const contact of items) {
                                    if (on) {
                                      next.add(contact.id);
                                    } else {
                                      next.delete(contact.id);
                                    }
                                  }
                                  return next;
                                });
                              }}
                            />
                          </th>
                        ) : null}
                        <th scope="col">KHÁCH HÀNG</th>
                        <th scope="col">NGUỒN</th>
                        <th scope="col">PHỤ TRÁCH</th>
                        <th scope="col">NHÃN</th>
                        <th scope="col">TƯƠNG TÁC</th>
                      </tr>
                    </thead>
                    <tbody>
                      {items.map((contact) => (
                        <ContactRow
                          key={contact.id}
                          contact={contact}
                          now={now}
                          selectable={canHandle}
                          selected={selected.has(contact.id)}
                          onSelect={(on) => {
                            toggle(contact.id, on);
                          }}
                        />
                      ))}
                    </tbody>
                  </table>
                </div>
                {items.length === 0 && !list.isPlaceholderData ? (
                  <p className={styles.noMatch}>Không có khách hàng nào khớp.</p>
                ) : null}
                <div className={styles.pager}>
                  <span>{rangeLabel(firstIndex, items.length, counts[listView])}</span>
                  <span className={styles.pagerButtons}>
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={cursors.length === 1}
                      onClick={() => {
                        setCursors((current) => current.slice(0, -1));
                        setSelected(new Set());
                      }}
                    >
                      Trước
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={!list.data?.nextCursor || list.isPlaceholderData}
                      onClick={() => {
                        const next = list.data?.nextCursor;
                        if (next) {
                          setCursors((current) => [...current, next]);
                          setSelected(new Set());
                        }
                      }}
                    >
                      Sau
                    </Button>
                  </span>
                </div>
              </section>
            </>
          )}
        </>
      )}
    </PageContainer>
  );
}

interface ContactRowProps {
  contact: ContactListItem;
  now: number;
  selectable: boolean;
  selected: boolean;
  onSelect: (selected: boolean) => void;
}

function ContactRow({ contact, now, selectable, selected, onSelect }: ContactRowProps) {
  const source = contactSourceLines(contact);
  return (
    <tr className={selected ? styles.selectedRow : undefined}>
      {selectable ? (
        <td className={styles.checkCell}>
          <Checkbox
            className={styles.rowCheck}
            label={<VisuallyHidden>Chọn {contact.name}</VisuallyHidden>}
            checked={selected}
            onChange={(event) => {
              onSelect(event.target.checked);
            }}
          />
        </td>
      ) : null}
      <td>
        <span className={styles.nameCell}>
          <span className={styles.nameRow}>
            <span className={styles.name}>{contact.name}</span>
            {contact.possibleDuplicate ? (
              <span className={styles.dupPill}>CÓ THỂ TRÙNG</span>
            ) : null}
          </span>
          <span className={styles.reach}>{contactReachLine(contact)}</span>
        </span>
      </td>
      <td>
        <span className={styles.sourceCell}>
          <span className={styles.sourceTitle}>{source.title}</span>
          <span className={styles.sourceDetail}>{source.detail}</span>
        </span>
      </td>
      <td className={contact.owner === null ? styles.unassigned : styles.owner}>
        {contact.owner?.name ?? 'Chưa giao'}
      </td>
      <td>
        <span className={styles.tags}>
          {contact.tags.map((name) => (
            <span key={name} className={styles.tag}>
              {name}
            </span>
          ))}
        </span>
      </td>
      <td className={styles.last}>
        <time dateTime={contact.lastActivityAt} title={formatDateTime(contact.lastActivityAt)}>
          {formatRelativeTime(contact.lastActivityAt, now)}
        </time>
      </td>
    </tr>
  );
}
