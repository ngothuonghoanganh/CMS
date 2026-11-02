'use client';

import {
  type Access,
  can,
  DEFAULT_THEME_PRESET,
  holdersOf,
  type Membership,
  type Site,
  type TemplateSummary,
  templateSourceLabels,
} from '@plp/contracts';
import {
  Badge,
  Button,
  ButtonLink,
  Callout,
  Checkbox,
  CloseIcon,
  EmptyState,
  Field,
  GridIcon,
  Input,
  SearchIcon,
  Select,
  SparklesIcon,
  TabsNav,
  VisuallyHidden,
} from '@plp/ui';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useId, useRef, useState } from 'react';
import { newAiPageHref, newSiteHref, templateHref, templatesHref } from '../shell/navigation';
import { PageContainer, PageHeader } from '../shell/PageHeader';
import { CreateFromTemplateDialog } from './CreateFromTemplateDialog';
import {
  emptyMessage,
  filterChips,
  filterGroups,
  goalLabel,
  hasFilters,
  type LibraryFilters,
  type LibraryTab,
  libraryTabs,
  NO_FILTERS,
  tabCounts,
  visibleTemplates,
  WITH_FORM_LABEL,
  withGoal,
  withIndustry,
} from './library-filters';
import { TemplateThumb } from './TemplateThumb';
import styles from './TemplateLibrary.module.css';

export interface TemplateLibraryProps {
  workspace: Membership['workspace'];
  role: Access;
  templates: readonly TemplateSummary[];
  /** The sites the user may open; creating needs `pages.edit` too (ADR-030). */
  sites: readonly Site[];
  /** "Tạo trang cho" at first: the site of `?site=`, or the one opened last. */
  initialSiteId: string | null;
  tab: LibraryTab;
}

/** "?source=system&site=…": the tab and the chosen site, kept across tabs and the preview. */
function librarySearch(tab: LibraryTab, siteId: string | null): string {
  const params = new URLSearchParams();
  if (tab !== 'all') {
    params.set('source', tab);
  }
  if (siteId !== null) {
    params.set('site', siteId);
  }
  const search = params.toString();
  return search === '' ? '' : `?${search}`;
}

function FilterCount({ count }: { count: number }) {
  return (
    <span className={styles.optionCount}>
      {count} <VisuallyHidden>mẫu</VisuallyHidden>
    </span>
  );
}

interface CardProps {
  template: TemplateSummary;
  href: string;
  themePresetId: Site['themePresetId'];
  onUse: (() => void) | null;
}

function TemplateCard({ template, href, themePresetId, onUse }: CardProps) {
  const headingId = useId();
  return (
    <li className={styles.cardItem}>
      <article className={styles.card} aria-labelledby={headingId}>
        <div className={styles.thumbArea}>
          <TemplateThumb
            sections={template.sections}
            themePresetId={themePresetId}
            label={`Bản xem thu nhỏ: ${template.name}`}
            className={styles.thumb}
          />
        </div>
        <div className={styles.cardBody}>
          <div className={styles.badges}>
            <Badge size="sm">{templateSourceLabels[template.source].toUpperCase()}</Badge>
            {template.hasForm ? <Badge size="sm">Có form</Badge> : null}
          </div>
          <h2 id={headingId} className={styles.cardTitle}>
            {template.name}
          </h2>
          <p className={styles.cardDescription}>{template.description}</p>
          <p className={styles.cardMeta}>
            {goalLabel(template.goal)} · {template.sections.length} section
          </p>
          <div className={styles.cardActions}>
            <ButtonLink as={Link} href={href} variant="secondary" size="sm" fullWidth>
              Xem trước <VisuallyHidden>{template.name}</VisuallyHidden>
            </ButtonLink>
            {onUse === null ? null : (
              <Button size="sm" fullWidth onClick={onUse}>
                Dùng mẫu <VisuallyHidden>{template.name}</VisuallyHidden>
              </Button>
            )}
          </div>
        </div>
      </article>
    </li>
  );
}

/**
 * "Templates" (board 17, ADR-030): the library of the workspace, by source, with a search that
 * ignores accents and filters by goal, industry and form. "Tạo trang cho" picks the site a page
 * would be made in: the thumbnails take its theme, and "Dùng mẫu" creates the draft there.
 */
export function TemplateLibrary({
  workspace,
  role,
  templates,
  sites,
  initialSiteId,
  tab,
}: TemplateLibraryProps) {
  const router = useRouter();
  const canCreate = can(role, 'pages.edit');
  const targets = canCreate ? sites : [];
  const [siteId, setSiteId] = useState<string | null>(
    sites.some((site) => site.id === initialSiteId) ? initialSiteId : (sites[0]?.id ?? null),
  );
  const [query, setQuery] = useState('');
  const [filters, setFilters] = useState<LibraryFilters>(NO_FILTERS);
  // The template of the dialog stays after it closes, so its content fades out with it.
  const [dialog, setDialog] = useState<{ templateId: string; open: boolean } | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const chipsRef = useRef<HTMLDivElement>(null);
  // Where focus goes once a removed chip has left the list: the chip now in its place.
  const chipFocus = useRef<number | null>(null);

  const site = sites.find((item) => item.id === siteId) ?? null;
  const themePresetId = site?.themePresetId ?? DEFAULT_THEME_PRESET;
  const libraryQuery = { tab, query, filters };
  const shown = visibleTemplates(templates, libraryQuery);
  const groups = filterGroups(templates, libraryQuery);
  const counts = tabCounts(templates);
  const chips = filterChips(filters);
  // Looked up on every render: after "Xem phiên bản mới" the list holds the new version.
  const using = templates.find((template) => template.id === dialog?.templateId) ?? null;

  // After a chip is removed, focus goes to the chip now in its place, or to the search.
  useEffect(() => {
    const index = chipFocus.current;
    if (index === null) {
      return;
    }
    chipFocus.current = null;
    const buttons = chipsRef.current?.querySelectorAll('button') ?? [];
    const next = buttons[Math.min(index, buttons.length - 1)];
    (next ?? searchRef.current)?.focus();
  }, [filters]);

  const empty = emptyMessage({ query, filters });

  return (
    <PageContainer>
      <PageHeader
        context={workspace.name}
        title="Templates"
        description="Chọn mẫu để tạo trang mới. Trang tạo từ mẫu là bản nháp riêng: sửa mẫu sau này không làm đổi trang đã tạo."
        actions={
          targets.length > 0 && siteId !== null ? (
            <div className={styles.siteChoice}>
              <label htmlFor="template-target-site" className={styles.siteLabel}>
                Tạo trang cho
              </label>
              <Select
                id="template-target-site"
                className={styles.siteSelect}
                value={siteId}
                onChange={(event) => {
                  setSiteId(event.target.value);
                }}
              >
                {targets.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </Select>
              <ButtonLink
                as={Link}
                href={newAiPageHref(siteId)}
                variant="secondary"
                leadingIcon={<SparklesIcon size={16} />}
              >
                Tạo bằng AI
              </ButtonLink>
            </div>
          ) : undefined
        }
      />

      {!canCreate ? (
        <Callout tone="info">
          Bạn xem được mọi mẫu. Chỉ {holdersOf('pages.edit')} tạo được trang từ mẫu.
        </Callout>
      ) : sites.length === 0 ? (
        <Callout
          tone="info"
          action={
            can(role, 'sites.manage') ? (
              <ButtonLink as={Link} href={newSiteHref(workspace.id)} variant="secondary" size="sm">
                Tạo site
              </ButtonLink>
            ) : undefined
          }
        >
          Chưa có site nào để tạo trang. Trang tạo từ mẫu nằm trong một site của workspace.
        </Callout>
      ) : null}

      <div className={styles.toolbar}>
        <TabsNav
          aria-label="Nguồn mẫu"
          as={Link}
          className={styles.tabs}
          items={libraryTabs.map((item) => ({
            href: templatesHref(workspace.id, librarySearch(item.tab, siteId)),
            label: `${item.label} · ${counts[item.tab]}`,
            current: item.tab === tab,
          }))}
        />
        <Field label="Tìm template" hideLabel id="template-search" className={styles.search}>
          <Input
            ref={searchRef}
            type="search"
            leadingIcon={<SearchIcon size={16} />}
            placeholder="Tìm theo tên, ngành, mục tiêu"
            autoComplete="off"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
            }}
          />
        </Field>
      </div>

      <div className={styles.layout}>
        <aside aria-label="Bộ lọc" className={styles.filters}>
          <fieldset className={styles.group}>
            <legend className={styles.legend}>MỤC TIÊU</legend>
            {groups.goals.map((option) => (
              <Checkbox
                key={option.value}
                className={styles.option}
                checked={option.checked}
                onChange={(event) => {
                  setFilters(withGoal(filters, option.value, event.target.checked));
                }}
                label={
                  <span className={styles.optionLabel}>
                    <span>{option.label}</span> <FilterCount count={option.count} />
                  </span>
                }
              />
            ))}
          </fieldset>
          <fieldset className={styles.group}>
            <legend className={styles.legend}>NGÀNH</legend>
            {groups.industries.map((option) => (
              <Checkbox
                key={option.value}
                className={styles.option}
                checked={option.checked}
                onChange={(event) => {
                  setFilters(withIndustry(filters, option.value, event.target.checked));
                }}
                label={
                  <span className={styles.optionLabel}>
                    <span>{option.label}</span> <FilterCount count={option.count} />
                  </span>
                }
              />
            ))}
          </fieldset>
          <fieldset className={styles.group}>
            <legend className={styles.legend}>KHÁC</legend>
            <Checkbox
              className={styles.option}
              checked={groups.withForm.checked}
              onChange={(event) => {
                setFilters({ ...filters, withForm: event.target.checked });
              }}
              label={
                <span className={styles.optionLabel}>
                  <span>{WITH_FORM_LABEL}</span> <FilterCount count={groups.withForm.count} />
                </span>
              }
            />
          </fieldset>
        </aside>

        <section aria-label="Kết quả" className={styles.results}>
          {/* The count follows every search and filter change, as a status (WCAG 4.1.3). */}
          <p role="status" className={styles.srOnly}>
            {shown.length} mẫu
          </p>
          {chips.length === 0 ? null : (
            <div className={styles.chips} ref={chipsRef}>
              <span className={styles.chipsLabel}>Đang lọc:</span>
              {chips.map((chip, index) => (
                <button
                  key={chip.key}
                  type="button"
                  className={styles.chip}
                  aria-label={`Bỏ lọc ${chip.label}`}
                  onClick={() => {
                    chipFocus.current = index;
                    setFilters(chip.without);
                  }}
                >
                  {chip.label}
                  <CloseIcon size={12} strokeWidth={2.4} />
                </button>
              ))}
            </div>
          )}
          {shown.length === 0 ? (
            <EmptyState
              className={styles.empty}
              icon={<GridIcon size={24} />}
              title={empty.title}
              description={empty.description}
              action={
                <div className={styles.emptyActions}>
                  {hasFilters(filters) || query.trim() !== '' ? (
                    <Button
                      variant="secondary"
                      onClick={() => {
                        setFilters(NO_FILTERS);
                        setQuery('');
                        searchRef.current?.focus();
                      }}
                    >
                      Xóa bộ lọc
                    </Button>
                  ) : null}
                  {/* No template fits: the AI drafts the page from a brief (board 17, ADR-031). */}
                  {canCreate && siteId !== null ? (
                    <ButtonLink as={Link} href={newAiPageHref(siteId)}>
                      Tạo bằng AI
                    </ButtonLink>
                  ) : null}
                </div>
              }
            />
          ) : (
            <ul className={styles.grid}>
              {shown.map((template) => (
                <TemplateCard
                  key={`${template.source}:${template.id}`}
                  template={template}
                  href={templateHref(workspace.id, template.id, siteId ?? undefined)}
                  themePresetId={themePresetId}
                  onUse={
                    targets.length > 0
                      ? () => {
                          setDialog({ templateId: template.id, open: true });
                        }
                      : null
                  }
                />
              ))}
            </ul>
          )}
        </section>
      </div>

      {using !== null && siteId !== null && targets.length > 0 ? (
        <CreateFromTemplateDialog
          workspaceId={workspace.id}
          template={using}
          sites={targets}
          initialSiteId={siteId}
          role={role}
          open={dialog?.open === true}
          onOpenChange={(open) => {
            setDialog((current) => (current === null ? null : { ...current, open }));
          }}
          onTemplateChanged={() => {
            router.refresh();
          }}
        />
      ) : null}
    </PageContainer>
  );
}
