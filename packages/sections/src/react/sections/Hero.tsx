import type { HeroContent } from '../../schema/sections/hero.js';
import { CtaButton, SectionImage, Text } from '../primitives.js';
import { MOTION_MEDIA, MOTION_TEXT } from '../motion/parts.js';
import type { SectionProps } from '../types.js';
import styles from './Hero.module.css';

export function HeroSection({ section, content, ctx, leading }: SectionProps<HeroContent>) {
  const variant = section.variant;
  const mediaFirst = section.mobileOrder === 'media-first';
  // The dark overlay and the white text and buttons belong to a real photo only: the edit
  // placeholder (no image chosen yet) keeps the color scheme's own colors.
  const imageId = content.image.assetId;
  const overPhoto =
    variant === 'background' && imageId !== null && ctx.images[imageId] !== undefined;
  const text = (
    <div className={styles.text}>
      <Text
        ctx={ctx}
        sectionId={section.id}
        path="eyebrow"
        part
        value={content.eyebrow}
        as="p"
        className={styles.eyebrow}
        placeholder="Dòng nhỏ phía trên"
      />
      <Text
        ctx={ctx}
        sectionId={section.id}
        path="heading"
        part
        value={content.heading}
        as="h1"
        className={styles.heading}
        placeholder="Tiêu đề"
      />
      <Text
        ctx={ctx}
        sectionId={section.id}
        path="subheading"
        part
        value={content.subheading}
        as="p"
        className={styles.subheading}
        multiline
        placeholder="Mô tả"
      />
      <div className={styles.actions} {...MOTION_TEXT}>
        <CtaButton
          ctx={ctx}
          sectionId={section.id}
          path="primaryCta"
          cta={content.primaryCta}
          className={overPhoto ? styles.ctaOverPhoto : undefined}
        />
        {variant !== 'centered' && (
          <CtaButton
            ctx={ctx}
            sectionId={section.id}
            path="secondaryCta"
            cta={content.secondaryCta}
            variant="secondary"
            className={
              overPhoto ? [styles.ctaOverPhoto, styles.secondaryOverPhoto].join(' ') : undefined
            }
          />
        )}
      </div>
    </div>
  );

  if (variant === 'centered') {
    return <div className={[styles.root, styles.centered].join(' ')}>{text}</div>;
  }

  if (variant === 'background') {
    return (
      <div
        className={[styles.root, styles.background, overPhoto ? styles.overPhoto : undefined]
          .filter(Boolean)
          .join(' ')}
      >
        <div className={styles.backgroundImage} {...MOTION_MEDIA}>
          <SectionImage
            ctx={ctx}
            image={content.image}
            placeholder="Chọn ảnh nền trong bảng thuộc tính"
            priority={leading}
          />
        </div>
        {text}
      </div>
    );
  }

  return (
    <div
      className={[styles.root, styles.split, mediaFirst ? styles.mediaFirst : undefined]
        .filter(Boolean)
        .join(' ')}
    >
      {text}
      <div className={styles.media} {...MOTION_MEDIA}>
        <SectionImage ctx={ctx} image={content.image} priority={leading} />
      </div>
    </div>
  );
}
