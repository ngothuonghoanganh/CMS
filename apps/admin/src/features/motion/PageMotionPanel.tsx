'use client';

import { type MotionLevel, motionAccentIds, motionLevelIds, motionStyleIds } from '@plp/contracts';
import {
  isMotionLocked,
  MOTION_ACCENT_LABELS,
  MOTION_LEVELS,
  MOTION_STYLES,
  pageAccentOn,
  pageMotionOf,
} from '@plp/sections/schema';
import {
  Badge,
  Button,
  Callout,
  Checkbox,
  ChevronDownIcon,
  SegmentedControl,
  Switch,
} from '@plp/ui';
import { useId, useState } from 'react';
import { useEditor, useEditorServices, useEditorStoreApi } from '../editor/editor-context';
import { ACCENT_DESCRIPTIONS, motionFitsOf, styleSample, templateMotionOf } from './motion-view';
import styles from './PageMotionPanel.module.css';
import { StyleSample } from './StyleSample';

/** Id of the panel's first heading, focused by "Chuyển động · …" of the page structure. */
export const PAGE_MOTION_HEADING_ID = 'page-motion-heading';

/**
 * Board 37, "Cài đặt trang → Phong cách chuyển động" (ADR-032): the page's style, how strongly it
 * moves and its accents, phones, and "Chạy thử". Every control runs a store command; each change
 * is one undo step of the draft, published with it.
 */
export interface PageMotionPanelProps {
  /** "Chỉnh riêng cho từng section": opens that section's motion. Defaults to selecting it. */
  onEditSection?: ((sectionId: string) => void) | undefined;
}

export function PageMotionPanel({ onEditSection }: PageMotionPanelProps = {}) {
  const store = useEditorStoreApi();
  const { openMotionLibrary, announce } = useEditorServices();
  const composition = useEditor((state) => state.draft.composition);
  const createdFrom = useEditor((state) => state.createdFrom);
  const slow = useEditor((state) => state.motionPlay.slow);
  const reduced = useEditor((state) => state.motionPlay.reduced);
  const motion = pageMotionOf(composition);
  const style = MOTION_STYLES[motion.style];
  const still = motion.style === 'none';
  const fits = motionFitsOf(createdFrom);
  const fromTemplate = templateMotionOf(createdFrom);
  const [expanded, setExpanded] = useState(true);
  // A picked style plays its sample once, so the choice shows how it moves.
  const [played, setPlayed] = useState<{ style: string; run: number }>({ style: '', run: 0 });
  const advancedId = useId();

  function pickStyle(next: (typeof motionStyleIds)[number]) {
    if (store.getState().setMotionStyle(next)) {
      setPlayed((current) => ({ style: next, run: current.run + 1 }));
      announce(`Đã chọn phong cách ${MOTION_STYLES[next].label}.`);
    }
  }

  function firstMovingSection() {
    const sections = store.getState().draft.composition.sections;
    return sections.find((_section, index) => !isMotionLocked(sections, index)) ?? null;
  }

  return (
    <div className={styles.panel}>
      {fromTemplate !== null && (motion.style === fromTemplate || still) ? (
        <Callout
          tone="info"
          action={
            <Button
              size="sm"
              variant="secondary"
              onClick={() => {
                pickStyle(still ? fromTemplate : 'none');
              }}
            >
              {still ? 'Dùng lại phong cách của template' : 'Tắt toàn bộ hiệu ứng'}
            </Button>
          }
        >
          {still
            ? 'Đã tắt toàn bộ chuyển động mà template chọn sẵn.'
            : `Template đã dùng chọn sẵn phong cách ${MOTION_STYLES[fromTemplate].label}. Bạn có thể đổi hoặc tắt.`}
        </Callout>
      ) : null}

      <section className={styles.group} aria-labelledby={PAGE_MOTION_HEADING_ID}>
        <div className={styles.groupHeader}>
          <h3 id={PAGE_MOTION_HEADING_ID} className={styles.groupTitle} tabIndex={-1}>
            PHONG CÁCH CHUYỂN ĐỘNG
          </h3>
          <Button size="sm" variant="ghost" onClick={openMotionLibrary}>
            So sánh
          </Button>
        </div>
        <div role="group" aria-label="Phong cách chuyển động" className={styles.styles}>
          {motionStyleIds.map((id) => {
            const definition = MOTION_STYLES[id];
            const chosen = id === motion.style;
            return (
              <button
                key={id}
                type="button"
                aria-pressed={chosen}
                className={styles.style}
                onClick={() => {
                  pickStyle(id);
                }}
              >
                <StyleSample
                  layout="thumb"
                  motion={styleSample(id, motion.level)}
                  level={motion.level}
                  play={played.style === id ? played.run : 0}
                  selected={chosen}
                />
                <span className={styles.styleName}>
                  {definition.label}
                  {id === 'none' ? (
                    <Badge size="sm" tone="neutral">
                      Mặc định
                    </Badge>
                  ) : null}
                  {fits.includes(id) ? (
                    <Badge size="sm" tone="success">
                      Hợp ngành
                    </Badge>
                  ) : null}
                </span>
                <span className={styles.trait}>{definition.trait}</span>
              </button>
            );
          })}
        </div>
        <p className={styles.summary}>
          {style.summary} <span className={styles.fits}>Hợp với: {style.fits}.</span>
        </p>
      </section>

      <section className={styles.group}>
        <button
          type="button"
          className={styles.disclosure}
          aria-expanded={expanded}
          aria-controls={advancedId}
          onClick={() => {
            setExpanded((current) => !current);
          }}
        >
          <span className={styles.groupTitle}>TÙY CHỈNH THÊM</span>
          <ChevronDownIcon size={16} className={expanded ? styles.chevronOpen : styles.chevron} />
        </button>
        <div id={advancedId} hidden={!expanded} className={styles.advanced}>
          {still ? (
            <p className={styles.help}>Chọn một phong cách để chỉnh mức độ và điểm nhấn.</p>
          ) : (
            <>
              <div className={styles.row}>
                <span className={styles.rowLabel} id={`${advancedId}-level`}>
                  Mức độ
                </span>
                <SegmentedControl<MotionLevel>
                  aria-label="Mức độ chuyển động"
                  fullWidth
                  value={motion.level}
                  options={motionLevelIds.map((level) => ({
                    value: level,
                    label: MOTION_LEVELS[level].label,
                  }))}
                  onChange={(level) => {
                    store.getState().setMotionLevel(level);
                  }}
                />
                <p className={styles.help}>
                  Hệ thống tự chọn thời lượng, khoảng dịch chuyển và độ trễ theo mức này.
                </p>
              </div>
              <div className={styles.row}>
                <span className={styles.rowLabel}>Điểm nhấn</span>
                <p className={styles.help}>Chỉ chạy ở section có loại nội dung tương ứng.</p>
                {motionAccentIds.map((accent) => (
                  <Switch
                    key={accent}
                    label={MOTION_ACCENT_LABELS[accent]}
                    description={`${ACCENT_DESCRIPTIONS[accent]} · ${
                      motion.accents[accent] === undefined ? 'theo phong cách' : 'đã chỉnh'
                    }`}
                    checked={pageAccentOn(motion, accent)}
                    onCheckedChange={(on) => {
                      store.getState().setMotionAccent(accent, on);
                    }}
                  />
                ))}
              </div>
            </>
          )}
        </div>
      </section>

      <section className={styles.group} aria-labelledby={`${advancedId}-device`}>
        <h3 id={`${advancedId}-device`} className={styles.groupTitle}>
          THEO THIẾT BỊ
        </h3>
        <Switch
          label="Giảm chuyển động trên điện thoại"
          description={
            still
              ? 'Trang đang không có hiệu ứng nên chưa áp dụng.'
              : 'Trên điện thoại chỉ hiện dần; tắt trượt, hé lộ và vẽ đường nối.'
          }
          checked={motion.reduceOnMobile}
          onCheckedChange={(on) => {
            store.getState().setMotionReduceOnMobile(on);
          }}
        />
        <p className={styles.note}>
          Khách đã bật <strong>Giảm chuyển động</strong> trên thiết bị sẽ thấy nội dung hiện ngay,
          số liệu hiện giá trị thật, kể cả khi trang đã bật hiệu ứng.
        </p>
      </section>

      <section className={styles.group} aria-labelledby={`${advancedId}-feedback`}>
        <h3 id={`${advancedId}-feedback`} className={styles.groupTitle}>
          PHẢN HỒI KHI THAO TÁC
        </h3>
        <p className={styles.help}>
          Di chuột lên nút, mở câu hỏi và gửi form phản hồi theo hệ thống thiết kế, giống nhau ở mọi
          phong cách.
        </p>
      </section>

      <div className={styles.run}>
        <Button
          variant="secondary"
          fullWidth
          onClick={() => {
            store.getState().playMotion({ kind: 'page' });
          }}
        >
          Chạy thử hiệu ứng
        </Button>
        <Checkbox
          label="Xem chậm (¼ tốc độ)"
          checked={slow}
          onChange={(event) => {
            store.getState().setMotionSlow(event.target.checked);
          }}
        />
        <Checkbox
          label="Như thiết bị bật giảm chuyển động"
          checked={reduced}
          onChange={(event) => {
            store.getState().setMotionReduced(event.target.checked);
          }}
        />
        <p className={styles.note}>
          Lưu vào bản nháp. Trang live chỉ đổi khi bạn xuất bản; khôi phục phiên bản cũ sẽ khôi phục
          cả chuyển động.
        </p>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            const section = firstMovingSection();
            if (section === null) {
              return;
            }
            if (onEditSection) {
              onEditSection(section.id);
            } else {
              store.getState().select(section.id);
            }
          }}
        >
          Chỉnh riêng cho từng section
        </Button>
      </div>
    </div>
  );
}
