import type { NavbarContent } from '../../schema/sections/navbar.js';
import { CtaButton, Text } from '../primitives.js';
import type { SectionProps } from '../types.js';
import styles from './Navbar.module.css';

export function NavbarSection({ section, content, ctx }: SectionProps<NavbarContent>) {
  // An empty brand text means "use the site name" (see the field's help text).
  const brandName = content.brandText.trim() === '' ? ctx.site.name : content.brandText;
  const logo = content.showLogo ? ctx.site.logo : null;
  return (
    <div className={styles.bar}>
      {logo ? (
        <img
          className={styles.logo}
          src={logo.url}
          width={logo.width}
          height={logo.height}
          alt={brandName}
          decoding="async"
        />
      ) : (
        <Text
          ctx={ctx}
          sectionId={section.id}
          path="brandText"
          value={brandName}
          as="span"
          className={styles.brand}
          placeholder="Tên hiển thị"
        />
      )}
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
