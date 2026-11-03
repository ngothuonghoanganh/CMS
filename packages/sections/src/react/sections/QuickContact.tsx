import { isCtaUsed } from '../../schema/links.js';
import type { QuickContactContent } from '../../schema/sections/quick-contact.js';
import { CtaButton, Text } from '../primitives.js';
import { MOTION_TEXT } from '../motion/parts.js';
import type { SectionProps } from '../types.js';
import styles from './QuickContact.module.css';

/** A call button and a Zalo button; a button without a label is not shown. */
export function QuickContactSection({ section, content, ctx }: SectionProps<QuickContactContent>) {
  const hasButton = isCtaUsed(content.call) || isCtaUsed(content.zalo);
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
        placeholder="Tiêu đề"
      />
      <Text
        ctx={ctx}
        sectionId={section.id}
        path="text"
        part
        value={content.text}
        as="p"
        className={styles.text}
        multiline
        placeholder="Mô tả ngắn (không bắt buộc)"
      />
      {hasButton && (
        <div className={styles.actions} {...MOTION_TEXT}>
          <CtaButton
            ctx={ctx}
            sectionId={section.id}
            path="call"
            cta={content.call}
            className={styles.button}
          />
          <CtaButton
            ctx={ctx}
            sectionId={section.id}
            path="zalo"
            cta={content.zalo}
            variant="secondary"
            className={styles.button}
          />
        </div>
      )}
    </div>
  );
}
