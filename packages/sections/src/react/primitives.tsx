import type { Cta, ImageRef } from '@plp/contracts';
import { isCtaUsed, isExternalHref, linkHref } from '../schema/links.js';
import type { RenderContext } from './context.js';
import { EditableText } from './EditableText.js';
import frame from './frame.module.css';

type TextTag = 'h1' | 'h2' | 'h3' | 'p' | 'span' | 'div' | 'blockquote' | 'cite' | 'strong';

export interface TextProps {
  ctx: RenderContext;
  sectionId: string;
  /** Content path of this text, e.g. "items.0.title". */
  path: string;
  value: string;
  as?: TextTag;
  className?: string | undefined;
  multiline?: boolean;
  placeholder?: string;
}

/** Text from section content: plain in live mode, editable on the canvas in edit mode. */
export function Text({
  ctx,
  sectionId,
  path,
  value,
  as = 'span',
  className,
  multiline = false,
  placeholder = 'Nhập nội dung',
}: TextProps) {
  const classes =
    [className, multiline ? frame.preLine : undefined].filter(Boolean).join(' ') || undefined;
  const onTextChange = ctx.onTextChange;
  if (ctx.mode === 'edit' && onTextChange) {
    return (
      <EditableText
        as={as}
        className={classes}
        value={value}
        multiline={multiline}
        placeholder={placeholder}
        onCommit={(next) => {
          onTextChange(sectionId, path, next);
        }}
      />
    );
  }
  if (value.trim() === '') {
    return null;
  }
  const Tag = as;
  return <Tag className={classes}>{value}</Tag>;
}

export interface SectionImageProps {
  ctx: RenderContext;
  image: ImageRef;
  className?: string | undefined;
  /** Text shown on the canvas when no image is chosen. */
  placeholder?: string;
}

export function SectionImage({
  ctx,
  image,
  className,
  placeholder = 'Chưa chọn ảnh',
}: SectionImageProps) {
  const asset = image.assetId ? ctx.images[image.assetId] : undefined;
  if (!asset) {
    return ctx.mode === 'edit' ? (
      <div className={[frame.imagePlaceholder, className].filter(Boolean).join(' ')}>
        {placeholder}
      </div>
    ) : null;
  }
  return (
    <img
      className={[frame.image, className].filter(Boolean).join(' ')}
      src={asset.url}
      width={asset.width}
      height={asset.height}
      alt={image.decorative ? '' : image.alt}
      loading="lazy"
      decoding="async"
    />
  );
}

export interface CtaButtonProps {
  ctx: RenderContext;
  sectionId: string;
  /** Content path of the CTA object, e.g. "primaryCta". */
  path: string;
  cta: Cta;
  variant?: 'primary' | 'secondary';
  className?: string | undefined;
}

/**
 * A call-to-action button. Unused buttons (empty label) are not rendered. In edit mode the label is
 * editable and the button never navigates.
 */
export function CtaButton({
  ctx,
  sectionId,
  path,
  cta,
  variant = 'primary',
  className,
}: CtaButtonProps) {
  if (!isCtaUsed(cta)) {
    return null;
  }
  const classes = [
    frame.button,
    variant === 'primary' ? frame.buttonPrimary : frame.buttonSecondary,
    className,
  ]
    .filter(Boolean)
    .join(' ');
  if (ctx.mode === 'edit') {
    return (
      <span className={classes}>
        <Text
          ctx={ctx}
          sectionId={sectionId}
          path={`${path}.label`}
          value={cta.label}
          placeholder="Chữ trên nút"
        />
      </span>
    );
  }
  const href = linkHref(cta.link, ctx.pagePaths);
  if (!href) {
    return <span className={classes}>{cta.label}</span>;
  }
  const external = isExternalHref(href);
  return (
    <a
      className={classes}
      href={href}
      {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
    >
      {cta.label}
    </a>
  );
}
