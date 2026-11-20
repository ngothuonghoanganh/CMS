'use client';

import { type Site, automationRecipeLabels, automationRecipes } from '@plp/contracts';
import { BoltIcon, ButtonLink } from '@plp/ui';
import Link from 'next/link';
import { useUpgradeHref } from '../billing/plan-context';
import { PageContainer, PageHeader } from '../shell/PageHeader';
import styles from './Automations.module.css';

export interface AutomationsLockedProps {
  site: Site;
  planName: string;
}

/**
 * Screen 25 when the plan has no automation ("Cần gói có automation"): a limit of the plan, not a
 * missing permission, so it points to board 28 for who may open it (ADR-035).
 */
export function AutomationsLocked({ site, planName }: AutomationsLockedProps) {
  const upgradeHref = useUpgradeHref(site.workspaceId);
  return (
    <PageContainer>
      <PageHeader
        title="Automation"
        description={`Tự giao lead, nhắc việc và báo tin khi có sự kiện ở ${site.name}.`}
      />
      <section aria-labelledby="locked-title" className={styles.locked}>
        <div className={styles.lockedText}>
          <span className={styles.lockedEyebrow}>CẦN GÓI CÓ AUTOMATION</span>
          <h2 id="locked-title" className={styles.lockedTitle}>
            Không để lead nào phải chờ
          </h2>
          <p className={styles.lockedBody}>
            Gói {planName} hiện tại chưa có automation. Đây là giới hạn của gói, không phải quyền
            của bạn. Chủ sở hữu workspace có thể nâng cấp.
          </p>
          {upgradeHref === null ? null : (
            <ButtonLink as={Link} href={upgradeHref} variant="secondary">
              So sánh gói
            </ButtonLink>
          )}
        </div>
        <ul className={styles.lockedRecipes} aria-label="Automation làm được gì">
          {automationRecipes.map((recipe) => (
            <li key={recipe} className={styles.lockedRecipe}>
              <BoltIcon size={18} className={styles.recipeIcon} />
              <span>
                <strong>{automationRecipeLabels[recipe].name}</strong>
                <span className={styles.recipeText}>
                  {' '}
                  {automationRecipeLabels[recipe].description}
                </span>
              </span>
            </li>
          ))}
        </ul>
      </section>
    </PageContainer>
  );
}
