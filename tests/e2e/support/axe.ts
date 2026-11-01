import AxeBuilder from '@axe-core/playwright';
import { expect, type Page } from '@playwright/test';

/** WCAG 2.2 level A and AA, the bar of ADR-013 and AGENTS.md. */
export const WCAG_22_AA = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

/** The viewports every screen is scanned at: the boards' desktop width and a small phone. */
export const SCAN_VIEWPORTS = [
  { name: 'desktop', width: 1440, height: 1000 },
  { name: 'phone', width: 375, height: 812 },
] as const;

/**
 * Scans the page as it is now and records every WCAG 2.2 AA violation as a soft failure, so one
 * run lists the violations of every screen. Each line names the rule, the elements and why.
 */
export async function expectAccessible(page: Page, screen: string): Promise<void> {
  // A dialog fading in is still half transparent: axe would measure the contrast of colors blended
  // with the page behind it.
  await animationsSettled(page);
  const { violations } = await new AxeBuilder({ page }).withTags(WCAG_22_AA).analyze();
  const found = violations.map(
    (violation) =>
      `${violation.id} (${violation.impact ?? 'n/a'}): ${violation.help}\n${violation.nodes
        .slice(0, 8)
        .map((node) => `    ${node.target.join(' ')} — ${node.failureSummary ?? ''}`)
        .join('\n')}`,
  );
  expect.soft(found, `${screen} has no WCAG 2.2 AA violations`).toEqual([]);
}

/**
 * Waits for the page's transitions and animations to end, so what is checked is what stays on
 * screen. Endless animations (spinners) are left alone, and an animation cancelled on the way (its
 * element removed) counts as ended.
 */
export async function animationsSettled(page: Page): Promise<void> {
  await page.evaluate(() =>
    Promise.allSettled(
      document
        .getAnimations()
        .filter((animation) => animation.effect?.getComputedTiming().iterations !== Infinity)
        .map((animation) => animation.finished),
    ),
  );
}

/** The page never scrolls sideways (WCAG 1.4.10 at a 320 px viewport). */
export async function expectNoSidewaysScroll(page: Page, screen: string): Promise<void> {
  const widths = await page.evaluate(() => ({
    scroll: document.documentElement.scrollWidth,
    client: document.documentElement.clientWidth,
  }));
  expect.soft(widths.scroll, `${screen} scrolls sideways`).toBeLessThanOrEqual(widths.client);
}
