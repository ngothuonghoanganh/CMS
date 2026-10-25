import { type LeadFormContent, leadFormFieldLabels } from '../../schema/sections/lead-form.js';
import frame from '../frame.module.css';
import { LeadFormView } from '../lead-form-view.js';
import { Text } from '../primitives.js';
import type { SectionProps } from '../types.js';
import styles from './LeadForm.module.css';

/**
 * The lead form (ADR-016). Live pages render the host's interactive form when it provides one
 * (`ctx.leadSubmission`), the plain view otherwise. On the canvas the texts are editable and the
 * fields are drawn without controls: the form never sends from the editor.
 */
export function LeadFormSection({ section, content, ctx }: SectionProps<LeadFormContent>) {
  if (ctx.mode === 'live') {
    const view = {
      sectionId: section.id,
      content,
      capture: ctx.leadCapture,
      releaseId: ctx.leadSubmission?.releaseId ?? null,
    };
    return ctx.leadSubmission ? ctx.leadSubmission.render(view) : <LeadFormView {...view} />;
  }
  return (
    <div className={styles.root}>
      <div className={styles.intro}>
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
          path="description"
          value={content.description}
          as="p"
          className={styles.description}
          multiline
          placeholder="Mô tả (không bắt buộc)"
        />
      </div>
      <div className={styles.form}>
        {leadFormFieldLabels(content).map((label, index) => (
          <div key={label} className={styles.field}>
            <span className={styles.label}>
              {label}
              {index > 1 ? <span className={styles.optional}> (không bắt buộc)</span> : null}
            </span>
            <span className={styles.input} aria-hidden="true" />
          </div>
        ))}
        {ctx.leadCapture === null ? (
          <p className={styles.note}>
            Ô đồng ý lấy từ mục “Dữ liệu &amp; đồng ý”, chưa được thiết lập.
          </p>
        ) : (
          <>
            <span className={styles.check}>
              <span className={styles.box} aria-hidden="true" />
              <span>
                {ctx.leadCapture.requiredText}{' '}
                <span className={styles.policy}>Chính sách quyền riêng tư</span>
              </span>
            </span>
            {ctx.leadCapture.marketingText === null ? null : (
              <span className={styles.check}>
                <span className={styles.box} aria-hidden="true" />
                <span>{ctx.leadCapture.marketingText}</span>
              </span>
            )}
          </>
        )}
        <span className={[frame.button, frame.buttonPrimary, styles.submit].join(' ')}>
          <Text
            ctx={ctx}
            sectionId={section.id}
            path="submitLabel"
            value={content.submitLabel}
            placeholder="Chữ trên nút gửi"
          />
        </span>
      </div>
    </div>
  );
}
