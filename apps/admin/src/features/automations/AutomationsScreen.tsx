'use client';

import {
  type Access,
  type AutomationListItem,
  type AutomationListResponse,
  type AutomationRecipe,
  automationRecipeLabels,
  automationRecipes,
  can,
  endpoints,
  type Site,
} from '@plp/contracts';
import {
  Badge,
  BoltIcon,
  Callout,
  DropdownMenu,
  DropdownMenuItem,
  IconButton,
  MoreHorizontalIcon,
  useToast,
} from '@plp/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { api } from '../../lib/api';
import { formatDateTime } from '../../lib/format';
import { PageContainer, PageHeader } from '../shell/PageHeader';
import { problemMessage, reportUnexpected } from '../shell/problem-message';
import { useNow } from '../shell/use-now';
import {
  createdLine,
  last30DaysLabel,
  lastRunLabel,
  quotaNotice,
  stateBadge,
  triggerLabel,
  usageLine,
} from './automation-presentation';
import { automationQueryKeys } from './queries';
import styles from './Automations.module.css';

export interface AutomationsScreenProps {
  site: Site;
  role: Access;
  roleLabel: string;
  initial: AutomationListResponse;
  loadedAt: number;
}

/**
 * Screen 25 "Automation" (ADR-034): what runs on its own at the site's events. Recipes start
 * drafts; a draft runs once it is enabled.
 */
export function AutomationsScreen({
  site,
  role,
  roleLabel,
  initial,
  loadedAt,
}: AutomationsScreenProps) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const now = useNow(loadedAt);
  const canManage = can(role, 'automations.manage');
  const listKey = automationQueryKeys.list(site.id);

  const list = useQuery({
    queryKey: listKey,
    queryFn: ({ signal }) => api(endpoints.listAutomations, [site.id], { signal }),
    initialData: initial,
    initialDataUpdatedAt: loadedAt,
  });

  function adopt(item: AutomationListItem) {
    queryClient.setQueryData<AutomationListResponse>(listKey, (current) => {
      if (current === undefined) {
        return current;
      }
      const known = current.items.some((other) => other.id === item.id);
      return {
        ...current,
        items: known
          ? current.items.map((other) => (other.id === item.id ? item : other))
          : [...current.items, item],
      };
    });
  }

  const create = useMutation({
    mutationFn: (recipe: AutomationRecipe) =>
      api(endpoints.createAutomation, [site.id], { body: { recipe } }),
    onSuccess: (item) => {
      adopt(item);
      toast({
        tone: 'success',
        title: `Đã tạo bản nháp “${item.name}”`,
        description: 'Bật automation để nó chạy với sự kiện mới.',
      });
    },
    onError: (error) => {
      reportUnexpected('Creating an automation failed', error);
      toast({ tone: 'danger', title: 'Chưa tạo được', description: problemMessage(error) });
    },
  });

  // Set in the click itself, so the controlled switch never flips back while the request runs.
  const [switching, setSwitching] = useState<{ id: string; on: boolean } | null>(null);
  const setState = useMutation({
    mutationFn: ({ id, on }: { id: string; on: boolean }) =>
      api(endpoints.setAutomationState, [site.id, id], {
        body: { state: on ? 'on' : 'paused' },
      }),
    onSuccess: (item) => {
      adopt(item);
      toast({
        tone: 'success',
        title: item.state === 'on' ? `Đã bật “${item.name}”` : `Đã tạm dừng “${item.name}”`,
      });
    },
    onSettled: () => {
      setSwitching(null);
    },
    onError: (error) => {
      reportUnexpected('Changing an automation failed', error);
      toast({ tone: 'danger', title: 'Chưa đổi được', description: problemMessage(error) });
    },
  });

  const duplicate = useMutation({
    mutationFn: (id: string) => api(endpoints.duplicateAutomation, [site.id, id]),
    onSuccess: (item) => {
      adopt(item);
      toast({ tone: 'success', title: `Đã nhân bản thành “${item.name}”` });
    },
    onError: (error) => {
      reportUnexpected('Copying an automation failed', error);
      toast({ tone: 'danger', title: 'Chưa nhân bản được', description: problemMessage(error) });
    },
  });

  const { items, usage } = list.data;
  const notice = quotaNotice(usage);

  return (
    <PageContainer>
      <PageHeader
        title="Automation"
        description={`Tự giao lead, nhắc việc và báo tin khi có sự kiện ở ${site.name}.`}
        actions={<span className={styles.usage}>{usageLine(usage)}</span>}
      />
      {notice === null ? null : (
        <Callout tone="warning" role="status" title={notice}>
          Sự kiện mới không chạy cho tới tháng sau; không cần bật lại.
        </Callout>
      )}
      {canManage ? (
        <section aria-labelledby="recipes-title">
          <h2 id="recipes-title" className={styles.recipesTitle}>
            Bắt đầu từ mẫu
          </h2>
          <div className={styles.recipes}>
            {automationRecipes.map((recipe) => (
              <button
                key={recipe}
                type="button"
                className={styles.recipe}
                disabled={create.isPending}
                onClick={() => {
                  create.mutate(recipe);
                }}
              >
                <span className={styles.recipeName}>
                  <BoltIcon size={16} className={styles.recipeIcon} />
                  {automationRecipeLabels[recipe].name}
                </span>
                <span className={styles.recipeText}>
                  {automationRecipeLabels[recipe].description}
                </span>
              </button>
            ))}
          </div>
        </section>
      ) : (
        <Callout tone="info" role="note">
          Bạn đang xem với vai trò {roleLabel}. Bật, tạm dừng hay sửa automation cần quyền Quản trị.
        </Callout>
      )}
      <section aria-label="Automation của site" className={styles.listCard}>
        {items.length === 0 ? (
          <p className={styles.empty}>
            Chưa có automation nào. Chọn một mẫu ở trên, mọi automation đều bắt đầu ở trạng thái bản
            nháp và chỉ chạy khi bạn bật.
          </p>
        ) : (
          <div className={styles.tableScroll}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th scope="col">TÊN</th>
                  <th scope="col">KHI NÀO CHẠY</th>
                  <th scope="col">TRẠNG THÁI</th>
                  <th scope="col">LẦN CHẠY GẦN NHẤT</th>
                  <th scope="col">30 NGÀY</th>
                  <th scope="col">BẬT</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => {
                  const badge = stateBadge(item);
                  const on = switching?.id === item.id ? switching.on : item.state === 'on';
                  const blocked = !canManage || (item.state !== 'on' && item.missing > 0);
                  return (
                    <tr key={item.id}>
                      <td>
                        <span className={styles.nameCell}>
                          <span className={styles.name}>{item.name}</span>
                          <span className={styles.by}>{createdLine(item)}</span>
                        </span>
                      </td>
                      <td className={styles.muted}>{triggerLabel(item.trigger)}</td>
                      <td>
                        <Badge tone={badge.tone} dot>
                          {badge.label}
                        </Badge>
                      </td>
                      <td>
                        {item.lastRun === null ? (
                          <span className={styles.muted}>{lastRunLabel(item, now)}</span>
                        ) : (
                          <time
                            dateTime={item.lastRun.at}
                            title={formatDateTime(item.lastRun.at)}
                            className={
                              item.lastRun.status === 'failed' ? styles.failed : styles.muted
                            }
                          >
                            {lastRunLabel(item, now)}
                          </time>
                        )}
                      </td>
                      <td className={styles.muted}>{last30DaysLabel(item)}</td>
                      <td>
                        <span className={styles.toggleCell}>
                          <label
                            className={styles.switch}
                            title={
                              item.state !== 'on' && item.missing > 0
                                ? `Còn ${item.missing} bước thiếu cấu hình`
                                : undefined
                            }
                          >
                            <input
                              type="checkbox"
                              role="switch"
                              aria-label={`Bật ${item.name}`}
                              checked={on}
                              disabled={blocked || switching !== null}
                              onChange={(event) => {
                                const next = { id: item.id, on: event.target.checked };
                                setSwitching(next);
                                setState.mutate(next);
                              }}
                            />
                          </label>
                          {canManage ? (
                            <DropdownMenu
                              align="end"
                              trigger={
                                <IconButton
                                  size="sm"
                                  aria-label={`Thao tác với ${item.name}`}
                                  icon={<MoreHorizontalIcon size={16} />}
                                />
                              }
                            >
                              <DropdownMenuItem
                                onSelect={() => {
                                  duplicate.mutate(item.id);
                                }}
                              >
                                Nhân bản
                              </DropdownMenuItem>
                            </DropdownMenu>
                          ) : null}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </PageContainer>
  );
}
