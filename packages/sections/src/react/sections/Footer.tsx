import { isCtaUsed, isLinkComplete, linkHref } from '../../schema/links.js';
import type { FooterContent } from '../../schema/sections/footer.js';
import frame from '../frame.module.css';
import { CtaButton, Text } from '../primitives.js';
import type { SectionProps } from '../types.js';
import styles from './Footer.module.css';

const POLICY_LABEL = 'Chính sách quyền riêng tư';

function filled(value: string): boolean {
  return value.trim() !== '';
}

/** Two addresses of the same page, whatever the case of the host or a bare origin's slash. */
function sameAddress(a: string, b: string): boolean {
  return URL.canParse(a) && URL.canParse(b) ? new URL(a).href === new URL(b).href : a === b;
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
  // A page with a form always links its privacy policy (ADR-007, ADR-017), after the owner's own
  // links and only once: an owner's link to the same address already is that link.
  const policyUrl = ctx.leadCapture?.policyUrl ?? null;
  const showPolicy =
    policyUrl !== null &&
    !links.some(({ cta }) => {
      const href = linkHref(cta.link, ctx.pagePaths);
      return href !== null && sameAddress(href, policyUrl);
    });
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
        {(links.length > 0 || showPolicy) && (
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
            {showPolicy && (
              <li>
                {editing ? (
                  // Site settings, not content: nothing to edit here, and the canvas never navigates.
                  <span className={frame.textLink}>{POLICY_LABEL}</span>
                ) : (
                  <a
                    className={frame.textLink}
                    href={policyUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {POLICY_LABEL}
                  </a>
                )}
              </li>
            )}
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
