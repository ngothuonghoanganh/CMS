'use client';

import {
  CUSTOM_DOMAINS_MAX,
  type Domain,
  type DomainListResponse,
  domainStatusLabels,
  endpoints,
  type Site,
} from '@plp/contracts';
import {
  Badge,
  Button,
  ButtonLink,
  Callout,
  Card,
  ConfirmDialog,
  GlobeIcon,
  IconButton,
  PlusIcon,
  TrashIcon,
  useToast,
} from '@plp/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { api } from '../../lib/api';
import { formatDate, formatRelativeTime } from '../../lib/format';
import { siteHref } from '../shell/navigation';
import { PageContainer, PageHeader } from '../shell/PageHeader';
import { problemMessage, reportUnexpected } from '../shell/problem-message';
import { useNow } from '../shell/use-now';
import { siteQueryKeys } from '../dashboard/queries';
import { CopyAddressButton } from './CopyAddressButton';
import { httpsLine, statusLegend, statusTones } from './domain-presentation';
import { domainQueryKeys } from './queries';
import styles from './Domains.module.css';

export interface DomainsScreenProps {
  site: Site;
  initial: DomainListResponse;
  loadedAt: number;
}

/** Board 14 for a domain, to fix or finish it. */
export function connectHref(siteId: string, domainId?: string): string {
  const base = `${siteHref(siteId)}/domain/connect`;
  return domainId === undefined ? base : `${base}?domain=${encodeURIComponent(domainId)}`;
}

type Pending =
  { kind: 'primary'; domain: Domain | null; host: string } | { kind: 'remove'; domain: Domain };

/**
 * Board 13 "Tên miền": the site's default address and custom domains, where each stands, which one
 * is primary, and how to fix one that broke (ADR-022).
 */
export function DomainsScreen({ site, initial, loadedAt }: DomainsScreenProps) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const now = useNow(loadedAt);
  const list = useQuery({
    queryKey: domainQueryKeys.list(site.id),
    queryFn: ({ signal }) => api(endpoints.listDomains, [site.id], { signal }),
    initialData: initial,
    initialDataUpdatedAt: loadedAt,
  }).data;
  const [pending, setPending] = useState<Pending | null>(null);

  function refresh(next?: DomainListResponse) {
    if (next !== undefined) {
      queryClient.setQueryData(domainQueryKeys.list(site.id), next);
    }
    void queryClient.invalidateQueries({ queryKey: domainQueryKeys.list(site.id) });
    // Live addresses of the pages, and the site's address in the sidebar, follow the primary one.
    void queryClient.invalidateQueries({ queryKey: siteQueryKeys.pages(site.id) });
    router.refresh();
  }

  const setPrimary = useMutation({
    mutationFn: (domainId: string | null) =>
      api(endpoints.setPrimaryDomain, [site.id], { body: { domainId } }),
    onSuccess: (next, domainId) => {
      setPending(null);
      refresh(next);
      const host =
        domainId === null
          ? next.defaultHost
          : (next.items.find((item) => item.id === domainId)?.hostname ?? '');
      toast({ tone: 'success', title: `${host} là địa chỉ chính` });
    },
    onError: (error) => {
      reportUnexpected('Setting the primary domain failed', error);
    },
  });
  const remove = useMutation({
    mutationFn: (domainId: string) => api(endpoints.removeDomain, [site.id, domainId]),
    onSuccess: () => {
      const host = pending?.kind === 'remove' ? pending.domain.hostname : '';
      setPending(null);
      refresh();
      toast({ tone: 'success', title: `Đã ngắt kết nối ${host}` });
    },
    onError: (error) => {
      reportUnexpected('Removing a domain failed', error);
    },
  });

  const primary = list.items.find((item) => item.primary) ?? null;
  const lostPrimary = primary !== null && primary.status === 'lost' ? primary : null;
  const latestCheck = list.items
    .map((item) => item.checkedAt)
    .filter((at): at is string => at !== null)
    .sort()
    .at(-1);
  const full = list.items.length >= CUSTOM_DOMAINS_MAX;
  const primaryHost = primary?.hostname ?? list.defaultHost;

  return (
    <PageContainer width="wide">
      <PageHeader
        title="Tên miền"
        description={`Các địa chỉ khách dùng để mở trang đã xuất bản của ${site.name}.`}
        actions={
          full ? (
            <span className={styles.full}>
              Đã có {CUSTOM_DOMAINS_MAX} tên miền riêng, tối đa của một site
            </span>
          ) : (
            <ButtonLink as={Link} href={connectHref(site.id)} leadingIcon={<PlusIcon size={16} />}>
              Kết nối tên miền riêng
            </ButtonLink>
          )
        }
      />

      {lostPrimary === null ? null : (
        <Callout
          tone="danger"
          role="alert"
          title={`Địa chỉ chính ${lostPrimary.hostname} đang không truy cập được`}
          action={
            <>
              <ButtonLink
                as={Link}
                href={connectHref(site.id, lostPrimary.id)}
                variant="secondary"
                size="sm"
              >
                Xem cách sửa
              </ButtonLink>
              <Button
                variant="secondary"
                size="sm"
                loading={setPrimary.isPending}
                onClick={() => {
                  setPrimary.mutate(null);
                }}
              >
                Tạm dùng địa chỉ mặc định
              </Button>
            </>
          }
        >
          Bản ghi DNS không còn trỏ tới hệ thống
          {lostPrimary.lostSince === null
            ? ''
            : ` từ ${formatRelativeTime(lostPrimary.lostSince, now)}`}
          . Khách mở link quảng cáo sẽ gặp lỗi. Các trang vẫn mở được qua{' '}
          <span className={styles.mono}>{list.defaultHost}</span>.
        </Callout>
      )}

      <div className={styles.columns}>
        <Card as="section" padding="none" aria-labelledby="domains-heading">
          <div className={styles.listHead}>
            <h2 id="domains-heading" className={styles.heading}>
              {list.items.length + 1} địa chỉ
            </h2>
            <span className={styles.muted}>
              Tự kiểm tra mỗi 10 phút
              {latestCheck === undefined
                ? ''
                : ` · Kiểm tra lần cuối ${formatRelativeTime(latestCheck, now)}`}
            </span>
          </div>
          <ul className={styles.rows}>
            {list.items.map((domain) => (
              <li key={domain.id} className={styles.row}>
                <div className={styles.rowMain}>
                  <div className={styles.hostLine}>
                    <span className={styles.host}>{domain.hostname}</span>
                    {domain.primary ? (
                      <Badge tone="primary" size="sm">
                        ĐỊA CHỈ CHÍNH
                      </Badge>
                    ) : null}
                  </div>
                  <span className={styles.note}>
                    {domain.primary || primary === null || domain.status !== 'active'
                      ? `Thêm ngày ${formatDate(domain.createdAt)} bởi ${domain.addedBy.name}`
                      : `Đang chuyển hướng → ${primaryHost}`}
                  </span>
                </div>
                <div className={styles.rowStatus}>
                  <Badge tone={statusTones[domain.status]} dot>
                    {domainStatusLabels[domain.status]}
                  </Badge>
                  <span className={styles.note}>{httpsLine(domain)}</span>
                </div>
                <div className={styles.rowActions}>
                  {domain.status === 'active' ? null : (
                    <ButtonLink
                      as={Link}
                      href={connectHref(site.id, domain.id)}
                      variant="secondary"
                      size="sm"
                      aria-label={`Sửa cấu hình ${domain.hostname}`}
                    >
                      Sửa cấu hình
                    </ButtonLink>
                  )}
                  {domain.status === 'active' && !domain.primary ? (
                    <Button
                      variant="secondary"
                      size="sm"
                      aria-label={`Đặt ${domain.hostname} làm địa chỉ chính`}
                      onClick={() => {
                        setPending({ kind: 'primary', domain, host: domain.hostname });
                      }}
                    >
                      Đặt làm chính
                    </Button>
                  ) : null}
                  {domain.primary ? null : (
                    <IconButton
                      aria-label={`Ngắt kết nối ${domain.hostname}`}
                      tooltip="Ngắt kết nối"
                      variant="ghost"
                      icon={<TrashIcon size={18} />}
                      onClick={() => {
                        setPending({ kind: 'remove', domain });
                      }}
                    />
                  )}
                </div>
              </li>
            ))}
            <li className={styles.row}>
              <div className={styles.rowMain}>
                <div className={styles.hostLine}>
                  <span className={styles.host}>{list.defaultHost}</span>
                  {primary === null ? (
                    <Badge tone="primary" size="sm">
                      ĐỊA CHỈ CHÍNH
                    </Badge>
                  ) : null}
                  <Badge tone="neutral" size="sm">
                    MẶC ĐỊNH
                  </Badge>
                </div>
                <span className={styles.note}>
                  {primary === null || primary.status !== 'active'
                    ? 'Có sẵn khi tạo site, luôn hoạt động.'
                    : `Đang chuyển hướng → ${primaryHost}`}
                </span>
              </div>
              <div className={styles.rowStatus}>
                <Badge tone="success" dot>
                  Hoạt động
                </Badge>
                <span className={styles.note}>HTTPS tự động</span>
              </div>
              <div className={styles.rowActions}>
                {primary === null ? null : (
                  <Button
                    variant="secondary"
                    size="sm"
                    aria-label={`Đặt ${list.defaultHost} làm địa chỉ chính`}
                    onClick={() => {
                      setPending({ kind: 'primary', domain: null, host: list.defaultHost });
                    }}
                  >
                    Đặt làm chính
                  </Button>
                )}
                <CopyAddressButton url={site.defaultOrigin} host={list.defaultHost} />
              </div>
            </li>
          </ul>
          {list.items.length === 0 ? (
            <div className={styles.empty}>
              <span className={styles.emptyIcon} aria-hidden="true">
                <GlobeIcon size={24} />
              </span>
              <h3 className={styles.emptyTitle}>Chưa có tên miền riêng</h3>
              <p className={styles.muted}>
                Trang của bạn đang chạy ở địa chỉ mặc định. Dùng tên miền riêng như{' '}
                <span className={styles.mono}>go.tenmien.vn</span> để khách tin tưởng hơn khi bấm
                quảng cáo. Mất khoảng 10 phút nếu bạn có quyền vào trang quản lý tên miền.
              </p>
            </div>
          ) : null}
        </Card>

        <aside aria-labelledby="legend-heading" className={styles.legend}>
          <h2 id="legend-heading" className={styles.heading}>
            Trạng thái nghĩa là gì
          </h2>
          <dl className={styles.legendList}>
            {statusLegend.map((entry) => (
              <div key={entry.status} className={styles.legendItem}>
                <dt>
                  <Badge tone={statusTones[entry.status]} dot size="sm">
                    {entry.label}
                  </Badge>
                </dt>
                <dd>{entry.description}</dd>
              </div>
            ))}
          </dl>
          <p className={styles.muted}>
            Chỉ Chủ sở hữu và Quản trị được kết nối, đổi địa chỉ chính hoặc ngắt tên miền.
          </p>
        </aside>
      </div>

      <ConfirmDialog
        open={pending?.kind === 'primary'}
        onOpenChange={(open) => {
          if (!open) {
            setPending(null);
          }
        }}
        title={`Đặt ${pending?.kind === 'primary' ? pending.host : ''} làm địa chỉ chính?`}
        description="Thay đổi có hiệu lực ngay cho mọi trang đang live, không cần xuất bản lại."
        confirmLabel={`Đặt ${pending?.kind === 'primary' ? pending.host : ''} làm địa chỉ chính`}
        pending={setPrimary.isPending}
        error={setPrimary.isError ? problemMessage(setPrimary.error) : undefined}
        onConfirm={() => {
          if (pending?.kind === 'primary') {
            setPrimary.mutate(pending.domain?.id ?? null);
          }
        }}
      >
        <ul className={styles.consequences}>
          <li>Các trang đang live có địa chỉ mới; các địa chỉ khác tự chuyển hướng 301 về đây.</li>
          <li>Sitemap và thẻ canonical được cập nhật. Google có thể mất vài ngày để cập nhật.</li>
          <li>
            Kiểm tra lại link trong quảng cáo Facebook, TikTok để tránh một lần chuyển hướng thừa.
          </li>
        </ul>
      </ConfirmDialog>
      <ConfirmDialog
        open={pending?.kind === 'remove'}
        onOpenChange={(open) => {
          if (!open) {
            setPending(null);
          }
        }}
        tone="danger"
        title={`Ngắt kết nối ${pending?.kind === 'remove' ? pending.domain.hostname : ''}?`}
        description="Khách mở địa chỉ này sẽ không còn thấy trang của bạn. Trang, bản nháp và lead không bị xóa."
        confirmLabel="Ngắt kết nối"
        pending={remove.isPending}
        error={remove.isError ? problemMessage(remove.error) : undefined}
        onConfirm={() => {
          if (pending?.kind === 'remove') {
            remove.mutate(pending.domain.id);
          }
        }}
      >
        <p className={styles.muted}>
          Bạn nên xóa bản ghi CNAME hoặc A của tên miền tại nhà cung cấp sau khi ngắt.
        </p>
      </ConfirmDialog>
    </PageContainer>
  );
}
