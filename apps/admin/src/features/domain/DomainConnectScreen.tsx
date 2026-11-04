'use client';

import {
  apexOf,
  type Domain,
  domainKind,
  endpoints,
  normalizeHostname,
  relativeRecordName,
  type Site,
} from '@plp/contracts';
import {
  Button,
  ButtonLink,
  Callout,
  Card,
  CheckIcon,
  ChevronRightIcon,
  CopyIcon,
  Field,
  IconButton,
  Input,
  RadioCardGroup,
  useToast,
} from '@plp/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { type SubmitEvent, useState } from 'react';
import { ApiError, api } from '../../lib/api';
import { formatRelativeTime } from '../../lib/format';
import { siteHref } from '../shell/navigation';
import { PageContainer } from '../shell/PageHeader';
import { problemMessage, reportUnexpected } from '../shell/problem-message';
import { ScrollRegion } from '../shell/ScrollRegion';
import { useNow } from '../shell/use-now';
import { connectHeading, connectStep, recordStateLabels, statusBox } from './domain-presentation';
import { connectHref } from './DomainsScreen';
import { domainQueryKeys } from './queries';
import { type DomainAvailabilityState, useDomainAvailability } from './use-domain-availability';
import styles from './Domains.module.css';

export interface DomainConnectScreenProps {
  site: Site;
  /** The domain being connected; null before it is added. */
  initialDomain: Domain | null;
  /** The base domain of default addresses, refused as a custom domain. */
  baseDomain: string;
  loadedAt: number;
}

const STEPS = [
  'Nhập tên miền',
  'Thêm bản ghi DNS',
  'Xác minh quyền sở hữu',
  'Cấp chứng chỉ HTTPS',
  'Hoạt động',
] as const;

function stepSubtitle(step: number, domain: Domain | null): string {
  switch (step) {
    case 0:
      return domain?.hostname ?? 'Tên miền mới';
    case 1:
      return domain === null || domain.kind === 'subdomain' ? 'CNAME và TXT' : 'A và TXT';
    case 2:
      return 'Tự động qua bản ghi TXT';
    case 3:
      return 'Thường dưới 10 phút';
    default:
      return 'Chọn có đặt làm địa chỉ chính';
  }
}

/** Copies one value of the records table and says so. */
function CopyButton({ value, label }: { value: string; label: string }) {
  const { toast } = useToast();
  return (
    <IconButton
      aria-label={label}
      size="sm"
      variant="secondary"
      className={styles.copy}
      icon={<CopyIcon size={14} />}
      onClick={() => {
        navigator.clipboard.writeText(value).then(
          () => {
            toast({ tone: 'success', title: 'Đã sao chép', description: value });
          },
          (error: unknown) => {
            console.error('Copying a DNS value failed', error);
            toast({
              tone: 'danger',
              title: 'Chưa sao chép được',
              description: 'Hãy chọn giá trị rồi sao chép thủ công.',
            });
          },
        );
      }}
    />
  );
}

/** What the check of a typed domain says in the live region under the field. */
function availabilityNote(state: DomainAvailabilityState): string {
  switch (state.kind) {
    case 'checking':
      return 'Đang kiểm tra tên miền…';
    case 'available':
      return 'Chưa site nào dùng tên miền này.';
    case 'failed':
      return 'Chưa kiểm tra được tên miền. Bạn vẫn có thể bấm Tiếp tục.';
    default:
      return '';
  }
}

/** A problem the check found that adding the domain would refuse too. */
function availabilityError(state: DomainAvailabilityState): string | undefined {
  switch (state.kind) {
    case 'already_added':
      return 'Site này đã có tên miền này';
    case 'invalid':
      return state.reason;
    default:
      return undefined;
  }
}

function HostnameForm({
  site,
  baseDomain,
  onAdded,
}: {
  site: Site;
  baseDomain: string;
  onAdded: (domain: Domain) => void;
}) {
  const [value, setValue] = useState('');
  const [problem, setProblem] = useState<{ message: string; suggestion: string | null } | null>(
    null,
  );
  const availability = useDomainAvailability(site.id, value, baseDomain);
  const taken = availability.kind === 'taken';
  const refused = availabilityError(availability);
  const add = useMutation({
    mutationFn: (hostname: string) => api(endpoints.addDomain, [site.id], { body: { hostname } }),
    onSuccess: onAdded,
    onError: (error) => {
      reportUnexpected('Adding a domain failed', error);
      const field = error instanceof ApiError ? error.fieldErrors()['hostname'] : undefined;
      setProblem({ message: field ?? problemMessage(error), suggestion: null });
    },
  });
  const checked = value.trim() === '' ? null : normalizeHostname(value, baseDomain);

  function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    const result = normalizeHostname(value, baseDomain);
    if (!result.ok) {
      setProblem({ message: result.message, suggestion: result.suggestion });
      return;
    }
    setProblem(null);
    add.mutate(result.hostname);
  }

  return (
    <form className={styles.form} onSubmit={submit} noValidate>
      <Field
        label="Tên miền"
        id="domain-hostname"
        help={
          problem === null && refused === undefined
            ? 'Ví dụ go.tenmien.vn. Nên dùng tên miền phụ cho landing page để không ảnh hưởng website chính.'
            : undefined
        }
        error={problem?.message ?? refused}
        announceMessages
      >
        <Input
          type="text"
          inputMode="url"
          autoComplete="off"
          spellCheck={false}
          placeholder="go.tenmien.vn"
          value={value}
          onChange={(event) => {
            setValue(event.target.value);
            setProblem(null);
          }}
        />
      </Field>
      {problem?.suggestion ? (
        <Button
          variant="secondary"
          size="sm"
          className={styles.suggestion}
          onClick={() => {
            setValue(problem.suggestion ?? '');
            setProblem(null);
          }}
        >
          Dùng {problem.suggestion}
        </Button>
      ) : null}
      {/* One persistent live region: what the check says is announced as it changes. */}
      <p className={styles.availability} role="status">
        {problem === null ? availabilityNote(availability) : ''}
      </p>
      {taken ? (
        <Callout tone="warning" role="alert" title="Tên miền này đang được một site khác dùng">
          Vì lý do bảo mật, chúng tôi không cho biết site đó thuộc ai. Nếu bạn sở hữu tên miền, hãy
          thêm bản ghi TXT ở bước sau. Sau khi xác minh, tên miền chuyển về site này và site kia
          ngừng dùng nó.
        </Callout>
      ) : null}
      {checked?.ok === true && !taken && refused === undefined ? (
        <Callout tone={availability.kind === 'available' ? 'success' : 'info'}>
          {domainKind(checked.hostname) === 'subdomain' ? (
            <>
              <strong>Tên miền phụ</strong> của {apexOf(checked.hostname)}. Bạn chỉ cần thêm một bản
              ghi CNAME và một bản ghi TXT xác minh.
            </>
          ) : (
            <>
              <strong>Tên miền gốc.</strong> Cần bản ghi A và một bản ghi TXT xác minh; website
              chính đang chạy ở tên miền này sẽ ngừng hoạt động sau khi đổi.
            </>
          )}
        </Callout>
      ) : null}
      <div>
        <Button type="submit" loading={add.isPending}>
          {taken ? 'Tiếp tục để xác minh quyền sở hữu' : 'Tiếp tục'}
        </Button>
      </div>
    </form>
  );
}

/**
 * Board 14 "Kết nối tên miền riêng": the domain, the DNS records to add with what the last check
 * saw, the steps to HTTPS, and the choice of the primary address once it is active (ADR-022).
 */
export function DomainConnectScreen({
  site,
  initialDomain,
  baseDomain,
  loadedAt,
}: DomainConnectScreenProps) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const now = useNow(loadedAt);
  const [domain, setDomain] = useState(initialDomain);
  const [makePrimary, setMakePrimary] = useState<'keep' | 'this'>('keep');

  const check = useMutation({
    mutationFn: (domainId: string) => api(endpoints.checkDomain, [site.id, domainId]),
    onSuccess: (checked) => {
      setDomain(checked);
      void queryClient.invalidateQueries({ queryKey: domainQueryKeys.list(site.id) });
    },
    onError: (error) => {
      reportUnexpected('Checking a domain failed', error);
    },
  });
  const finish = useMutation({
    mutationFn: async (target: Domain) => {
      if (makePrimary === 'this' && !target.primary) {
        await api(endpoints.setPrimaryDomain, [site.id], { body: { domainId: target.id } });
      }
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: domainQueryKeys.list(site.id) });
      if (makePrimary === 'this') {
        toast({ tone: 'success', title: `${domain?.hostname ?? ''} là địa chỉ chính` });
      }
      router.push(`${siteHref(site.id)}/domain`);
      router.refresh();
    },
    onError: (error) => {
      reportUnexpected('Finishing a domain failed', error);
    },
  });
  const list = useQuery({
    queryKey: domainQueryKeys.list(site.id),
    queryFn: ({ signal }) => api(endpoints.listDomains, [site.id], { signal }),
    enabled: domain !== null && domain.status === 'active',
  });
  const currentPrimary =
    list.data?.items.find((item) => item.primary)?.hostname ?? list.data?.defaultHost ?? null;
  const livePageCount = list.data?.livePages.count ?? 0;

  const step = domain === null ? 0 : connectStep(domain.status) - 1;
  const box = domain === null ? null : statusBox(domain);
  const routing = domain?.records.find((record) => record.type !== 'TXT');

  return (
    <PageContainer width="wide">
      <div className={styles.back}>
        <ButtonLink
          as={Link}
          href={`${siteHref(site.id)}/domain`}
          variant="ghost"
          size="sm"
          leadingIcon={<ChevronRightIcon size={16} className={styles.flip} />}
        >
          Tên miền
        </ButtonLink>
      </div>
      <header className={styles.connectHeader}>
        <h1 className={styles.title}>Kết nối tên miền riêng</h1>
        <p className={styles.muted}>
          Trang vẫn chạy ở địa chỉ mặc định trong lúc kết nối. Bạn có thể rời màn này: hệ thống tự
          kiểm tra và gửi email khi xong.
        </p>
      </header>
      <div className={styles.columns}>
        <Card as="section" aria-labelledby="step-title" className={styles.stepCard}>
          <div className={styles.stepHead}>
            <span className={styles.eyebrow}>BƯỚC {Math.min(step + 1, 5)} / 5</span>
            <h2 id="step-title" className={styles.heading}>
              {connectHeading(domain?.status ?? null)}
            </h2>
          </div>

          {domain === null ? (
            <HostnameForm
              site={site}
              baseDomain={baseDomain}
              onAdded={(added) => {
                setDomain(added);
                void queryClient.invalidateQueries({ queryKey: domainQueryKeys.list(site.id) });
                router.replace(connectHref(site.id, added.id));
              }}
            />
          ) : (
            <>
              {box === null ? null : (
                <div className={styles.statusBox} data-tone={box.tone}>
                  <div role="status" className={styles.statusText}>
                    <p className={styles.statusTitle}>{box.title}</p>
                    <p className={styles.statusBody}>{box.body}</p>
                  </div>
                  {/* Beside the status, not in it: the time changes every minute, which is not news. */}
                  {domain.checkedAt === null ? null : (
                    <p className={styles.checked}>
                      Kiểm tra lần cuối {formatRelativeTime(domain.checkedAt, now)}
                    </p>
                  )}
                  {domain.status === 'active' ? null : (
                    <div className={styles.statusAction}>
                      <Button
                        variant="secondary"
                        size="sm"
                        loading={check.isPending}
                        onClick={() => {
                          check.mutate(domain.id);
                        }}
                      >
                        Kiểm tra ngay
                      </Button>
                    </div>
                  )}
                </div>
              )}
              {check.isError ? (
                <Callout tone="danger" role="alert">
                  {problemMessage(check.error)}
                </Callout>
              ) : null}

              {domain.status === 'active' ? (
                <RadioCardGroup<'keep' | 'this'>
                  legend="Dùng làm địa chỉ chính?"
                  showLegend
                  options={[
                    {
                      value: 'keep',
                      label: domain.primary
                        ? `${domain.hostname} đang là địa chỉ chính`
                        : `Giữ ${currentPrimary ?? 'địa chỉ hiện tại'} làm địa chỉ chính`,
                      description: domain.primary
                        ? undefined
                        : `${domain.hostname} chuyển hướng về địa chỉ chính.`,
                    },
                    ...(domain.primary
                      ? []
                      : [
                          {
                            value: 'this' as const,
                            label: `Đặt ${domain.hostname} làm địa chỉ chính`,
                            description: `${livePageCount > 0 ? `${livePageCount} trang` : 'Các trang'} đang live đổi địa chỉ ngay. Link cũ tự chuyển hướng 301, sitemap và canonical được cập nhật.`,
                          },
                        ]),
                  ]}
                  value={makePrimary}
                  onChange={setMakePrimary}
                />
              ) : (
                <>
                  <ol className={styles.instructions}>
                    <li>
                      Mở trang quản lý DNS của <strong>{apexOf(domain.hostname)}</strong> tại nhà
                      cung cấp (Mắt Bão, PA Vietnam, Nhân Hòa, Cloudflare…).
                    </li>
                    <li>
                      Thêm đúng {domain.records.length} bản ghi dưới đây. Bấm biểu tượng sao chép để
                      tránh gõ sai.
                    </li>
                    <li>Lưu lại, rồi quay về đây bấm “Kiểm tra ngay”.</li>
                  </ol>
                  <div className={styles.recordsBox}>
                    <ScrollRegion label="Các bản ghi DNS cần thêm">
                      <table className={styles.records}>
                        <thead>
                          <tr>
                            <th scope="col">LOẠI</th>
                            <th scope="col">TÊN / HOST</th>
                            <th scope="col">GIÁ TRỊ</th>
                            <th scope="col">TÌNH TRẠNG</th>
                          </tr>
                        </thead>
                        <tbody>
                          {domain.records.map((record) => {
                            const name = relativeRecordName(record.name, domain.hostname);
                            return (
                              <tr key={`${record.type}-${record.value}`}>
                                <th scope="row">{record.type}</th>
                                <td>
                                  <span className={styles.recordValue}>
                                    <span className={styles.mono}>{name}</span>
                                    <CopyButton value={name} label={`Sao chép tên host ${name}`} />
                                  </span>
                                </td>
                                <td>
                                  <span className={styles.recordValue}>
                                    <span className={styles.mono}>{record.value}</span>
                                    <CopyButton
                                      value={record.value}
                                      label={`Sao chép giá trị ${record.type}`}
                                    />
                                  </span>
                                </td>
                                <td>
                                  <span className={styles.recordState} data-state={record.state}>
                                    <span className={styles.recordDot} aria-hidden="true" />
                                    {recordStateLabels[record.state]}
                                  </span>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </ScrollRegion>
                  </div>
                  {routing !== undefined && routing.state === 'wrong' ? (
                    <dl className={styles.compare}>
                      <div>
                        <dt>Đang có</dt>
                        <dd className={styles.mono}>
                          {domain.found.map((found) => `${found.type} · ${found.value}`).join(', ')}
                        </dd>
                      </div>
                      <div>
                        <dt>Cần có</dt>
                        <dd className={styles.mono}>
                          {routing.type} · {routing.value}
                        </dd>
                      </div>
                    </dl>
                  ) : null}
                  <p className={styles.muted}>
                    {domain.kind === 'apex'
                      ? 'Tên miền gốc cần bản ghi A. Nếu nhà cung cấp hỗ trợ ALIAS hoặc CNAME flattening, nên dùng cách đó.'
                      : `Ở ô Tên/Host chỉ nhập ${relativeRecordName(domain.hostname, domain.hostname)}, không nhập cả ${domain.hostname}. Một tên không thể vừa có bản ghi A vừa có CNAME.`}
                  </p>
                </>
              )}
              {domain.status === 'active' ? (
                <div>
                  <Button
                    loading={finish.isPending}
                    onClick={() => {
                      finish.mutate(domain);
                    }}
                  >
                    Xong
                  </Button>
                  {finish.isError ? (
                    <Callout tone="danger" role="alert">
                      {problemMessage(finish.error)}
                    </Callout>
                  ) : null}
                </div>
              ) : null}
            </>
          )}
        </Card>

        <aside aria-label="Tiến trình kết nối" className={styles.steps}>
          <span className={styles.host}>{domain?.hostname ?? 'Tên miền mới'}</span>
          <ol className={styles.stepList}>
            {STEPS.map((label, index) => {
              const done = index < step || domain?.status === 'active';
              const current = index === step && domain?.status !== 'active';
              return (
                <li
                  key={label}
                  className={styles.stepItem}
                  data-state={done ? 'done' : current ? 'current' : 'todo'}
                  aria-current={current ? 'step' : undefined}
                >
                  <span className={styles.stepMark} aria-hidden="true">
                    {done ? <CheckIcon size={14} strokeWidth={2.4} /> : index + 1}
                  </span>
                  <span className={styles.stack}>
                    <span className={styles.stepLabel}>
                      {label}
                      {done ? <span className={styles.srOnly}> (đã xong)</span> : null}
                    </span>
                    <span className={styles.note}>{stepSubtitle(index, domain)}</span>
                  </span>
                </li>
              );
            })}
          </ol>
        </aside>
      </div>
    </PageContainer>
  );
}
