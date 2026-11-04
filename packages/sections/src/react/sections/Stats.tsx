import type { StatsContent } from '../../schema/sections/stats.js';
import { MOTION_TEXT } from '../motion/parts.js';
import { Text } from '../primitives.js';
import type { SectionProps } from '../types.js';
import styles from './Stats.module.css';

/**
 * A row of figures. Off the canvas each figure is drawn twice: once to see, which may count up to
 * its value when the section moves (ADR-032), and once for screen readers, always the real value.
 */
export function StatsSection({ section, content, ctx }: SectionProps<StatsContent>) {
  const editing = ctx.mode === 'edit' && ctx.onTextChange !== undefined;
  return (
    <div className={styles.root}>
      <Text
        ctx={ctx}
        sectionId={section.id}
        path="heading"
        part
        value={content.heading}
        as="h2"
        className={styles.heading}
        placeholder="Tiêu đề (không bắt buộc)"
      />
      <ul className={styles.items}>
        {content.items.map((item, index) => (
          <li key={index} className={styles.item} {...MOTION_TEXT}>
            {editing ? (
              <Text
                ctx={ctx}
                sectionId={section.id}
                path={`items.${index}.value`}
                value={item.value}
                className={styles.value}
                placeholder="Con số"
              />
            ) : (
              item.value.trim() !== '' && (
                <span className={styles.value}>
                  <span aria-hidden="true" data-m-count="">
                    {item.value}
                  </span>
                  <span className={styles.spoken}>{item.value}</span>
                </span>
              )
            )}
            <Text
              ctx={ctx}
              sectionId={section.id}
              path={`items.${index}.label`}
              value={item.label}
              className={styles.label}
              placeholder="Ý nghĩa của con số"
            />
          </li>
        ))}
      </ul>
    </div>
  );
}
