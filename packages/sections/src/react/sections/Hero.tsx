import type { HeroContent } from '../../schema/sections/hero.js';
import { CtaButton, SectionImage, Text } from '../primitives.js';
import type { SectionProps } from '../types.js';
import styles from './Hero.module.css';

export function HeroSection({ section, content, ctx }: SectionProps<HeroContent>) {
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
        value={content.eyebrow}
        as="p"
        className={styles.eyebrow}
        placeholder="Dòng nhỏ phía trên"
      />
      <Text
        ctx={ctx}
        sectionId={section.id}
        path="heading"
        value={content.heading}
        as="h1"
        className={styles.heading}
        placeholder="Tiêu đề"
      />
      <Text
        ctx={ctx}
        sectionId={section.id}
        path="subheading"
        value={content.subheading}
        as="p"
        className={styles.subheading}
        multiline
        placeholder="Mô tả"
      />
      <div className={styles.actions}>
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
        <div className={styles.backgroundImage}>
          <SectionImage
            ctx={ctx}
            image={content.image}
            placeholder="Chọn ảnh nền trong bảng thuộc tính"
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
      <div className={styles.media}>
        <SectionImage ctx={ctx} image={content.image} />
      </div>
    </div>
  );
}
