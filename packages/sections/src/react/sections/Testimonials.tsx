import type { TestimonialsContent } from '../../schema/sections/testimonials.js';
import { SectionImage, Text } from '../primitives.js';
import type { SectionProps } from '../types.js';
import styles from './Testimonials.module.css';

type Testimonial = TestimonialsContent['items'][number];

export function TestimonialsSection({ section, content, ctx }: SectionProps<TestimonialsContent>) {
  const quoteText = (item: Testimonial, index: number, className: string | undefined) => (
    <blockquote className={styles.blockquote}>
      <Text
        ctx={ctx}
        sectionId={section.id}
        path={`items.${index}.quote`}
        value={item.quote}
        as="p"
        className={className}
        multiline
        placeholder="Lời nhận xét"
      />
    </blockquote>
  );
  const name = (item: Testimonial, index: number) => (
    <Text
      ctx={ctx}
      sectionId={section.id}
      path={`items.${index}.name`}
      value={item.name}
      as="cite"
      className={styles.name}
      placeholder="Tên khách hàng"
    />
  );
  const detail = (item: Testimonial, index: number) => (
    <Text
      ctx={ctx}
      sectionId={section.id}
      path={`items.${index}.detail`}
      value={item.detail}
      as="span"
      className={styles.detail}
      placeholder="Thông tin thêm"
    />
  );

  if (section.variant === 'quote') {
    // One featured quote: only the first item is shown and the heading field is hidden.
    const item = content.items[0];
    if (!item) {
      return null;
    }
    const showSeparator = ctx.mode === 'edit' || item.detail.trim() !== '';
    return (
      <div className={styles.featured}>
        <h2 className={styles.eyebrow}>Cảm nhận khách hàng</h2>
        <figure className={styles.featuredFigure}>
          {quoteText(item, 0, styles.featuredQuote)}
          <figcaption className={styles.featuredCaption}>
            {name(item, 0)}
            {showSeparator && <span aria-hidden="true"> · </span>}
            {detail(item, 0)}
          </figcaption>
        </figure>
      </div>
    );
  }

  return (
    <div className={styles.root}>
      <Text
        ctx={ctx}
        sectionId={section.id}
        path="heading"
        value={content.heading}
        as="h2"
        className={styles.heading}
        placeholder="Tiêu đề (không bắt buộc)"
      />
      <ul className={styles.cards}>
        {content.items.map((item, index) => (
          <li key={index} className={styles.cardItem}>
            <figure className={styles.card}>
              {quoteText(item, index, styles.quote)}
              <figcaption className={styles.caption}>
                <SectionImage
                  ctx={ctx}
                  image={item.avatar}
                  className={styles.avatar}
                  placeholder="Ảnh"
                />
                <span className={styles.person}>
                  {name(item, index)}
                  {detail(item, index)}
                </span>
              </figcaption>
            </figure>
          </li>
        ))}
      </ul>
    </div>
  );
}
