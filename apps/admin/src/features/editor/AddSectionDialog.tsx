'use client';

import { MAX_SECTIONS } from '@plp/contracts';
import { bodyInsertionIndex, getSectionDefinition, insertionIndex } from '@plp/sections/schema';
import { Badge, Button, Dialog, InfoCircleIcon, Input, SearchIcon, VisuallyHidden } from '@plp/ui';
import { useMemo, useRef, useState } from 'react';
import styles from './AddSectionDialog.module.css';
import { useEditor, useEditorServices, useEditorStoreApi } from './editor-context';
import { buildCatalog, type CatalogCard, categoriesOf, filterCatalog } from './section-catalog';
import { SectionThumbnail } from './SectionThumbnail';

export interface AddSectionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Where the user asked to insert; fixed-position sections still go first or last. */
  requestedIndex: number;
}

/** "Thêm section": pick a section variant by category or search and insert it into the draft. */
export function AddSectionDialog({ open, onOpenChange, requestedIndex }: AddSectionDialogProps) {
  const store = useEditorStoreApi();
  const { announce } = useEditorServices();
  const sections = useEditor((state) => state.draft.composition.sections);
  const goal = useEditor((state) => state.page.goal);
  const searchRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<CatalogCard['category'] | null>(null);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);

  const catalog = useMemo(() => buildCatalog(sections, goal), [sections, goal]);
  const matches = useMemo(() => filterCatalog(catalog, query), [catalog, query]);
  const categories = useMemo(() => categoriesOf(matches), [matches]);
  // Without a choice, open the first category that has something to add (the navigation bar is
  // usually already on the page).
  const firstAddable = matches.find((card) => card.unavailableReason === null)?.category;
  const activeCategory =
    categories.find((item) => item.id === (category ?? firstAddable)) ?? categories[0] ?? null;
  const cards = matches.filter((card) => card.category === activeCategory?.id);
  const available = cards.filter((card) => card.unavailableReason === null);
  const selected = available.find((card) => card.key === selectedKey) ?? available[0] ?? null;

  const full = sections.length >= MAX_SECTIONS;
  const trimmedQuery = query.trim();
  // Search results change while typing; screen readers hear how many sections match.
  const searchStatus =
    trimmedQuery === ''
      ? ''
      : matches.length === 0
        ? `Không tìm thấy section phù hợp với “${trimmedQuery}”.`
        : `${matches.length} section phù hợp với “${trimmedQuery}”.`;
  // With nothing selectable in the open group, show where a section of the page body would go.
  const index = selected
    ? insertionIndex(sections, selected.type, requestedIndex)
    : bodyInsertionIndex(sections, requestedIndex);
  const previous = sections[index - 1];
  const position = `vị trí ${index + 1} / ${sections.length + 1}`;

  function add() {
    if (!selected || full) {
      return;
    }
    if (store.getState().addSection(selected.type, selected.variant, requestedIndex)) {
      announce(`Đã thêm ${selected.sectionLabel} ở vị trí ${index + 1}.`);
      onOpenChange(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      size="lg"
      flush
      title="Thêm section"
      initialFocusRef={searchRef}
      description={
        previous ? (
          <>
            Chèn sau <strong>{getSectionDefinition(previous.type).label}</strong> · {position}
          </>
        ) : (
          <>Chèn vào đầu trang · {position}</>
        )
      }
      headerActions={
        <Input
          ref={searchRef}
          type="search"
          aria-label="Tìm section"
          placeholder="Tìm: nhận xét, câu hỏi, chân trang…"
          leadingIcon={<SearchIcon size={18} />}
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
          }}
          className={styles.search}
        />
      }
      footerStart={
        <span className={styles.note}>
          <InfoCircleIcon size={18} />
          {full
            ? `Một trang có tối đa ${MAX_SECTIONS} section. Xóa bớt section để thêm mới.`
            : 'Section mới có nội dung mẫu được đánh dấu. Trang sẽ nhắc nếu còn nội dung mẫu khi xuất bản.'}
        </span>
      }
      footer={
        <>
          <Button
            variant="secondary"
            onClick={() => {
              onOpenChange(false);
            }}
          >
            Hủy
          </Button>
          <Button disabled={!selected || full} onClick={add}>
            {selected ? `Thêm “${selected.name}”` : 'Thêm section'}
          </Button>
        </>
      }
    >
      <div className={styles.body}>
        <VisuallyHidden aria-live="polite">{searchStatus}</VisuallyHidden>
        <nav aria-label="Nhóm section" className={styles.categories}>
          <ul className={styles.categoryList}>
            {categories.map((item) => {
              const current = item.id === activeCategory?.id;
              return (
                <li key={item.id}>
                  <button
                    type="button"
                    aria-pressed={current}
                    className={styles.category}
                    onClick={() => {
                      setCategory(item.id);
                      setSelectedKey(null);
                    }}
                  >
                    <span>{item.label}</span>
                    <span className={styles.count}>{item.count}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </nav>
        <section aria-labelledby="add-section-grid-title" className={styles.gridPane}>
          <div className={styles.gridHeader}>
            <h2 id="add-section-grid-title" className={styles.gridTitle}>
              {activeCategory?.label ?? 'Không có kết quả'}
            </h2>
            <span className={styles.gridHint}>
              Mọi section tự co giãn theo màn hình và dùng màu của site
            </span>
          </div>
          {cards.length === 0 ? (
            <p className={styles.empty}>Không tìm thấy section phù hợp với “{query.trim()}”.</p>
          ) : (
            <div className={styles.grid}>
              {cards.map((card) => {
                const unavailable = card.unavailableReason !== null;
                const pressed = card.key === selected?.key;
                return (
                  <button
                    key={card.key}
                    type="button"
                    aria-pressed={pressed}
                    aria-disabled={unavailable ? true : undefined}
                    className={styles.card}
                    onClick={() => {
                      if (!unavailable) {
                        setSelectedKey(card.key);
                      }
                    }}
                    onDoubleClick={() => {
                      if (!unavailable) {
                        setSelectedKey(card.key);
                        add();
                      }
                    }}
                  >
                    <SectionThumbnail type={card.type} variant={card.variant} />
                    <span className={styles.cardTitleRow}>
                      <span className={styles.cardTitle}>{card.name}</span>
                      {card.recommended && !unavailable ? (
                        <Badge tone="info" size="sm">
                          Hợp mục tiêu
                        </Badge>
                      ) : null}
                      {unavailable ? (
                        <Badge tone="neutral" size="sm">
                          {card.unavailableReason}
                        </Badge>
                      ) : null}
                    </span>
                    <span className={styles.cardDescription}>{card.description}</span>
                  </button>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </Dialog>
  );
}
