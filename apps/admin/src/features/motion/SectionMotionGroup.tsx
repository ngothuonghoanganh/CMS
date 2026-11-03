'use client';

import {
  type MotionEnter,
  motionEnterIds,
  type MotionOrder,
  type SectionInstance,
} from '@plp/contracts';
import {
  MOTION_ACCENT_LABELS,
  MOTION_ENTER_LABELS,
  MOTION_ORDER_LABELS,
  MOTION_STYLES,
  motionCapabilityOf,
  pageAccentOn,
  pageMotionOf,
} from '@plp/sections/schema';
import { Button, LockIcon, Switch } from '@plp/ui';
import { useState } from 'react';
import { useEditor, useEditorServices, useEditorStoreApi } from '../editor/editor-context';
import { ENTER_DESCRIPTIONS, lockReasonOf, styleSample } from './motion-view';
import styles from './SectionMotionGroup.module.css';
import { StyleSample } from './StyleSample';

const ORDER_BOXES: Readonly<Record<MotionOrder, readonly number[]>> = {
  together: [1, 1, 1],
  stagger: [1, 2, 3],
  rows: [1, 1, 2, 2],
};

/** Id of the group's heading, focused by "Chỉnh riêng cho từng section" of board 37. */
export function sectionMotionHeadingId(sectionId: string): string {
  return `section-motion-${sectionId}`;
}

export interface SectionMotionGroupProps {
  section: SectionInstance;
  index: number;
}

/**
 * Board 38, "HIỆU ỨNG XUẤT HIỆN" (ADR-032): how this section enters, in which order and with which
 * accents, each following the page until changed here. The navigation bar and the first section
 * always show at once.
 */
export function SectionMotionGroup({ section, index }: SectionMotionGroupProps) {
  const store = useEditorStoreApi();
  const { openPageMotion } = useEditorServices();
  const composition = useEditor((state) => state.draft.composition);
  const [played, setPlayed] = useState<{ enter: MotionEnter | null; run: number }>({
    enter: null,
    run: 0,
  });
  const motion = pageMotionOf(composition);
  const headingId = sectionMotionHeadingId(section.id);
  const lockReason = lockReasonOf(composition.sections, index);
  const heading = (
    <h3 id={headingId} className={styles.groupTitle} tabIndex={-1}>
      HIỆU ỨNG XUẤT HIỆN
    </h3>
  );

  if (motion.style === 'none') {
    return (
      <section className={styles.group} aria-labelledby={headingId}>
        {heading}
        <p className={styles.help}>
          Trang đang để Không hiệu ứng, nên mọi section hiện ngay. Chọn một phong cách ở Cài đặt
          trang để section chuyển động.
        </p>
        <Button size="sm" variant="secondary" onClick={openPageMotion}>
          Mở Cài đặt trang
        </Button>
      </section>
    );
  }

  if (lockReason !== null) {
    return (
      <section className={styles.group} aria-labelledby={headingId}>
        {heading}
        <p className={styles.locked}>
          <LockIcon size={16} />
          Luôn hiện ngay
        </p>
        <p className={styles.help}>{lockReason}</p>
      </section>
    );
  }

  const style = MOTION_STYLES[motion.style];
  const own = section.motion ?? {};
  const capability = motionCapabilityOf(section);
  const enter = own.enter ?? style.enter;
  const pageOrder = style.order === 'rows' && !capability.grid ? 'stagger' : style.order;
  const order = own.order ?? pageOrder;
  const orders: MotionOrder[] = capability.grid
    ? ['together', 'stagger', 'rows']
    : ['together', 'stagger'];
  const status = (overridden: boolean) =>
    overridden ? 'Riêng cho section này' : 'Theo cài đặt trang';

  return (
    <section className={styles.group} aria-labelledby={headingId}>
      {heading}

      <div className={styles.row}>
        <span className={styles.rowHeader}>
          <span className={styles.rowLabel}>Cách xuất hiện</span>
          <span className={own.enter === undefined ? styles.status : styles.statusOwn}>
            {status(own.enter !== undefined)}
          </span>
        </span>
        <div role="group" aria-label="Cách xuất hiện" className={styles.tiles}>
          {motionEnterIds.map((id) => (
            <button
              key={id}
              type="button"
              aria-pressed={id === enter}
              className={styles.tile}
              onClick={() => {
                if (store.getState().setSectionEnter(section.id, id)) {
                  setPlayed((current) => ({ enter: id, run: current.run + 1 }));
                }
              }}
            >
              <StyleSample
                layout="thumb"
                motion={styleSample(motion.style, motion.level, id)}
                level={motion.level}
                play={played.enter === id ? played.run : 0}
              />
              <span className={styles.tileName}>{MOTION_ENTER_LABELS[id]}</span>
              {id === enter && own.enter === undefined ? (
                <span className={styles.follow}>theo trang</span>
              ) : null}
            </button>
          ))}
        </div>
        <p className={styles.help}>{ENTER_DESCRIPTIONS[enter]}</p>
        {own.enter === undefined ? null : (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              store.getState().setSectionEnter(section.id, null);
            }}
          >
            Dùng lại cài đặt trang ({MOTION_ENTER_LABELS[style.enter]})
          </Button>
        )}
      </div>

      {enter === 'none' ? null : (
        <>
          <div className={styles.row}>
            <span className={styles.rowHeader}>
              <span className={styles.rowLabel}>Thứ tự trong section</span>
              <span className={own.order === undefined ? styles.status : styles.statusOwn}>
                {status(own.order !== undefined)}
              </span>
            </span>
            <div role="group" aria-label="Thứ tự trong section" className={styles.orders}>
              {orders.map((id) => (
                <button
                  key={id}
                  type="button"
                  aria-pressed={id === order}
                  className={styles.order}
                  onClick={() => {
                    store.getState().setSectionOrder(section.id, id);
                  }}
                >
                  <span
                    aria-hidden="true"
                    className={id === 'rows' ? styles.boxesRows : styles.boxes}
                  >
                    {ORDER_BOXES[id].map((n, box) => (
                      <span key={box} className={styles.box}>
                        {n}
                      </span>
                    ))}
                  </span>
                  {MOTION_ORDER_LABELS[id]}
                </button>
              ))}
            </div>
            {own.order === undefined ? null : (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  store.getState().setSectionOrder(section.id, null);
                }}
              >
                Dùng lại cài đặt trang ({MOTION_ORDER_LABELS[pageOrder]})
              </Button>
            )}
          </div>

          <div className={styles.row}>
            <span className={styles.rowLabel}>Điểm nhấn</span>
            {capability.accents.length === 0 ? (
              <p className={styles.help}>
                Section này không có nội dung cho điểm nhấn (tiêu đề nhiều dòng, ảnh, số liệu hay
                các bước).
              </p>
            ) : (
              capability.accents.map((accent) => {
                const changed = own.accents?.[accent];
                const pageOn = pageAccentOn(motion, accent);
                return (
                  <Switch
                    key={accent}
                    label={MOTION_ACCENT_LABELS[accent]}
                    description={status(changed !== undefined)}
                    checked={changed ?? pageOn}
                    onCheckedChange={(on) => {
                      // Switched back to what the page says: the section follows the page again.
                      store
                        .getState()
                        .setSectionAccent(section.id, accent, on === pageOn ? null : on);
                    }}
                  />
                );
              })
            )}
          </div>

          {motion.reduceOnMobile && (enter !== 'fade' || order !== 'together') ? (
            <p className={styles.help}>
              Trên điện thoại: chỉ hiện dần, cùng lúc, theo Cài đặt trang.
            </p>
          ) : null}
        </>
      )}

      <p className={styles.help}>
        Section đứng yên khi bạn chỉnh sửa. Chạy thử để xem như khách thấy.
      </p>
      <div className={styles.actions}>
        <Button
          size="sm"
          variant="secondary"
          onClick={() => {
            store.getState().playMotion({ kind: 'section', sectionId: section.id });
          }}
        >
          Chạy thử section này
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => {
            store.getState().playMotion({ kind: 'page' });
          }}
        >
          Chạy thử cả trang
        </Button>
      </div>
    </section>
  );
}
