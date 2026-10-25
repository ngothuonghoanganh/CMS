import { isCtaUsed, isLinkComplete, linkHref } from '../../schema/links.js';
import type { FooterContent } from '../../schema/sections/footer.js';
import { CtaButton, Text } from '../primitives.js';
import type { SectionProps } from '../types.js';
import styles from './Footer.module.css';

function filled(value: string): boolean {
  return value.trim() !== '';
}

/** `tel:` href of the footer phone, or null when the text is not a usable number yet. */
function phoneHref(phone: string): string | null {
  const link = { kind: 'phone', phone } as const;
  return isLinkComplete(link) ? linkHref(link, {}) : null;
}

export function FooterSection({ section, content, ctx }: SectionProps<FooterContent>) {
  const editing = ctx.mode === 'edit';
  // An empty business name means "use the site name" (see the field's help text).
  const businessName = filled(content.businessName) ? content.businessName : ctx.site.name;
  const telHref = editing ? null : phoneHref(content.phone);
  const showContact = editing || [content.address, content.phone, content.hours].some(filled);
  const showContactLine = editing || filled(content.phone) || filled(content.hours);
  const showSeparator = editing || (filled(content.phone) && filled(content.hours));
  // Unused links (empty label) render nothing, so they get no list item either.
  const links = content.links
    .map((item, index) => ({ cta: item.link, index }))
    .filter(({ cta }) => isCtaUsed(cta));
  return (
    <div className={styles.root}>
      <div className={styles.main}>
        <div className={styles.info}>
          <Text
            ctx={ctx}
            sectionId={section.id}
            path="businessName"
            value={businessName}
            as="p"
            className={styles.name}
            placeholder="Tên doanh nghiệp"
          />
          {showContact && (
            <address className={styles.contact}>
              <Text
                ctx={ctx}
                sectionId={section.id}
                path="address"
                value={content.address}
                as="p"
                className={styles.line}
                multiline
                placeholder="Địa chỉ"
              />
              {showContactLine && (
                <p className={styles.line}>
                  {telHref ? (
                    <a className={styles.phone} href={telHref}>
                      {content.phone}
                    </a>
                  ) : (
                    <Text
                      ctx={ctx}
                      sectionId={section.id}
                      path="phone"
                      value={content.phone}
                      placeholder="Số điện thoại"
                    />
                  )}
                  {showSeparator && <span aria-hidden="true"> · </span>}
                  <Text
                    ctx={ctx}
                    sectionId={section.id}
                    path="hours"
                    value={content.hours}
                    placeholder="Giờ làm việc"
                  />
                </p>
              )}
            </address>
          )}
        </div>
        {links.length > 0 && (
          <ul className={styles.links}>
            {links.map(({ cta, index }) => (
              <li key={index}>
                <CtaButton
                  ctx={ctx}
                  sectionId={section.id}
                  path={`links.${index}.link`}
                  cta={cta}
                  variant="link"
                />
              </li>
            ))}
          </ul>
        )}
      </div>
      <Text
        ctx={ctx}
        sectionId={section.id}
        path="copyright"
        value={content.copyright}
        as="p"
        className={styles.copyright}
        placeholder="Dòng bản quyền (không bắt buộc)"
      />
    </div>
  );
}
