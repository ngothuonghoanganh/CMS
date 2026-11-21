'use client';

import {
  type Access,
  can,
  DEFAULT_THEME_PRESET,
  type MarketplaceItemCard,
  type MarketplaceListResponse,
  type MarketplacePriceFilter,
  marketplacePriceFilterLabels,
  marketplacePriceFilters,
  type MarketplaceSort,
  marketplaceSortLabels,
  marketplaceSorts,
  type Membership,
  type TemplateIndustry,
  templateIndustries,
  templateIndustryLabels,
} from '@plp/contracts';
import {
  Badge,
  Button,
  ButtonLink,
  EmptyState,
  Field,
  Input,
  SearchIcon,
  Select,
  StoreIcon,
} from '@plp/ui';
import Link from 'next/link';
import { useId, useRef, useState } from 'react';
import { marketplaceItemHref, newAiPageHref, templatesHref } from '../shell/navigation';
import { PageContainer, PageHeader } from '../shell/PageHeader';
import { goalLabel } from '../templates/library-filters';
import { TemplateThumb } from '../templates/TemplateThumb';
import {
  cardPriceLabel,
  hasMarketplaceFilters,
  type MarketplaceQuery,
  NO_MARKETPLACE_FILTERS,
  visibleItems,
} from './marketplace-filters';
import styles from './MarketplaceScreen.module.css';

export interface MarketplaceScreenProps {
  workspace: Membership['workspace'];
  role: Access;
  catalog: MarketplaceListResponse;
  /** The site "Tạo bằng AI" would draft a page for: the one opened last; null without a site. */
  aiSiteId: string | null;
}

function ItemCard({ item, workspaceId }: { item: MarketplaceItemCard; workspaceId: string }) {
  const headingId = useId();
  return (
    <li className={styles.cardItem}>
      <article className={styles.card} aria-labelledby={headingId}>
        <div className={styles.thumbArea}>
          <TemplateThumb
            sections={item.sections}
            themePresetId={DEFAULT_THEME_PRESET}
            label={`Bản xem thu nhỏ: ${item.name}`}
          />
        </div>
        <div className={styles.cardBody}>
          <div className={styles.cardTop}>
            <span className={styles.industry}>{templateIndustryLabels[item.industry]}</span>
            <Badge
              size="sm"
              tone={item.owned ? 'success' : item.price === 0 ? 'primary' : 'neutral'}
            >
              {cardPriceLabel(item)}
            </Badge>
          </div>
          <h2 id={headingId} className={styles.cardTitle}>
            {/* The link covers the whole card, so the thumbnail is clickable without a second link. */}
            <Link href={marketplaceItemHref(workspaceId, item.id)} className={styles.cardLink}>
              {item.name}
            </Link>
          </h2>
          <p className={styles.cardMeta}>
            {goalLabel(item.goal)} · {item.sections.length} section
            {item.hasForm ? ' · Có form' : ''}
          </p>
        </div>
      </article>
    </li>
  );
}

/**
 * "Marketplace" (board 30, ADR-036): the templates Payload sells or gives, with a search that
 * ignores accents, a price filter, one chip per industry and a sort. Browsing only: getting or
 * buying a template comes with the licences (MP2, MP3). Every filter runs here, over the whole
 * catalog (at most 100 items).
 */
export function MarketplaceScreen({ workspace, role, catalog, aiSiteId }: MarketplaceScreenProps) {
  const [filters, setFilters] = useState<MarketplaceQuery>(NO_MARKETPLACE_FILTERS);
  const searchRef = useRef<HTMLInputElement>(null);
  const shown = visibleItems(catalog.items, filters);
  const filtered = hasMarketplaceFilters(filters);
  const search = filters.query.trim();

  const setIndustry = (industry: TemplateIndustry | null) => {
    setFilters((current) => ({ ...current, industry }));
  };

  return (
    <PageContainer>
      <PageHeader
        title="Marketplace"
        description={
          <span className={styles.lead}>
            Mẫu do Payload soạn. Mẫu bạn nhận hoặc mua sẽ có trong Templates của workspace.
          </span>
        }
        actions={
          // The list of what the workspace owns is board 32, built with the licences (MP2).
          <span className={styles.owned}>Đã sở hữu · {catalog.ownedCount}</span>
        }
      />

      <div className={styles.toolbar}>
        <Field
          label="Tìm trên marketplace"
          hideLabel
          id="marketplace-search"
          className={styles.search}
        >
          <Input
            ref={searchRef}
            type="search"
            leadingIcon={<SearchIcon size={16} />}
            placeholder="Tìm mẫu, ngành, mục tiêu"
            autoComplete="off"
            value={filters.query}
            onChange={(event) => {
              const query = event.target.value;
              setFilters((current) => ({ ...current, query }));
            }}
          />
        </Field>
        <Field label="Giá" hideLabel id="marketplace-price">
          <Select
            value={filters.price}
            onChange={(event) => {
              const price = event.target.value as MarketplacePriceFilter;
              setFilters((current) => ({ ...current, price }));
            }}
          >
            {marketplacePriceFilters.map((value) => (
              <option key={value} value={value}>
                {marketplacePriceFilterLabels[value]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Sắp xếp" hideLabel id="marketplace-sort">
          <Select
            value={filters.sort}
            onChange={(event) => {
              const sort = event.target.value as MarketplaceSort;
              setFilters((current) => ({ ...current, sort }));
            }}
          >
            {marketplaceSorts.map((value) => (
              <option key={value} value={value}>
                {marketplaceSortLabels[value]}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      <div role="group" aria-label="Ngành" className={styles.chips}>
        <button
          type="button"
          className={styles.chip}
          aria-pressed={filters.industry === null}
          onClick={() => {
            setIndustry(null);
          }}
        >
          Tất cả
        </button>
        {templateIndustries.map((industry) => (
          <button
            key={industry}
            type="button"
            className={styles.chip}
            aria-pressed={filters.industry === industry}
            onClick={() => {
              setIndustry(filters.industry === industry ? null : industry);
            }}
          >
            {templateIndustryLabels[industry]}
          </button>
        ))}
      </div>

      {/* The count follows every search and filter change, as a status (WCAG 4.1.3). */}
      <p role="status" className={styles.srOnly}>
        {shown.length} mẫu
      </p>

      {shown.length === 0 ? (
        <EmptyState
          className={styles.empty}
          icon={<StoreIcon size={24} />}
          title={
            catalog.items.length === 0
              ? 'Marketplace chưa có mẫu nào'
              : search !== ''
                ? `Marketplace chưa có mẫu khớp “${search}”`
                : 'Marketplace chưa có mẫu khớp bộ lọc'
          }
          description={
            catalog.items.length === 0
              ? 'Mẫu hệ thống trong Templates và Tạo bằng AI dùng được ngay.'
              : 'Thử đổi từ khóa hoặc bỏ bớt bộ lọc. Mẫu hệ thống trong Templates hoặc Tạo bằng AI có thể hợp với ngành của bạn.'
          }
          action={
            <div className={styles.emptyActions}>
              {filtered ? (
                <Button
                  variant="secondary"
                  onClick={() => {
                    setFilters((current) => ({
                      ...NO_MARKETPLACE_FILTERS,
                      sort: current.sort,
                    }));
                    searchRef.current?.focus();
                  }}
                >
                  Xóa bộ lọc
                </Button>
              ) : null}
              <ButtonLink
                as={Link}
                href={templatesHref(workspace.id, '?source=system')}
                variant="secondary"
              >
                Xem mẫu hệ thống
              </ButtonLink>
              {/* The AI drafts a page in a site, so it needs one and the right to edit pages. */}
              {can(role, 'pages.edit') && aiSiteId !== null ? (
                <ButtonLink as={Link} href={newAiPageHref(aiSiteId)}>
                  Tạo bằng AI
                </ButtonLink>
              ) : null}
            </div>
          }
        />
      ) : (
        <ul className={styles.grid}>
          {shown.map((item) => (
            <ItemCard key={item.id} item={item} workspaceId={workspace.id} />
          ))}
        </ul>
      )}
    </PageContainer>
  );
}
