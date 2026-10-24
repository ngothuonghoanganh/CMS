import type { FaqContent } from '../../schema/sections/faq.js';
import { Text } from '../primitives.js';
import type { SectionProps } from '../types.js';
import styles from './Faq.module.css';

export function FaqSection({ section, content, ctx }: SectionProps<FaqContent>) {
  const editing = ctx.mode === 'edit';
  const question = (value: string, index: number) => (
    <Text
      ctx={ctx}
      sectionId={section.id}
      path={`items.${index}.question`}
      value={value}
      as="h3"
      className={styles.question}
      placeholder="Câu hỏi"
    />
  );
  const answer = (value: string, index: number) => (
    <Text
      ctx={ctx}
      sectionId={section.id}
      path={`items.${index}.answer`}
      value={value}
      as="p"
      className={styles.answer}
      multiline
      placeholder="Trả lời"
    />
  );
  return (
    <div className={styles.root}>
      <Text
        ctx={ctx}
        sectionId={section.id}
        path="heading"
        value={content.heading}
        as="h2"
        className={styles.heading}
        placeholder="Tiêu đề"
      />
      <div className={styles.items}>
        {content.items.map((item, index) =>
          editing ? (
            // Typing inside a <summary> would toggle it, so the canvas shows every item open.
            <div key={index} className={[styles.item, styles.itemOpen].join(' ')}>
              {question(item.question, index)}
              {answer(item.answer, index)}
            </div>
          ) : (
            // A question is required to publish; an unfinished one in a preview is left out
            // rather than drawn as an empty toggle.
            item.question.trim() !== '' && (
              <details key={index} className={styles.item}>
                <summary className={styles.summary}>{question(item.question, index)}</summary>
                {answer(item.answer, index)}
              </details>
            )
          ),
        )}
      </div>
    </div>
  );
}
