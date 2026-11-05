'use client';

import {
  type ContactOptionsResponse,
  endpoints,
  type Opportunity,
  type OpportunityStage,
  opportunityStageLabels,
  opportunityStages,
  opportunityStageSchema,
  type PipelineColumn,
  type PipelineResponse,
  type Site,
} from '@plp/contracts';
import {
  Button,
  ChevronDownIcon,
  DropdownMenu,
  DropdownMenuItem,
  PlusIcon,
  SegmentedControl,
  Select,
  VisuallyHidden,
} from '@plp/ui';
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { type DragEvent, useState } from 'react';
import { api } from '../../lib/api';
import { contactHref } from '../shell/navigation';
import { PageContainer } from '../shell/PageHeader';
import { cx } from '../shell/cx';
import { useNow } from '../shell/use-now';
import { contactQueryKeys } from '../contacts/queries';
import { profileInitials } from '../contacts/profile/profile-presentation';
import { CreateOpportunityDialog } from './CreateOpportunityDialog';
import {
  cardValue,
  formatVnd,
  isLate,
  movesFrom,
  nextLine,
  summaryLine,
} from './pipeline-presentation';
import { pipelineQueryKeys } from './queries';
import { type MovableOpportunity, StageMark, useStageMove } from './StageMove';
import styles from './Pipeline.module.css';

type PipelineView = 'kanban' | 'list';

/** The card being dragged, read when it lands on a column. */
const DRAG_TYPE = 'application/x-plp-opportunity';

export interface PipelineScreenProps {
  site: Site;
  canHandle: boolean;
  initial: PipelineResponse;
  options: ContactOptionsResponse;
  loadedAt: number;
}

function movable(opportunity: Opportunity): MovableOpportunity {
  return { ...opportunity, contactName: opportunity.contact.name };
}

/**
 * Screen 24 "Cơ hội" (ADR-033): the fixed pipeline as a board or a list. Cards move by dragging
 * or with "Chuyển giai đoạn", so the keyboard and screen readers move them too.
 */
export function PipelineScreen({
  site,
  canHandle,
  initial,
  options,
  loadedAt,
}: PipelineScreenProps) {
  const queryClient = useQueryClient();
  const now = useNow(loadedAt);
  const [view, setView] = useState<PipelineView>('kanban');
  const [ownerId, setOwnerId] = useState('');
  const [showLost, setShowLost] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [dropOn, setDropOn] = useState<OpportunityStage | null>(null);

  const board = useQuery({
    queryKey: pipelineQueryKeys.board(site.id, ownerId),
    queryFn: ({ signal }) =>
      api(endpoints.pipeline, [site.id], {
        query: ownerId === '' ? {} : { ownerId },
        signal,
      }),
    initialData: ownerId === '' ? initial : undefined,
    initialDataUpdatedAt: loadedAt,
    placeholderData: keepPreviousData,
  });
  const data = board.data ?? initial;

  function refresh() {
    void queryClient.invalidateQueries({ queryKey: pipelineQueryKeys.all(site.id) });
    void queryClient.invalidateQueries({ queryKey: contactQueryKeys.all(site.id) });
  }

  const stageMove = useStageMove({ siteId: site.id, onMoved: refresh });
  const column = (stage: OpportunityStage): PipelineColumn =>
    data.columns.find((item) => item.stage === stage) ?? { stage, count: 0, total: 0, items: [] };
  const lost = column('lost');
  const shown = opportunityStages.filter((stage) => stage !== 'lost' || showLost);

  function cardOf(id: string): Opportunity | undefined {
    return data.columns.flatMap((item) => item.items).find((item) => item.id === id);
  }

  function onDrop(event: DragEvent<HTMLElement>, stage: OpportunityStage) {
    event.preventDefault();
    setDropOn(null);
    const card = cardOf(event.dataTransfer.getData(DRAG_TYPE));
    if (card !== undefined) {
      stageMove.moveTo(
        movable(card),
        card.stage === 'won' || card.stage === 'lost' ? 'visited' : stage,
      );
    }
  }

  return (
    <PageContainer>
      <div className={styles.page}>
        <header className={styles.header}>
          <div>
            <h1 className={styles.title}>Cơ hội</h1>
            <p className={styles.summary}>{summaryLine(data.summary)}</p>
          </div>
          <div className={styles.controls}>
            <SegmentedControl<PipelineView>
              aria-label="Kiểu xem"
              options={[
                { value: 'kanban', label: 'Kanban' },
                { value: 'list', label: 'Danh sách' },
              ]}
              value={view}
              onChange={setView}
            />
            <Select
              aria-label="Người phụ trách"
              className={styles.ownerFilter}
              value={ownerId}
              onChange={(event) => {
                setOwnerId(event.target.value);
              }}
            >
              <option value="">Mọi người phụ trách</option>
              {options.assignees.map((person) => (
                <option key={person.id} value={person.id}>
                  {person.name}
                </option>
              ))}
            </Select>
            {canHandle ? (
              <Button
                leadingIcon={<PlusIcon size={16} />}
                onClick={() => {
                  setCreateOpen(true);
                }}
              >
                Tạo cơ hội
              </Button>
            ) : null}
          </div>
        </header>

        {view === 'kanban' ? (
          <>
            <div className={styles.boardScroll}>
              <div className={styles.board}>
                {shown.map((stage) => {
                  const current = column(stage);
                  return (
                    <section
                      key={stage}
                      aria-label={`${opportunityStageLabels[stage]}, ${current.count} cơ hội`}
                      className={cx(styles.column, dropOn === stage && styles.dropTarget)}
                      onDragOver={
                        canHandle
                          ? (event) => {
                              if (event.dataTransfer.types.includes(DRAG_TYPE)) {
                                event.preventDefault();
                                setDropOn(stage);
                              }
                            }
                          : undefined
                      }
                      onDragLeave={() => {
                        setDropOn((value) => (value === stage ? null : value));
                      }}
                      onDrop={
                        canHandle
                          ? (event) => {
                              onDrop(event, stage);
                            }
                          : undefined
                      }
                    >
                      <div className={styles.columnHead}>
                        <span className={styles.columnName}>
                          <span className={styles[`stage-${stage}`]}>
                            <span aria-hidden="true" className={styles.dot} />
                          </span>
                          {opportunityStageLabels[stage]}
                          <span className={styles.columnCount}>{current.count}</span>
                        </span>
                        <span className={styles.columnTotal}>{formatVnd(current.total)}</span>
                      </div>
                      {current.items.length === 0 ? (
                        <p className={styles.emptyColumn}>Chưa có cơ hội.</p>
                      ) : null}
                      {current.items.map((card) => (
                        <OpportunityCard
                          key={card.id}
                          siteId={site.id}
                          card={card}
                          now={now}
                          canHandle={canHandle}
                          pending={stageMove.pending}
                          onMove={(target) => {
                            stageMove.moveTo(movable(card), target);
                          }}
                        />
                      ))}
                    </section>
                  );
                })}
                <Button
                  variant="secondary"
                  size="sm"
                  className={styles.lostToggle}
                  aria-expanded={showLost}
                  onClick={() => {
                    setShowLost((value) => !value);
                  }}
                >
                  {showLost ? 'Thu gọn Thua' : `Thua · ${lost.count}`}
                </Button>
              </div>
            </div>
            <p className={styles.hint}>
              Kéo thẻ để đổi giai đoạn, hoặc dùng nút trên thẻ. Thẻ viền đỏ có việc quá hạn.
            </p>
          </>
        ) : (
          <PipelineList
            siteId={site.id}
            data={data}
            now={now}
            canHandle={canHandle}
            onMove={(card, target) => {
              stageMove.moveTo(movable(card), target);
            }}
          />
        )}
      </div>
      {stageMove.dialogs}
      {canHandle ? (
        <CreateOpportunityDialog
          siteId={site.id}
          open={createOpen}
          onOpenChange={setCreateOpen}
          onCreated={() => {
            setCreateOpen(false);
            refresh();
          }}
        />
      ) : null}
    </PageContainer>
  );
}

interface OpportunityCardProps {
  siteId: string;
  card: Opportunity;
  now: number;
  canHandle: boolean;
  pending: boolean;
  onMove: (stage: OpportunityStage) => void;
}

function OpportunityCard({ siteId, card, now, canHandle, pending, onMove }: OpportunityCardProps) {
  const [dragging, setDragging] = useState(false);
  const late = isLate(card, now);
  const value = cardValue(card);
  const closed = card.stage === 'won' || card.stage === 'lost';
  return (
    <article
      className={cx(styles.card, late && styles.late)}
      draggable={canHandle}
      data-dragging={dragging ? 'true' : undefined}
      onDragStart={(event) => {
        event.dataTransfer.setData(DRAG_TYPE, card.id);
        event.dataTransfer.effectAllowed = 'move';
        setDragging(true);
      }}
      onDragEnd={() => {
        setDragging(false);
      }}
    >
      <Link href={contactHref(siteId, card.contact.id)} className={styles.cardLink}>
        <span className={styles.cardTitle}>{card.title}</span>
        <span className={styles.cardWho}>{card.contact.name}</span>
      </Link>
      <span className={styles.cardValueRow}>
        <span className={styles.money}>{value === null ? '—' : formatVnd(value)}</span>
        {card.owner === null ? null : (
          <span className={styles.ownerBadge} aria-label={`Phụ trách: ${card.owner.name}`}>
            {profileInitials(card.owner.name)}
          </span>
        )}
      </span>
      <span
        className={cx(styles.next, late && styles.nextLate, card.stage === 'won' && styles.nextWon)}
      >
        {nextLine(card, now)}
      </span>
      {canHandle ? (
        closed ? (
          <Button
            size="sm"
            variant="secondary"
            className={styles.moveButton}
            disabled={pending}
            onClick={() => {
              onMove('visited');
            }}
          >
            Mở lại
          </Button>
        ) : (
          <DropdownMenu
            align="start"
            trigger={
              <Button
                size="sm"
                variant="secondary"
                className={styles.moveButton}
                trailingIcon={<ChevronDownIcon size={14} />}
              >
                Chuyển giai đoạn
                <VisuallyHidden> “{card.title}”</VisuallyHidden>
              </Button>
            }
          >
            {movesFrom(card.stage).map((stage) => (
              <DropdownMenuItem
                key={stage}
                tone={stage === 'lost' ? 'danger' : 'default'}
                onSelect={() => {
                  onMove(stage);
                }}
              >
                {stage === 'won'
                  ? 'Đánh dấu thắng…'
                  : stage === 'lost'
                    ? 'Đánh dấu thua…'
                    : opportunityStageLabels[stage]}
              </DropdownMenuItem>
            ))}
          </DropdownMenu>
        )
      ) : null}
    </article>
  );
}

interface PipelineListProps {
  siteId: string;
  data: PipelineResponse;
  now: number;
  canHandle: boolean;
  onMove: (card: Opportunity, stage: OpportunityStage) => void;
}

/** "Danh sách": one row per card, its stage changed in place. */
function PipelineList({ siteId, data, now, canHandle, onMove }: PipelineListProps) {
  const rows = data.columns.flatMap((column) => column.items);
  return (
    <section aria-label="Danh sách cơ hội" className={styles.listCard}>
      <div className={styles.tableScroll}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th scope="col">Cơ hội</th>
              <th scope="col">Khách hàng</th>
              <th scope="col">Giai đoạn</th>
              <th scope="col">Giá trị</th>
              <th scope="col">Phụ trách</th>
              <th scope="col">Việc tiếp theo</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((card) => {
              const value = cardValue(card);
              const late = isLate(card, now);
              return (
                <tr key={card.id}>
                  <td className={styles.rowTitle}>{card.title}</td>
                  <td>
                    <Link href={contactHref(siteId, card.contact.id)} className={styles.rowLink}>
                      {card.contact.name}
                    </Link>
                  </td>
                  <td>
                    {canHandle ? (
                      <Select
                        aria-label={`Giai đoạn của ${card.title}`}
                        className={styles.stageSelect}
                        value={card.stage}
                        onChange={(event) => {
                          const stage = opportunityStageSchema.safeParse(event.target.value);
                          if (stage.success) {
                            const closed = card.stage === 'won' || card.stage === 'lost';
                            // A closed card reopens before it moves on.
                            onMove(
                              card,
                              closed && stage.data !== card.stage ? 'visited' : stage.data,
                            );
                          }
                        }}
                      >
                        {opportunityStages.map((stage) => (
                          <option key={stage} value={stage}>
                            {opportunityStageLabels[stage]}
                          </option>
                        ))}
                      </Select>
                    ) : (
                      <StageMark stage={card.stage} />
                    )}
                  </td>
                  <td className={styles.money}>{value === null ? '—' : formatVnd(value)}</td>
                  <td>{card.owner?.name ?? 'Chưa giao'}</td>
                  <td className={cx(styles.next, late && styles.nextLate)}>
                    {nextLine(card, now)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
