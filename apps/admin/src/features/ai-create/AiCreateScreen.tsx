'use client';

import {
  type AiFailure,
  type AiJob,
  type AiJobEvent,
  aiJobEventSchema,
  aiLanguageIds,
  aiLanguageLabels,
  type AiSectionStatus,
  aiToneIds,
  aiToneLabels,
  type AiUsage,
  endpoints,
  pageGoalIds,
  type Site,
} from '@plp/contracts';
import {
  goalDefinitions,
  sectionOrder,
  themePresets,
  getSectionDefinition,
} from '@plp/sections/schema';
import {
  ArrowDownIcon,
  ArrowUpIcon,
  Button,
  ButtonLink,
  Callout,
  CheckIcon,
  CloseIcon,
  DropdownMenu,
  DropdownMenuItem,
  Field,
  IconButton,
  IconButtonLink,
  Input,
  PlusIcon,
  Select,
  SparklesIcon,
  Textarea,
  TrashIcon,
  VisuallyHidden,
} from '@plp/ui';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useReducer, useRef, useState } from 'react';
import { api, ApiError, streamEndpoint } from '../../lib/api';
import { hostOf } from '../../lib/site-url';
import { siteQueryKeys } from '../dashboard/queries';
import { PageSlugField } from '../onboarding/PageSlugField';
import { useSlugAvailability } from '../onboarding/use-slug-availability';
import { cx } from '../shell/cx';
import { newPageHref, pageHref, siteHref, templatesHref } from '../shell/navigation';
import { problemMessage, reportUnexpected } from '../shell/problem-message';
import {
  addBlockedReason,
  aiCreateReducer,
  type AiStep,
  aiSteps,
  type BriefErrors,
  type BriefField,
  briefErrorsOf,
  briefFieldOrder,
  buildAiJobRequest,
  canShift,
  descriptionOf,
  initialAiCreateState,
} from './ai-create-state';
import styles from './AiCreateScreen.module.css';

/** TanStack Query key of the workspace's AI uses, read through the site (ADR-031). */
export const aiQueryKeys = {
  usage: (siteId: string) => ['sites', siteId, 'ai', 'usage'] as const,
};

const fieldIds: Record<BriefField, string> = {
  product: 'ai-product',
  audience: 'ai-audience',
  differentiators: 'ai-differentiators',
  existingContent: 'ai-existing',
  title: 'ai-title',
  slug: 'ai-slug',
};

/** "Dùng template" (boards 17, 20): the library, making pages for this site. */
function templatesFor(site: Site): string {
  return templatesHref(site.workspaceId, `?site=${encodeURIComponent(site.id)}`);
}

/** "01/12" of a day "2026-12-01". */
function dayMonth(day: string): string {
  return `${day.slice(8, 10)}/${day.slice(5, 7)}`;
}

const statusLabels: Record<AiSectionStatus, string> = {
  queued: 'Chờ',
  writing: 'Đang viết…',
  done: 'Xong',
  failed: 'Chưa viết được',
  kept: 'Bạn tự điền',
};

/** Why the job wrote nothing, in the board's words: what happened, before what it means. */
const failureReasons: Record<AiFailure, string> = {
  ai_overloaded: 'Dịch vụ AI đang quá tải.',
  ai_unavailable: 'Không kết nối được dịch vụ AI.',
  ai_timeout: 'Dịch vụ AI phản hồi quá lâu.',
  ai_invalid_output: 'AI trả về nội dung không dùng được.',
  slug_taken: 'Đường dẫn vừa được một trang khác dùng; đổi đường dẫn ở bước Brief.',
  page_limit_reached: 'Site đã có số trang tối đa.',
  interrupted: 'Việc viết bị gián đoạn.',
  draft_changed: 'Bản nháp đã được sửa trong lúc AI viết.',
};

/** The run of a job as the screen shows it. */
type Run =
  | { kind: 'idle' }
  | { kind: 'starting' }
  | { kind: 'running'; job: AiJob; cancelling: boolean }
  | { kind: 'done'; job: AiJob }
  | { kind: 'partial'; job: AiJob }
  | { kind: 'failed'; failure: AiFailure | null }
  /** The stream broke while the job ran: it goes on on the server. */
  | { kind: 'lost'; jobId: string; checking: boolean; stillRunning: boolean };

function withSectionStatus(job: AiJob, sectionId: string, status: AiSectionStatus): AiJob {
  return {
    ...job,
    sections: job.sections.map((section) =>
      section.id === sectionId ? { ...section, status } : section,
    ),
  };
}

function focusFirstProblem(errors: BriefErrors): void {
  const first = briefFieldOrder.find((field) => errors[field] !== undefined);
  if (first !== undefined) {
    document.getElementById(fieldIds[first])?.focus();
  }
}

function Stepper({ current }: { current: AiStep }) {
  const currentIndex = aiSteps.findIndex(({ step }) => step === current);
  return (
    <ol aria-label="Các bước tạo trang bằng AI" className={styles.stepper}>
      {aiSteps.map(({ step, label }, index) => (
        <li key={step} className={styles.stepItem}>
          {index > 0 ? <span aria-hidden="true" className={styles.stepLine} /> : null}
          <span
            aria-current={step === current ? 'step' : undefined}
            className={cx(
              styles.step,
              step === current && styles.stepCurrent,
              index < currentIndex && styles.stepDone,
            )}
          >
            <span aria-hidden="true" className={styles.stepNumber}>
              {index < currentIndex ? <CheckIcon size={14} strokeWidth={2.4} /> : index + 1}
            </span>
            <span className={styles.stepLabel}>{label}</span>
            {index < currentIndex ? <VisuallyHidden> (đã xong)</VisuallyHidden> : null}
          </span>
        </li>
      ))}
    </ol>
  );
}

function SidePanel() {
  return (
    <aside aria-labelledby="ai-about" className={styles.aside}>
      <div className={styles.asideCard}>
        <h2 id="ai-about" className={styles.asideTitle}>
          AI làm gì với trang của bạn
        </h2>
        <p className={styles.asideText}>
          Viết chữ cho các section có sẵn trong thư viện, theo theme của site. AI không tự xuất bản;
          bạn duyệt trong editor rồi mới xuất bản.
        </p>
        <p className={styles.asideText}>
          Số liệu, giá và cam kết y tế phải đúng sự thật. AI đánh dấu những câu cần bạn kiểm tra.
        </p>
      </div>
      <div className={styles.asideCard}>
        <h2 className={styles.asideTitle}>Dữ liệu được gửi đi</h2>
        <p className={styles.asideText}>
          <strong className={styles.yes}>Có:</strong> nội dung bạn nhập ở brief, tên site và chữ của
          các section.
        </p>
        <p className={styles.asideText}>
          <strong className={styles.no}>Không:</strong> lead, danh bạ khách hàng, nội dung đồng ý
          hay bất kỳ dữ liệu cá nhân nào của khách.
        </p>
      </div>
    </aside>
  );
}

function Header({ site, step, usage }: { site: Site; step: AiStep | null; usage: AiUsage | null }) {
  const exhausted = usage !== null && usage.remaining === 0;
  return (
    <header className={styles.header}>
      <div className={styles.headerStart}>
        <IconButtonLink
          as={Link}
          href={siteHref(site.id)}
          aria-label="Hủy và quay lại"
          icon={<CloseIcon size={20} />}
        />
        <div className={styles.headerText}>
          <span className={styles.headerTitle}>Tạo trang bằng AI</span>
          <span className={styles.muted}>{site.name}</span>
        </div>
      </div>
      {step === null ? null : <Stepper current={step} />}
      {usage === null ? null : (
        <span className={cx(styles.usage, exhausted && styles.usageExhausted)}>
          <SparklesIcon size={15} />
          {exhausted
            ? `Đã dùng ${usage.used}/${usage.limit} lượt tháng này`
            : `Còn ${usage.remaining}/${usage.limit} lượt tháng này`}
        </span>
      )}
    </header>
  );
}

export interface AiCreateScreenProps {
  site: Site;
  /** The workspace's uses as the server rendered the screen. */
  usage: AiUsage;
}

/**
 * Board 20 "Tạo trang bằng AI" (ADR-031): the brief, a structure from the goal's blueprint that
 * the user arranges (no AI, no use), then the job that writes it, whose progress streams on the
 * request that started it. The draft opens in the editor when every section is written.
 */
export function AiCreateScreen({ site, usage: initialUsage }: AiCreateScreenProps) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [state, dispatch] = useReducer(aiCreateReducer, undefined, () => initialAiCreateState());
  const [run, setRun] = useState<Run>({ kind: 'idle' });
  const [problem, setProblem] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState('');
  const headingRef = useRef<HTMLHeadingElement>(null);
  const shownStep = useRef(state.step);
  const pendingFocus = useRef<BriefErrors | null>(null);
  const reading = useRef<AbortController | null>(null);
  const focusAfterRemoval = useRef<string | null>(null);
  const usageQuery = useQuery({
    queryKey: aiQueryKeys.usage(site.id),
    queryFn: () => api(endpoints.aiUsage, [site.id]),
    initialData: initialUsage,
  });
  const usage = usageQuery.data;
  const exhausted = usage.remaining === 0;
  const slugCheck = useSlugAvailability(site.id, state.slug);
  const host = hostOf(site.publicOrigin);
  const templates = templatesFor(site);

  useEffect(() => {
    if (shownStep.current === state.step) {
      return;
    }
    shownStep.current = state.step;
    const problems = pendingFocus.current;
    pendingFocus.current = null;
    if (problems !== null) {
      focusFirstProblem(problems);
      return;
    }
    headingRef.current?.focus();
  }, [state.step]);

  // Once a removed row has left the list, its neighbour's "Bỏ" takes the focus.
  useEffect(() => {
    const key = focusAfterRemoval.current;
    if (key === null) {
      return;
    }
    focusAfterRemoval.current = null;
    document.querySelector<HTMLButtonElement>(`[data-remove="${key}"]`)?.focus();
  }, [state.structure]);

  // Leaving the screen stops reading the stream; the job itself goes on on the server.
  useEffect(
    () => () => {
      reading.current?.abort();
    },
    [],
  );

  function showBriefProblems(errors: BriefErrors) {
    if (state.step === 'brief') {
      dispatch({ type: 'errors_shown', errors });
      focusFirstProblem(errors);
      return;
    }
    pendingFocus.current = errors;
    dispatch({ type: 'errors_shown', errors });
    dispatch({ type: 'step_changed', step: 'brief' });
  }

  function proposeStructure() {
    const built = buildAiJobRequest(state);
    const errors: BriefErrors = built.ok ? {} : { ...built.errors };
    if (errors.slug === undefined && slugCheck.state === 'rejected') {
      errors.slug = slugCheck.message;
    }
    if (Object.keys(errors).length > 0) {
      showBriefProblems(errors);
      return;
    }
    setProblem(null);
    dispatch({ type: 'structure_proposed' });
  }

  function finish(job: AiJob) {
    void queryClient.invalidateQueries({ queryKey: aiQueryKeys.usage(site.id) });
    if (job.pageId !== null) {
      void queryClient.invalidateQueries({ queryKey: siteQueryKeys.site(site.id) });
    }
    if (job.status === 'cancelled') {
      setRun({ kind: 'idle' });
      setNotice('Đã hủy. Không có bản nháp nào được tạo và lượt này không bị tính.');
      dispatch({ type: 'step_changed', step: 'structure' });
      return;
    }
    if (job.status === 'done' && job.pageId !== null) {
      if (job.sections.some((section) => section.status === 'failed')) {
        setRun({ kind: 'partial', job });
        return;
      }
      setRun({ kind: 'done', job });
      router.push(pageHref(site.id, job.pageId, 'edit'));
      return;
    }
    setRun({ kind: 'failed', failure: job.failure });
  }

  /** Follows a run's stream to its end; the first line is the job as it starts. */
  async function follow(
    start: (signal: AbortSignal, onEvent: (event: AiJobEvent) => void) => Promise<void>,
  ) {
    reading.current?.abort();
    const controller = new AbortController();
    reading.current = controller;
    // Written by the stream's callback, read after it ends.
    const seen: { job: AiJob | null } = { job: null };
    try {
      await start(controller.signal, (event) => {
        if (event.type === 'started') {
          seen.job = event.job;
          setRun({ kind: 'running', job: event.job, cancelling: false });
        } else if (event.type === 'section' && seen.job !== null) {
          const job = withSectionStatus(seen.job, event.sectionId, event.status);
          seen.job = job;
          setRun((previous) => (previous.kind === 'running' ? { ...previous, job } : previous));
        } else if (event.type === 'finished') {
          seen.job = event.job;
          finish(event.job);
        }
      });
    } catch (error) {
      if (controller.signal.aborted) {
        return;
      }
      if (seen.job === null) {
        throw error;
      }
      reportUnexpected('Reading the AI job stream failed', error);
      setRun({ kind: 'lost', jobId: seen.job.id, checking: false, stillRunning: false });
    }
  }

  async function write() {
    const built = buildAiJobRequest(state);
    if (!built.ok) {
      showBriefProblems(built.errors);
      return;
    }
    setProblem(null);
    setNotice(null);
    setRun({ kind: 'starting' });
    dispatch({ type: 'step_changed', step: 'writing' });
    try {
      await follow((signal, onEvent) =>
        streamEndpoint(
          endpoints.startAiPageJob,
          [site.id],
          { body: built.request, signal },
          aiJobEventSchema,
          onEvent,
        ),
      );
    } catch (error) {
      refused(error);
    }
  }

  /** The job was refused before it started: nothing was used. */
  function refused(error: unknown) {
    setRun({ kind: 'idle' });
    reportUnexpected('Starting the AI job failed', error);
    if (error instanceof ApiError && error.code === 'ai_quota_exhausted') {
      void queryClient.invalidateQueries({ queryKey: aiQueryKeys.usage(site.id) });
      dispatch({ type: 'step_changed', step: 'brief' });
      return;
    }
    if (error instanceof ApiError) {
      const errors = briefErrorsOf(error.problem.issues ?? []);
      if (error.code === 'slug_taken' && errors.slug === undefined) {
        errors.slug = error.problem.title;
      }
      if (Object.keys(errors).length > 0) {
        showBriefProblems(errors);
        return;
      }
    }
    setProblem(problemMessage(error));
    dispatch({ type: 'step_changed', step: 'structure' });
  }

  async function retry(job: AiJob) {
    setProblem(null);
    setRun({ kind: 'running', job, cancelling: false });
    try {
      await follow((signal, onEvent) =>
        streamEndpoint(
          endpoints.retryAiPageJob,
          [site.id, job.id],
          { signal },
          aiJobEventSchema,
          onEvent,
        ),
      );
    } catch (error) {
      reportUnexpected('Retrying the AI job failed', error);
      setRun({ kind: 'partial', job });
      setProblem(problemMessage(error));
    }
  }

  async function cancel(job: AiJob) {
    setRun({ kind: 'running', job, cancelling: true });
    try {
      // The stream ends with the cancelled job, which `finish` shows.
      await api(endpoints.cancelAiPageJob, [site.id, job.id]);
    } catch (error) {
      reportUnexpected('Cancelling the AI job failed', error);
      setRun((previous) =>
        previous.kind === 'running' ? { ...previous, cancelling: false } : previous,
      );
      setProblem(problemMessage(error));
    }
  }

  async function checkLost(jobId: string) {
    setRun({ kind: 'lost', jobId, checking: true, stillRunning: false });
    try {
      const job = await api(endpoints.getAiPageJob, [site.id, jobId]);
      if (job.status === 'running') {
        setRun({ kind: 'lost', jobId, checking: false, stillRunning: true });
        return;
      }
      finish(job);
    } catch (error) {
      reportUnexpected('Reading the AI job failed', error);
      setRun({ kind: 'lost', jobId, checking: false, stillRunning: false });
      setProblem(problemMessage(error));
    }
  }

  function moveSection(key: string, name: string, index: number, offset: -1 | 1) {
    dispatch({ type: 'section_moved', key, offset });
    setAnnouncement(`Đã đưa ${name} tới vị trí ${index + offset + 1}.`);
  }

  function removeSection(key: string, name: string, index: number) {
    const next = state.structure[index + 1] ?? state.structure[index - 1];
    // The removed row's buttons are gone: focus moves to the row that takes its place.
    focusAfterRemoval.current = next?.key ?? null;
    dispatch({ type: 'section_removed', key });
    setAnnouncement(`Đã bỏ ${name}.`);
  }

  if (!usage.enabled) {
    return (
      <div className={styles.page}>
        <Header site={site} step={null} usage={null} />
        <main id="main-content" className={styles.main}>
          <section aria-labelledby="ai-title" className={styles.panel}>
            <div className={styles.intro}>
              <h1 id="ai-title" className={styles.title}>
                AI chưa được bật
              </h1>
              <p className={styles.lead}>
                Hệ thống chưa nối dịch vụ AI, nên chưa tạo được trang bằng AI. Bạn vẫn tạo trang
                nhanh từ một mẫu, hoặc theo mục tiêu, với chữ mẫu để thay trong editor.
              </p>
            </div>
            <div className={styles.actionGroup}>
              <ButtonLink as={Link} href={templates}>
                Dùng template
              </ButtonLink>
              <ButtonLink as={Link} href={newPageHref(site.id)} variant="secondary">
                Tạo trang theo mục tiêu
              </ButtonLink>
            </div>
          </section>
        </main>
      </div>
    );
  }

  const writtenCount = (job: AiJob) =>
    job.sections.filter((section) => section.status === 'done').length;
  const failedCount = (job: AiJob) =>
    job.sections.filter((section) => section.status === 'failed').length;
  const writableCount = (job: AiJob) =>
    job.sections.filter((section) => section.status !== 'kept').length;
  const shownJob =
    run.kind === 'running' || run.kind === 'done' || run.kind === 'partial' ? run.job : null;
  const writingTitle = run.kind === 'partial' ? 'Gần xong' : 'Đang viết nội dung';
  const writingLead =
    run.kind === 'partial'
      ? 'Bản nháp đã được lưu. Chưa ai thấy cho tới khi bạn xuất bản.'
      : `AI viết từng section theo brief và theme ${themePresets[site.themePresetId].label} của site.`;

  return (
    <div className={styles.page}>
      <Header site={site} step={state.step} usage={usage} />
      <main id="main-content" className={styles.main}>
        <section aria-labelledby="ai-title" className={styles.panel}>
          {state.step === 'brief' ? (
            <>
              <div className={styles.intro}>
                <h1 id="ai-title" ref={headingRef} tabIndex={-1} className={styles.title}>
                  Kể cho AI về trang bạn cần
                </h1>
                <p className={styles.lead}>
                  Càng cụ thể, bản nháp càng sát. Mọi ô đều sửa lại được sau trong editor.
                </p>
              </div>
              {exhausted ? (
                <Callout
                  tone="warning"
                  role="alert"
                  title={`Workspace đã dùng hết ${usage.limit} lượt AI tháng này.`}
                  action={
                    <ButtonLink as={Link} href={templates} variant="secondary" size="sm">
                      Dùng template
                    </ButtonLink>
                  }
                >
                  Lượt mới có vào {dayMonth(usage.resetsOn)}. Brief bạn nhập vẫn được giữ lại.
                </Callout>
              ) : null}
              <Field
                label="Sản phẩm hoặc dịch vụ"
                id={fieldIds.product}
                required
                error={state.errors.product}
              >
                <Textarea
                  rows={2}
                  maxLength={300}
                  value={state.product}
                  onChange={(event) => {
                    dispatch({
                      type: 'brief_changed',
                      field: 'product',
                      value: event.target.value,
                    });
                  }}
                />
              </Field>
              <Field
                label="Khách hàng mục tiêu"
                id={fieldIds.audience}
                required
                error={state.errors.audience}
              >
                <Input
                  maxLength={200}
                  value={state.audience}
                  onChange={(event) => {
                    dispatch({
                      type: 'brief_changed',
                      field: 'audience',
                      value: event.target.value,
                    });
                  }}
                />
              </Field>
              <fieldset className={styles.fieldset}>
                <legend className={styles.legend}>Mục tiêu trang</legend>
                <div className={styles.chips}>
                  {pageGoalIds.map((goal) => (
                    <label
                      key={goal}
                      className={cx(styles.chip, state.goal === goal && styles.chipSelected)}
                    >
                      <input
                        type="radio"
                        name="ai-goal"
                        checked={state.goal === goal}
                        onChange={() => {
                          dispatch({ type: 'goal_selected', goal });
                        }}
                      />
                      {goalDefinitions[goal].title}
                    </label>
                  ))}
                </div>
              </fieldset>
              <Field
                label="Điểm khác biệt và thông điệp chính"
                id={fieldIds.differentiators}
                required
                error={state.errors.differentiators}
              >
                <Textarea
                  rows={3}
                  maxLength={800}
                  value={state.differentiators}
                  onChange={(event) => {
                    dispatch({
                      type: 'brief_changed',
                      field: 'differentiators',
                      value: event.target.value,
                    });
                  }}
                />
              </Field>
              <div className={styles.toneRow}>
                <fieldset className={styles.fieldset}>
                  <legend className={styles.legend}>Giọng văn</legend>
                  <div className={styles.segments}>
                    {aiToneIds.map((tone) => (
                      <label
                        key={tone}
                        className={cx(
                          styles.segment,
                          state.tone === tone && styles.segmentSelected,
                        )}
                      >
                        <input
                          type="radio"
                          name="ai-tone"
                          checked={state.tone === tone}
                          onChange={() => {
                            dispatch({ type: 'tone_selected', tone });
                          }}
                        />
                        {aiToneLabels[tone]}
                      </label>
                    ))}
                  </div>
                </fieldset>
                <Field label="Ngôn ngữ">
                  <Select
                    value={state.language}
                    onChange={(event) => {
                      const language = aiLanguageIds.find((id) => id === event.target.value);
                      if (language !== undefined) {
                        dispatch({ type: 'language_selected', language });
                      }
                    }}
                  >
                    {aiLanguageIds.map((language) => (
                      <option key={language} value={language}>
                        {aiLanguageLabels[language]}
                      </option>
                    ))}
                  </Select>
                </Field>
              </div>
              <Field
                label="Nội dung bạn đã có"
                id={fieldIds.existingContent}
                optional
                help="Dán bảng giá, giới thiệu hay ghi chú sẵn có. Chỉ nhận chữ, chưa nhận tệp."
                error={state.errors.existingContent}
              >
                <Textarea
                  rows={4}
                  maxLength={4000}
                  value={state.existingContent}
                  onChange={(event) => {
                    dispatch({
                      type: 'brief_changed',
                      field: 'existingContent',
                      value: event.target.value,
                    });
                  }}
                />
              </Field>
              <div className={styles.pageFields}>
                <Field label="Tên trang" id={fieldIds.title} required error={state.errors.title}>
                  <Input
                    maxLength={120}
                    value={state.title}
                    onChange={(event) => {
                      dispatch({ type: 'title_changed', title: event.target.value });
                    }}
                  />
                </Field>
                <PageSlugField
                  id={fieldIds.slug}
                  host={host}
                  value={state.slug}
                  error={state.errors.slug}
                  check={slugCheck}
                  onChange={(slug) => {
                    dispatch({ type: 'slug_changed', slug });
                  }}
                  onBlur={() => {
                    dispatch({ type: 'slug_finished' });
                  }}
                />
              </div>
              <div className={styles.actions}>
                <Link href={templates} className={styles.textLink}>
                  Chọn template thay vì AI
                </Link>
                <Button disabled={exhausted} onClick={proposeStructure}>
                  Đề xuất cấu trúc trang
                </Button>
              </div>
            </>
          ) : null}

          {state.step === 'structure' ? (
            <>
              <div className={styles.intro}>
                <h1 id="ai-title" ref={headingRef} tabIndex={-1} className={styles.title}>
                  Cấu trúc đề xuất
                </h1>
                <p className={styles.lead}>
                  Sắp xếp, bỏ hoặc thêm section trước khi AI viết nội dung. Chưa tốn lượt nào.
                </p>
              </div>
              {notice === null ? null : (
                <Callout tone="info" role="status">
                  {notice}
                </Callout>
              )}
              <ol aria-label="Các section của trang" className={styles.structure}>
                {state.structure.map((entry, index) => (
                  <li key={entry.key} className={styles.structureItem}>
                    <span aria-hidden="true" className={styles.structureNumber}>
                      {index + 1}
                    </span>
                    <span className={styles.structureText}>
                      <span className={styles.structureName}>{entry.name}</span>
                      <span className={styles.structureDescription}>{descriptionOf(entry)}</span>
                    </span>
                    <span className={styles.structureActions}>
                      <IconButton
                        aria-label={`Đưa ${entry.name} lên`}
                        icon={<ArrowUpIcon size={16} />}
                        size="sm"
                        disabled={!canShift(state.structure, index, -1)}
                        onClick={() => {
                          moveSection(entry.key, entry.name, index, -1);
                        }}
                      />
                      <IconButton
                        aria-label={`Đưa ${entry.name} xuống`}
                        icon={<ArrowDownIcon size={16} />}
                        size="sm"
                        disabled={!canShift(state.structure, index, 1)}
                        onClick={() => {
                          moveSection(entry.key, entry.name, index, 1);
                        }}
                      />
                      <IconButton
                        aria-label={`Bỏ ${entry.name}`}
                        icon={<TrashIcon size={16} />}
                        size="sm"
                        data-remove={entry.key}
                        disabled={state.structure.length <= 1}
                        onClick={() => {
                          removeSection(entry.key, entry.name, index);
                        }}
                      />
                    </span>
                  </li>
                ))}
              </ol>
              <p role="status" className={styles.visuallyHidden}>
                {announcement}
              </p>
              <div>
                <DropdownMenu
                  align="start"
                  trigger={
                    <Button variant="secondary" leadingIcon={<PlusIcon size={14} />}>
                      Thêm section
                    </Button>
                  }
                >
                  {sectionOrder.map((type) => {
                    const blocked = addBlockedReason(state.structure, type);
                    return (
                      <DropdownMenuItem
                        key={type}
                        disabled={blocked !== null}
                        description={blocked ?? undefined}
                        onSelect={() => {
                          dispatch({ type: 'section_added', sectionType: type });
                          setAnnouncement(`Đã thêm ${getSectionDefinition(type).label}.`);
                        }}
                      >
                        {getSectionDefinition(type).label}
                      </DropdownMenuItem>
                    );
                  })}
                </DropdownMenu>
              </div>
              {exhausted ? (
                <Callout tone="warning" role="alert">
                  Workspace đã dùng hết {usage.limit} lượt AI tháng này. Lượt mới có vào{' '}
                  {dayMonth(usage.resetsOn)}.
                </Callout>
              ) : null}
              {problem === null ? null : (
                <Callout tone="danger" role="alert">
                  {problem}
                </Callout>
              )}
              <div className={styles.actions}>
                <span className={styles.actionGroup}>
                  <Button
                    variant="secondary"
                    onClick={() => {
                      setNotice(null);
                      dispatch({ type: 'step_changed', step: 'brief' });
                    }}
                  >
                    Sửa brief
                  </Button>
                  <Button
                    variant="secondary"
                    onClick={() => {
                      setAnnouncement('Đã đề xuất lại cấu trúc theo mục tiêu.');
                      dispatch({ type: 'structure_proposed' });
                    }}
                  >
                    Đề xuất lại
                  </Button>
                </span>
                <Button disabled={exhausted} onClick={() => void write()}>
                  Viết nội dung · tốn 1 lượt
                </Button>
              </div>
            </>
          ) : null}

          {state.step === 'writing' ? (
            <>
              <div className={styles.intro}>
                <h1 id="ai-title" ref={headingRef} tabIndex={-1} className={styles.title}>
                  {writingTitle}
                </h1>
                <p className={styles.lead}>{writingLead}</p>
              </div>
              <ol aria-label="Tiến độ viết" aria-live="polite" className={styles.progress}>
                {state.structure.map((entry, index) => {
                  const status: AiSectionStatus = shownJob?.sections[index]?.status ?? 'queued';
                  return (
                    <li
                      key={entry.key}
                      className={cx(styles.progressItem, styles[`progress_${status}`])}
                    >
                      <span aria-hidden="true" className={styles.progressMark}>
                        {status === 'done' ? (
                          <CheckIcon size={12} strokeWidth={3} />
                        ) : status === 'failed' ? (
                          '!'
                        ) : null}
                      </span>
                      <span className={styles.progressName}>{entry.name}</span>
                      <span className={styles.progressStatus}>{statusLabels[status]}</span>
                    </li>
                  );
                })}
              </ol>

              {run.kind === 'starting' || run.kind === 'running' || run.kind === 'done' ? (
                <div className={styles.actions}>
                  <span className={styles.note}>
                    Thường mất dưới một phút. Bạn có thể rời màn này, bản nháp sẽ có trong danh sách
                    trang.
                  </span>
                  {run.kind === 'running' ? (
                    <Button
                      variant="secondary"
                      loading={run.cancelling}
                      onClick={() => void cancel(run.job)}
                    >
                      Hủy
                    </Button>
                  ) : null}
                </div>
              ) : null}

              {run.kind === 'partial' && run.job.pageId !== null ? (
                <div className={styles.stack}>
                  <Callout tone="warning" role="status">
                    <strong>
                      Đã viết {writtenCount(run.job)}/{writableCount(run.job)} section.
                    </strong>{' '}
                    {failedCount(run.job)} section chưa viết được.{' '}
                    {run.job.retriesLeft > 0
                      ? 'Thử lại không tốn thêm lượt. '
                      : 'Đã hết lượt thử lại. '}
                    Nếu mở luôn, các section đó giữ chữ mẫu và checklist xuất bản sẽ nhắc bạn.
                  </Callout>
                  {problem === null ? null : (
                    <Callout tone="danger" role="alert">
                      {problem}
                    </Callout>
                  )}
                  <div className={styles.actionsEnd}>
                    <ButtonLink
                      as={Link}
                      variant="secondary"
                      href={pageHref(site.id, run.job.pageId, 'edit')}
                    >
                      Mở bản nháp với {writtenCount(run.job)} section
                    </ButtonLink>
                    {run.job.retriesLeft > 0 ? (
                      <Button onClick={() => void retry(run.job)}>
                        Thử lại {failedCount(run.job)} section
                      </Button>
                    ) : null}
                  </div>
                </div>
              ) : null}

              {run.kind === 'failed' ? (
                <div className={styles.stack}>
                  <Callout tone="danger" role="alert" title="Chưa tạo được nội dung.">
                    {run.failure === null ? '' : `${failureReasons[run.failure]} `}Không có bản nháp
                    nào được tạo và lượt này không bị tính. Brief và cấu trúc của bạn vẫn còn.
                  </Callout>
                  <div className={styles.actionGroup}>
                    <Button disabled={exhausted} onClick={() => void write()}>
                      Thử lại
                    </Button>
                    <Button
                      variant="secondary"
                      onClick={() => {
                        setRun({ kind: 'idle' });
                        dispatch({ type: 'step_changed', step: 'structure' });
                      }}
                    >
                      Sửa cấu trúc
                    </Button>
                    <ButtonLink as={Link} variant="secondary" href={templates}>
                      Dùng template
                    </ButtonLink>
                  </div>
                </div>
              ) : null}

              {run.kind === 'lost' ? (
                <div className={styles.stack}>
                  <Callout tone="warning" role="status" title="Mất kết nối với máy chủ.">
                    {run.stillRunning ? 'AI vẫn đang viết. ' : 'AI vẫn viết tiếp trên máy chủ. '}
                    Bản nháp sẽ có trong danh sách trang khi viết xong.
                  </Callout>
                  {problem === null ? null : (
                    <Callout tone="danger" role="alert">
                      {problem}
                    </Callout>
                  )}
                  <div className={styles.actionGroup}>
                    <Button loading={run.checking} onClick={() => void checkLost(run.jobId)}>
                      Xem tiến độ
                    </Button>
                    <ButtonLink as={Link} variant="secondary" href={siteHref(site.id)}>
                      Về danh sách trang
                    </ButtonLink>
                  </div>
                </div>
              ) : null}
            </>
          ) : null}
        </section>
        <SidePanel />
      </main>
    </div>
  );
}
