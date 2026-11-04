import type { ImageRef } from '@plp/contracts';
import type { BeforeAfterContent } from '../../schema/sections/before-after.js';
import type { RenderContext } from '../context.js';
import { SectionImage, Text } from '../primitives.js';
import { MOTION_MEDIA } from '../motion/parts.js';
import type { SectionProps } from '../types.js';
import styles from './BeforeAfter.module.css';

interface PhotoProps {
  ctx: RenderContext;
  sectionId: string;
  image: ImageRef;
  captionPath: 'beforeCaption' | 'afterCaption';
  caption: string;
  placeholder: string;
  priority: boolean;
}

function hasPhoto(ctx: RenderContext, image: ImageRef): boolean {
  return image.assetId !== null && ctx.images[image.assetId] !== undefined;
}

/** Whether a photo draws anything: the canvas always shows both, to fill them in. */
function isDrawn(ctx: RenderContext, image: ImageRef, caption: string): boolean {
  return ctx.mode === 'edit' || hasPhoto(ctx, image) || caption.trim() !== '';
}

/** One photo and the caption saying which one it is. */
function Photo({ ctx, sectionId, image, captionPath, caption, placeholder, priority }: PhotoProps) {
  const editing = ctx.mode === 'edit';
  const captioned = caption.trim() !== '';
  return (
    <figure className={styles.photo} {...MOTION_MEDIA}>
      <SectionImage
        ctx={ctx}
        image={image}
        className={styles.image}
        placeholder={placeholder}
        priority={priority}
      />
      {(editing || captioned) && (
        <figcaption className={styles.caption}>
          <Text
            ctx={ctx}
            sectionId={sectionId}
            path={captionPath}
            value={caption}
            placeholder="Chú thích"
          />
        </figcaption>
      )}
    </figure>
  );
}

/** Two photos side by side; phones stack them in source order, "before" first. */
export function BeforeAfterSection({
  section,
  content,
  ctx,
  leading,
}: SectionProps<BeforeAfterContent>) {
  const before = isDrawn(ctx, content.beforeImage, content.beforeCaption);
  const after = isDrawn(ctx, content.afterImage, content.afterCaption);
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
      {(before || after) && (
        <div className={styles.pair}>
          {before && (
            <Photo
              ctx={ctx}
              sectionId={section.id}
              image={content.beforeImage}
              captionPath="beforeCaption"
              caption={content.beforeCaption}
              placeholder="Chưa chọn ảnh trước"
              priority={leading}
            />
          )}
          {after && (
            <Photo
              ctx={ctx}
              sectionId={section.id}
              image={content.afterImage}
              captionPath="afterCaption"
              caption={content.afterCaption}
              placeholder="Chưa chọn ảnh sau"
              // The first image the section draws is the one that may load at once.
              priority={leading && !hasPhoto(ctx, content.beforeImage)}
            />
          )}
        </div>
      )}
      <Text
        ctx={ctx}
        sectionId={section.id}
        path="note"
        part
        value={content.note}
        as="p"
        className={styles.note}
        placeholder="Dòng lưu ý (không bắt buộc)"
      />
    </div>
  );
}
