'use client';

import {
  type MotionEnter,
  type MotionLevel,
  motionLevelIds,
  type MotionOrder,
  type MotionStyle,
  motionStyleIds,
} from '@plp/contracts';
import {
  MOTION_ACCENT_LABELS,
  MOTION_LEVELS,
  MOTION_STYLES,
  pageMotionOf,
} from '@plp/sections/schema';
import { Badge, Button, Dialog, SegmentedControl, VisuallyHidden } from '@plp/ui';
import { useState } from 'react';
import { useEditor, useEditorServices, useEditorStoreApi } from '../editor/editor-context';
import styles from './MotionStyleLibraryDialog.module.css';
import { motionFitsOf, styleSample } from './motion-view';
import { StyleSample } from './StyleSample';

const ENTER_NAMES: Readonly<Record<MotionEnter, string>> = {
  none: 'Hiện ngay',
  fade: 'Hiện dần',
  up: 'Trượt lên',
  side: 'Trượt từ bên theo bố cục',
  zoom: 'Phóng nhẹ',
  pop: 'Bật lên, có độ nảy',
  reveal: 'Hé lộ chậm',
};

const ORDER_NAMES: Readonly<Record<MotionOrder, string>> = {
  together: 'Cùng lúc',
  stagger: 'Lần lượt từng phần',
  rows: 'Theo từng hàng',
};

export interface MotionStyleLibraryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Board 39, "Thư viện phong cách chuyển động" (ADR-032): the six styles side by side, each playing a
 * sample page. "Áp dụng" sets the style through the same command as board 37; the level here only
 * changes the samples, the page's level stays with its own control.
 */
export function MotionStyleLibraryDialog({ open, onOpenChange }: MotionStyleLibraryDialogProps) {
  const store = useEditorStoreApi();
  const { announce } = useEditorServices();
  const motion = useEditor((state) => pageMotionOf(state.draft.composition));
  const createdFrom = useEditor((state) => state.createdFrom);
  const pageTitle = useEditor((state) => state.page.title);
  const [level, setLevel] = useState<MotionLevel>(motion.level);
  const [picked, setPicked] = useState<MotionStyle>(motion.style);
  const [play, setPlay] = useState<{ target: MotionStyle | 'all' | null; run: number }>({
    target: null,
    run: 0,
  });
  const fits = motionFitsOf(createdFrom);
  const changed = picked !== motion.style;

  function playOf(target: MotionStyle | 'all') {
    setPlay((current) => ({ target, run: current.run + 1 }));
  }

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      size="lg"
      title="Phong cách chuyển động"
      description={`Cài đặt trang · ${pageTitle}`}
      headerActions={
        <div className={styles.actions}>
          <SegmentedControl<MotionLevel>
            aria-label="Mức độ khi xem thử"
            value={level}
            options={motionLevelIds.map((id) => ({ value: id, label: MOTION_LEVELS[id].label }))}
            onChange={setLevel}
          />
          <Button
            size="sm"
            variant="secondary"
            onClick={() => {
              playOf('all');
            }}
          >
            Xem thử tất cả
          </Button>
        </div>
      }
      footerStart={
        <div className={styles.footerText}>
          <p className={styles.footerTitle}>
            {changed
              ? `Đổi từ ${MOTION_STYLES[motion.style].label} sang ${MOTION_STYLES[picked].label}`
              : `Đang dùng ${MOTION_STYLES[motion.style].label}`}
          </p>
          <p className={styles.footerNote}>
            Chỉ đổi bản nháp, hoàn tác được. Phản hồi khi thao tác (hover nút, mở câu hỏi, gửi form)
            giống nhau ở mọi phong cách.
          </p>
        </div>
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
          <Button
            disabled={!changed}
            onClick={() => {
              if (store.getState().setMotionStyle(picked)) {
                announce(`Đã áp dụng phong cách ${MOTION_STYLES[picked].label}.`);
                onOpenChange(false);
              }
            }}
          >
            {changed
              ? `Áp dụng ${MOTION_STYLES[picked].label}`
              : `Đang dùng ${MOTION_STYLES[picked].label}`}
          </Button>
        </>
      }
    >
      <p className={styles.intro}>
        Mỗi phong cách quy định cách section xuất hiện, thứ tự các phần và điểm nhấn. Bấm Xem thử để
        so sánh. Thời lượng và độ trễ do hệ thống chọn; phần đầu trang luôn hiện ngay.
      </p>
      <ul className={styles.cards}>
        {motionStyleIds.map((id) => {
          const definition = MOTION_STYLES[id];
          const chosen = id === picked;
          const accents = definition.accents.map((accent) =>
            MOTION_ACCENT_LABELS[accent].toLowerCase(),
          );
          return (
            <li key={id} className={chosen ? `${styles.card} ${styles.chosen}` : styles.card}>
              <StyleSample
                layout="page"
                motion={styleSample(id, level)}
                level={level}
                play={play.target === id || play.target === 'all' ? play.run : 0}
              />
              <h3 className={styles.name}>{definition.label}</h3>
              <span className={styles.badges}>
                {id === motion.style ? <Badge tone="primary">Đang dùng</Badge> : null}
                {id === 'none' ? <Badge tone="neutral">Mặc định cho trang mới</Badge> : null}
                {fits.includes(id) ? <Badge tone="success">Hợp ngành</Badge> : null}
              </span>
              <dl className={styles.facts}>
                <dt>Xuất hiện</dt>
                <dd>{ENTER_NAMES[definition.enter]}</dd>
                <dt>Thứ tự</dt>
                <dd>{definition.enter === 'none' ? '—' : ORDER_NAMES[definition.order]}</dd>
                <dt>Điểm nhấn</dt>
                <dd>
                  {accents.length === 0
                    ? 'Không có'
                    : `${accents.join(', ').charAt(0).toUpperCase()}${accents.join(', ').slice(1)}`}
                </dd>
              </dl>
              <p className={styles.fits}>Hợp với: {definition.fits}</p>
              <span className={styles.cardActions}>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={id === 'none'}
                  onClick={() => {
                    playOf(id);
                  }}
                >
                  {id === 'none' ? 'Không chuyển động' : 'Xem thử'}{' '}
                  <VisuallyHidden>{definition.label}</VisuallyHidden>
                </Button>
                <Button
                  size="sm"
                  variant={chosen ? 'primary' : 'secondary'}
                  aria-pressed={chosen}
                  onClick={() => {
                    setPicked(id);
                    if (id !== 'none') {
                      playOf(id);
                    }
                  }}
                >
                  {chosen ? 'Đã chọn' : 'Chọn'} <VisuallyHidden>{definition.label}</VisuallyHidden>
                </Button>
              </span>
            </li>
          );
        })}
      </ul>
    </Dialog>
  );
}
