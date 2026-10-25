import { Card } from '@plp/ui';
import type { ReactNode } from 'react';
import styles from './FormCard.module.css';

export interface FormCardProps {
  title: string;
  description: ReactNode;
  children: ReactNode;
  /** Line under the card, e.g. the link to the other sign-in page. */
  footer?: ReactNode;
}

/** The card of a centered form page: heading, short explanation and the form. */
export function FormCard({ title, description, children, footer }: FormCardProps) {
  return (
    <>
      <Card as="section" padding="lg" aria-labelledby="form-card-title" className={styles.card}>
        <div className={styles.heading}>
          <h1 id="form-card-title" className={styles.title}>
            {title}
          </h1>
          <p className={styles.description}>{description}</p>
        </div>
        {children}
      </Card>
      {footer ? <p className={styles.footer}>{footer}</p> : null}
    </>
  );
}
