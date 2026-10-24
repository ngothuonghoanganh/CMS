'use client';

import {
  type CreatePageRequest,
  endpoints,
  type PageGoal,
  pageGoalIds,
  type PageStyle,
  pageStyleIds,
  type SectionType,
  type Site,
  type ThemePresetId,
} from '@plp/contracts';
import {
  goalDefinitions,
  goalOutline,
  pageStyles,
  pageStyleSchemes,
  themePresets,
} from '@plp/sections/schema';
import {
  ArrowLeftIcon,
  ArrowRightIcon,
  BoxIcon,
  BuildingIcon,
  Button,
  Callout,
  CalendarIcon,
  Card,
  CheckIcon,
  CloseIcon,
  Field,
  IconButtonLink,
  InboxIcon,
  Input,
  ListIcon,
  LockIcon,
  RadioCardGroup,
  TagIcon,
  VisuallyHidden,
} from '@plp/ui';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { type ReactNode, useEffect, useReducer, useRef, useState } from 'react';
import { api, ApiError } from '../../lib/api';
import { hostOf } from '../../lib/site-url';
import { siteQueryKeys } from '../dashboard/queries';
import { cx } from '../shell/cx';
import { pageHref, siteHref } from '../shell/navigation';
import { problemMessage, reportUnexpected } from '../shell/problem-message';
import { BlankPageDialog } from './BlankPageDialog';
import { PageSlugField } from './PageSlugField';
import { useSlugAvailability } from './use-slug-availability';
import {
  buildCreatePageRequest,
  type ContentErrors,
  type ContentField,
  contentErrorsOf,
  contentFieldOrder,
  initialWizardState,
  type WizardStep,
  wizardReducer,
  wizardSteps,
} from './wizard-state';
import styles from './CreatePageWizard.module.css';

const goalIcons: Record<PageGoal, ReactNode> = {
  lead: <InboxIcon size={20} />,
  promo: <TagIcon size={20} />,
  event: <CalendarIcon size={20} />,
  product: <BoxIcon size={20} />,
  waitlist: <ListIcon size={20} />,
  about: <BuildingIcon size={20} />,
};

/** Line widths of the schematic section thumbnails, as on the board. */
const thumbnailLines: ReadonlyArray<readonly [string, string]> = [
  ['72%', '48%'],
  ['60%', '80%'],
  ['84%', '40%'],
  ['50%', '70%'],
];

const fieldIds: Record<ContentField, string> = {
  title: 'new-page-title',
  slug: 'new-page-slug',
  offer: 'new-page-offer',
  audience: 'new-page-audience',
  phone: 'new-page-phone',
};

function focusFirstProblem(errors: ContentErrors): void {
  const first = contentFieldOrder.find((field) => errors[field] !== undefined);
  if (first !== undefined) {
    document.getElementById(fieldIds[first])?.focus();
  }
}

/** Problems the form shows on its fields rather than in the footer. */
function fieldProblemsOf(error: unknown): ContentErrors | null {
  if (!(error instanceof ApiError)) {
    return null;
  }
  const errors = contentErrorsOf(error.fieldErrors());
  if (error.code === 'slug_taken' && errors.slug === undefined) {
    errors.slug = error.problem.title;
  }
  return Object.keys(errors).length > 0 ? errors : null;
}

function Stepper({ current }: { current: WizardStep }) {
  return (
    <ol aria-label="Các bước tạo trang" className={styles.stepper}>
      {wizardSteps.map(({ step, label }, index) => (
        <li key={step} className={styles.stepItem}>
          {index > 0 ? <span aria-hidden="true" className={styles.stepLine} /> : null}
          <span
            aria-current={step === current ? 'step' : undefined}
            className={cx(
              styles.step,
              step === current && styles.stepCurrent,
              step < current && styles.stepDone,
            )}
          >
            <span aria-hidden="true" className={styles.stepNumber}>
              {step < current ? <CheckIcon size={14} strokeWidth={2.4} /> : step}
            </span>
            <span className={styles.stepLabel}>{label}</span>
            {step < current ? <VisuallyHidden> (đã xong)</VisuallyHidden> : null}
          </span>
        </li>
      ))}
    </ol>
  );
}

function StyleStrip({
  themePresetId,
  style,
  types,
}: {
  themePresetId: ThemePresetId;
  style: PageStyle;
  types: readonly SectionType[];
}) {
  const { schemes } = themePresets[themePresetId];
  return (
    <span aria-hidden="true" className={styles.styleStrip}>
      {pageStyleSchemes(style, types).map((scheme, index) => (
        <span
          key={index}
          className={styles.band}
          style={{ background: schemes[scheme].background, borderColor: schemes[scheme].border }}
        >
          <span className={styles.bandLine} style={{ background: schemes[scheme].heading }} />
        </span>
      ))}
    </span>
  );
}

function OutlinePanel({
  goal,
  style,
  themePresetId,
}: {
  goal: PageGoal;
  /** Colors the thumbnails with the style's schemes (step 3); null keeps them neutral. */
  style: PageStyle | null;
  themePresetId: ThemePresetId;
}) {
  const outline = goalOutline(goal);
  const schemes =
    style === null
      ? null
      : pageStyleSchemes(
          style,
          outline.map((item) => item.type),
        );
  const preset = themePresets[themePresetId];
  return (
    <aside aria-labelledby="outline-heading" className={styles.aside}>
      <div className={styles.asideHeading}>
        <h2 id="outline-heading" className={styles.asideTitle}>
          Trang sẽ gồm
        </h2>
        <span className={styles.muted}>{outline.length} section</span>
      </div>
      <ol className={styles.outline}>
        {outline.map((item, index) => {
          const [first, second] = thumbnailLines[index % thumbnailLines.length] ?? ['70%', '50%'];
          const scheme = schemes?.[index];
          const colors = scheme === undefined ? null : preset.schemes[scheme];
          return (
            <li key={`${item.type}-${index}`} className={styles.outlineItem}>
              <span
                aria-hidden="true"
                className={styles.thumb}
                style={colors === null ? undefined : { background: colors.background }}
              >
                <span
                  className={styles.thumbLine}
                  style={{
                    width: first,
                    ...(colors === null ? {} : { background: colors.heading }),
                  }}
                />
                <span
                  className={styles.thumbLineSoft}
                  style={{
                    width: second,
                    ...(colors === null ? {} : { background: colors.muted }),
                  }}
                />
              </span>
              <span className={styles.outlineLabel}>{item.label}</span>
            </li>
          );
        })}
      </ol>
      <div className={styles.defaults}>
        <span className={styles.defaultsTitle}>Mặc định hướng chuyển đổi</span>
        <ul className={styles.defaultsList}>
          <li>Nút kêu gọi lặp lại ở đầu và cuối trang</li>
          <li>Bố cục một cột, ưu tiên màn hình điện thoại</li>
          <li>Liên hệ nhanh qua điện thoại hoặc Zalo</li>
        </ul>
      </div>
    </aside>
  );
}

export interface CreatePageWizardProps {
  site: Site;
}

/**
 * Screen 02 "Tạo trang mới": goal, main content (title, slug, brief) and color rhythm, then the
 * API builds the page from the goal's blueprint and the editor opens.
 */
export function CreatePageWizard({ site }: CreatePageWizardProps) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [state, dispatch] = useReducer(wizardReducer, undefined, () => initialWizardState());
  const [blankOpen, setBlankOpen] = useState(false);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const shownStep = useRef(state.step);
  // A field to focus once its step is on screen (after a server error on another step).
  const pendingFocus = useRef<ContentErrors | null>(null);
  const host = hostOf(site.defaultOrigin);
  const slugCheck = useSlugAvailability(site.id, state.slug);
  const outlineTypes = goalOutline(state.goal).map((item) => item.type);

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

  const create = useMutation({
    mutationFn: (request: CreatePageRequest) =>
      api(endpoints.createPage, [site.id], { body: request }),
    onSuccess: (detail) => {
      void queryClient.invalidateQueries({ queryKey: siteQueryKeys.site(site.id) });
      router.push(pageHref(site.id, detail.page.id, 'edit'));
    },
    onError: (error) => {
      const problems = fieldProblemsOf(error);
      if (problems !== null) {
        pendingFocus.current = problems;
        dispatch({ type: 'errors_shown', errors: problems, step: 2 });
        return;
      }
      reportUnexpected('Creating the page failed', error);
    },
  });

  function goTo(step: WizardStep) {
    create.reset();
    dispatch({ type: 'step_changed', step });
  }

  function next() {
    if (state.step === 1) {
      goTo(2);
      return;
    }
    const built = buildCreatePageRequest(state);
    const errors: ContentErrors = built.ok ? {} : { ...built.errors };
    if (errors.slug === undefined && slugCheck.state === 'rejected') {
      errors.slug = slugCheck.message;
    }
    if (!built.ok || Object.keys(errors).length > 0) {
      if (state.step === 2) {
        dispatch({ type: 'errors_shown', errors });
        focusFirstProblem(errors);
      } else {
        pendingFocus.current = errors;
        dispatch({ type: 'errors_shown', errors, step: 2 });
      }
      return;
    }
    if (state.step === 2) {
      goTo(3);
      return;
    }
    create.mutate(built.request);
  }

  const footerError =
    create.error === null || fieldProblemsOf(create.error) !== null
      ? null
      : problemMessage(create.error);

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div className={styles.headerStart}>
          <IconButtonLink
            as={Link}
            href={siteHref(site.id)}
            aria-label="Đóng và quay lại danh sách trang"
            icon={<CloseIcon size={20} />}
          />
          <div className={styles.headerText}>
            <span className={styles.headerTitle}>Tạo trang mới</span>
            <span className={styles.muted}>{site.name}</span>
          </div>
        </div>
        <Stepper current={state.step} />
        <div className={styles.headerEnd}>
          <button
            type="button"
            className={styles.textButton}
            onClick={() => {
              setBlankOpen(true);
            }}
          >
            Bắt đầu trống
          </button>
        </div>
      </header>

      <main id="main-content" className={styles.main}>
        <section aria-labelledby="wizard-heading" className={styles.content}>
          {state.step === 1 ? (
            <>
              <div className={styles.intro}>
                <h1 id="wizard-heading" ref={headingRef} tabIndex={-1} className={styles.title}>
                  Trang này dùng để làm gì?
                </h1>
                <p className={styles.lead}>
                  Chọn một mục tiêu, chúng tôi dựng sẵn các section phù hợp và mặc định tối ưu
                  chuyển đổi. Bạn đổi được mọi thứ trong editor.
                </p>
              </div>
              <RadioCardGroup
                legend="Mục tiêu của trang"
                value={state.goal}
                onChange={(goal) => {
                  dispatch({ type: 'goal_selected', goal });
                }}
                options={pageGoalIds.map((goal) => ({
                  value: goal,
                  label: goalDefinitions[goal].title,
                  description: goalDefinitions[goal].description,
                  icon: goalIcons[goal],
                }))}
              />
            </>
          ) : null}

          {state.step === 2 ? (
            <>
              <div className={styles.intro}>
                <h1 id="wizard-heading" ref={headingRef} tabIndex={-1} className={styles.title}>
                  Nội dung chính
                </h1>
                <p className={styles.lead}>
                  Dùng để điền sẵn tiêu đề và nút kêu gọi thay vì chữ mẫu. Chỉ tên trang và đường
                  dẫn là bắt buộc.
                </p>
              </div>
              <Card padding="lg" className={styles.formCard}>
                <Field label="Tên trang" id={fieldIds.title} required error={state.errors.title}>
                  <Input
                    value={state.title}
                    maxLength={120}
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
                <Field
                  label="Ưu đãi hoặc dịch vụ chính"
                  id={fieldIds.offer}
                  optional
                  error={state.errors.offer}
                  help="Dùng làm tiêu đề lớn của trang."
                >
                  <Input
                    value={state.offer}
                    maxLength={120}
                    placeholder="Ví dụ: Niềng răng trong suốt — tư vấn miễn phí tháng 11"
                    onChange={(event) => {
                      dispatch({
                        type: 'brief_changed',
                        field: 'offer',
                        value: event.target.value,
                      });
                    }}
                  />
                </Field>
                <Field
                  label="Ai sẽ xem trang này?"
                  id={fieldIds.audience}
                  optional
                  error={state.errors.audience}
                >
                  <Input
                    value={state.audience}
                    maxLength={120}
                    placeholder="Ví dụ: người đi làm 22–35 tuổi tại TP.HCM"
                    onChange={(event) => {
                      dispatch({
                        type: 'brief_changed',
                        field: 'audience',
                        value: event.target.value,
                      });
                    }}
                  />
                </Field>
                <Field
                  label="Số điện thoại nhận khách (gọi điện hoặc Zalo)"
                  id={fieldIds.phone}
                  optional
                  error={state.errors.phone}
                  help="Các nút kêu gọi sẽ gọi tới số này."
                >
                  <Input
                    type="tel"
                    inputMode="tel"
                    autoComplete="tel"
                    value={state.phone}
                    maxLength={20}
                    placeholder="Ví dụ: 0901 234 567"
                    onChange={(event) => {
                      dispatch({
                        type: 'brief_changed',
                        field: 'phone',
                        value: event.target.value,
                      });
                    }}
                  />
                </Field>
              </Card>
            </>
          ) : null}

          {state.step === 3 ? (
            <>
              <div className={styles.intro}>
                <h1 id="wizard-heading" ref={headingRef} tabIndex={-1} className={styles.title}>
                  Phong cách
                </h1>
                <p className={styles.lead}>
                  Chọn cách xen kẽ màu nền giữa các section, trong giao diện{' '}
                  {themePresets[site.themePresetId].label} của site. Bạn đổi được màu từng section
                  trong editor.
                </p>
              </div>
              <RadioCardGroup
                legend="Phong cách của trang"
                value={state.style}
                onChange={(style) => {
                  dispatch({ type: 'style_selected', style });
                }}
                options={pageStyleIds.map((style) => ({
                  value: style,
                  label: pageStyles[style].label,
                  description: pageStyles[style].description,
                  preview: (
                    <StyleStrip
                      themePresetId={site.themePresetId}
                      style={style}
                      types={outlineTypes}
                    />
                  ),
                }))}
              />
            </>
          ) : null}
        </section>

        <OutlinePanel
          goal={state.goal}
          style={state.step === 3 ? state.style : null}
          themePresetId={site.themePresetId}
        />
      </main>

      <footer className={styles.footer}>
        <span className={styles.footerNote}>
          <LockIcon size={16} />
          Chưa có gì được xuất bản. Bản nháp chỉ nhóm của bạn nhìn thấy.
        </span>
        {footerError === null ? null : (
          <Callout tone="danger" role="alert" className={styles.footerError}>
            {footerError}
          </Callout>
        )}
        <div className={styles.footerActions}>
          {state.step > 1 ? (
            <Button
              variant="secondary"
              leadingIcon={<ArrowLeftIcon size={16} />}
              disabled={create.isPending}
              onClick={() => {
                goTo(state.step === 3 ? 2 : 1);
              }}
            >
              Quay lại
            </Button>
          ) : null}
          <Button
            loading={create.isPending}
            trailingIcon={state.step === 3 ? undefined : <ArrowRightIcon size={16} />}
            onClick={next}
          >
            {state.step === 3 ? 'Tạo trang' : 'Tiếp tục'}
          </Button>
        </div>
      </footer>

      <BlankPageDialog site={site} host={host} open={blankOpen} onOpenChange={setBlankOpen} />
    </div>
  );
}
