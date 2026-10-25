import type { BenefitsContent, benefitIcons } from '../../schema/sections/benefits.js';
import { SectionImage, Text } from '../primitives.js';
import type { SectionProps } from '../types.js';
import styles from './Benefits.module.css';

type BenefitIcon = (typeof benefitIcons)[number];

/** Path data of simple 24px stroke icons, one per benefit icon value. */
const iconPaths: Record<BenefitIcon, readonly string[]> = {
  sparkles: ['M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z', 'M19 15v4M17 17h4'],
  shield: ['M12 3l7 3v5c0 4.6-3 8.4-7 10-4-1.6-7-5.4-7-10V6z', 'M9 12l2 2 4-4'],
  clock: ['M3 12a9 9 0 1 0 18 0a9 9 0 1 0-18 0', 'M12 7v5l3 2'],
  heart: [
    'M12 20s-7.5-4.6-7.5-10.2A4.3 4.3 0 0 1 12 7.2a4.3 4.3 0 0 1 7.5 2.6C19.5 15.4 12 20 12 20z',
  ],
  star: ['M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z'],
  check: ['M5 12.5l4.5 4.5L19 7.5'],
  smile: [
    'M3 12a9 9 0 1 0 18 0a9 9 0 1 0-18 0',
    'M8.5 14.5a4.5 4.5 0 0 0 7 0',
    'M9 9.5h.01M15 9.5h.01',
  ],
  leaf: ['M5 19C5 10.5 10 5.5 20 4c-1 10-6 15-15 15z', 'M5 19l8-8'],
};

function BenefitIconSvg({ icon }: { icon: BenefitIcon }) {
  return (
    <span className={styles.icon} aria-hidden="true">
      <svg
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        focusable="false"
      >
        {iconPaths[icon].map((d) => (
          <path key={d} d={d} />
        ))}
      </svg>
    </span>
  );
}

export function BenefitsSection({ section, content, ctx }: SectionProps<BenefitsContent>) {
  const alternate = section.variant === 'alternate';
  const header = (
    <div className={styles.header}>
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
        path="intro"
        value={content.intro}
        as="p"
        className={styles.intro}
        multiline
        placeholder="Giới thiệu ngắn (không bắt buộc)"
      />
    </div>
  );

  const itemText = (index: number, title: string, description: string) => (
    <>
      <Text
        ctx={ctx}
        sectionId={section.id}
        path={`items.${index}.title`}
        value={title}
        as="h3"
        className={styles.title}
        placeholder="Tiêu đề lợi ích"
      />
      <Text
        ctx={ctx}
        sectionId={section.id}
        path={`items.${index}.description`}
        value={description}
        as="p"
        className={styles.description}
        multiline
        placeholder="Mô tả ngắn"
      />
    </>
  );

  if (alternate) {
    // The variant hides the icon field; each row pairs the item image with its text.
    return (
      <div className={styles.root}>
        {header}
        <ul
          className={[
            styles.rows,
            section.mobileOrder === 'media-first' ? styles.mediaFirst : undefined,
          ]
            .filter(Boolean)
            .join(' ')}
        >
          {content.items.map((item, index) => (
            <li key={index} className={styles.row}>
              <div className={styles.rowText}>{itemText(index, item.title, item.description)}</div>
              <div className={styles.media}>
                <SectionImage ctx={ctx} image={item.image} className={styles.image} />
              </div>
            </li>
          ))}
        </ul>
      </div>
    );
  }

  // Grid: the variant hides the image field.
  return (
    <div className={styles.root}>
      {header}
      <ul className={styles.grid}>
        {content.items.map((item, index) => (
          <li key={index} className={styles.card}>
            <BenefitIconSvg icon={item.icon} />
            <div className={styles.cardText}>{itemText(index, item.title, item.description)}</div>
          </li>
        ))}
      </ul>
    </div>
  );
}
