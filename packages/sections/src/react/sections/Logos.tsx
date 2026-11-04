import type { LogosContent } from '../../schema/sections/logos.js';
import { SectionImage, Text } from '../primitives.js';
import { MOTION_MEDIA } from '../motion/parts.js';
import type { SectionProps } from '../types.js';
import styles from './Logos.module.css';

export function LogosSection({ section, content, ctx, leading }: SectionProps<LogosContent>) {
  // A logo without an image draws nothing on a live page, so it gets no list item either; the
  // canvas keeps every slot to show what is still missing.
  const logos = content.items
    .map((item, index) => ({ image: item.image, index }))
    .filter(
      ({ image }) =>
        ctx.mode === 'edit' || (image.assetId !== null && ctx.images[image.assetId] !== undefined),
    );
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
      {logos.length > 0 && (
        <ul className={styles.logos}>
          {logos.map(({ image, index }) => (
            <li key={index} className={styles.logo} {...MOTION_MEDIA}>
              <SectionImage
                ctx={ctx}
                image={image}
                className={styles.image}
                placeholder="Chưa chọn logo"
                priority={leading && index === 0}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
