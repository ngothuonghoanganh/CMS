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
  isMotionLocked,
  MOTION_ACCENT_LABELS,
  MOTION_LEVELS,
  MOTION_STYLES,
  pageMotionOf,
  themePresets,
} from '@plp/sections/schema';
import { Badge, Button, Dialog, PlayIcon, SegmentedControl, VisuallyHidden } from '@plp/ui';
import { useMemo, useState } from 'react';
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
  const themePresetId = useEditor((state) => state.site.themePresetId);
  const sections = useEditor((state) => state.draft.composition.sections);
  // The samples show the page itself: its colors, and the heading of its first section that moves.
  const look = useMemo(() => {
    const moving = sections.find(
      (section, index) =>
        !isMotionLocked(sections, index) &&
        typeof section.content.heading === 'string' &&
        section.content.heading.trim() !== '',
    );
    const heading = moving?.content.heading;
    return {
      scheme: themePresets[themePresetId].schemes.light,
      heading: typeof heading === 'string' ? heading : 'Vì sao khách chọn chúng tôi',
    };
  }, [sections, themePresetId]);
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

  const apply = (
    <div className={styles.applyBar}>
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
      <div className={styles.applyActions}>
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
      </div>
    </div>
  );

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      size="full"
      title="Phong cách chuyển động"
      description={`Cài đặt trang · ${pageTitle}`}
      backLabel="Quay lại cài đặt trang"
    >
      <div className={styles.page}>
        <div className={styles.top}>
          <div className={styles.lead}>
            <h3 className={styles.pageTitle}>Chọn cách trang chuyển động</h3>
            <p className={styles.intro}>
              Mỗi phong cách quy định cách section xuất hiện, thứ tự các phần và điểm nhấn. Bấm Xem
              thử để so sánh. Thời lượng và độ trễ do hệ thống chọn; phần đầu trang luôn hiện ngay.
            </p>
          </div>
          <div className={styles.actions}>
            <span className={styles.levelLabel} aria-hidden="true">
              Mức độ
            </span>
            <SegmentedControl<MotionLevel>
              aria-label="Mức độ khi xem thử"
              value={level}
              options={motionLevelIds.map((id) => ({ value: id, label: MOTION_LEVELS[id].label }))}
              onChange={setLevel}
            />
            <Button
              variant="outline"
              leadingIcon={<PlayIcon size={14} />}
              onClick={() => {
                playOf('all');
              }}
            >
              Xem thử tất cả
            </Button>
          </div>
        </div>
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
                  look={look}
                  motion={styleSample(id, level)}
                  level={level}
                  play={play.target === id || play.target === 'all' ? play.run : 0}
                />
                <div className={styles.nameRow}>
                  <h4 className={styles.name}>{definition.label}</h4>
                  {id === motion.style ? (
                    <Badge size="sm" tone="info">
                      Đang dùng
                    </Badge>
                  ) : null}
                  {id === 'none' ? (
                    <Badge size="sm" tone="neutral">
                      Mặc định cho trang mới
                    </Badge>
                  ) : null}
                  {fits.includes(id) ? (
                    <Badge size="sm" tone="success">
                      Hợp ngành
                    </Badge>
                  ) : null}
                </div>
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
                    variant="secondary"
                    // Nothing plays for "Không hiệu ứng": no play mark, and the label keeps its room.
                    leadingIcon={id === 'none' ? undefined : <PlayIcon size={12} />}
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
                    className={chosen ? undefined : styles.pick}
                    aria-pressed={chosen}
                    onClick={() => {
                      setPicked(id);
                      if (id !== 'none') {
                        playOf(id);
                      }
                    }}
                  >
                    {chosen ? 'Đã chọn' : 'Chọn'}{' '}
                    <VisuallyHidden>{definition.label}</VisuallyHidden>
                  </Button>
                </span>
              </li>
            );
          })}
        </ul>
        {apply}
      </div>
    </Dialog>
  );
}
