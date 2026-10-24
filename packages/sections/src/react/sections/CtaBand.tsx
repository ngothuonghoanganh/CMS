import type { CtaBandContent } from '../../schema/sections/cta-band.js';
import { CtaButton, Text } from '../primitives.js';
import type { SectionProps } from '../types.js';
import styles from './CtaBand.module.css';

export function CtaBandSection({ section, content, ctx }: SectionProps<CtaBandContent>) {
  return (
    <div className={styles.root}>
      <Text
        ctx={ctx}
        sectionId={section.id}
        path="heading"
        value={content.heading}
        as="h2"
        className={styles.heading}
        placeholder="Tiêu đề"
      />
      <Text
        ctx={ctx}
        sectionId={section.id}
        path="text"
        value={content.text}
        as="p"
        className={styles.text}
        multiline
        placeholder="Mô tả (không bắt buộc)"
      />
      <CtaButton
        ctx={ctx}
        sectionId={section.id}
        path="cta"
        cta={content.cta}
        className={styles.cta}
      />
    </div>
  );
}
