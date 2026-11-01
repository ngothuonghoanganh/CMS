import type { SectionInstance } from '@plp/contracts';
import type { RenderContext } from './context.js';

/** Props every section component receives; `content` is already validated against its schema. */
export interface SectionProps<C> {
  section: SectionInstance;
  content: C;
  ctx: RenderContext;
  /**
   * The first section of the page body (after the navigation bar): its first image is the likely
   * largest paint, so it loads at once instead of lazily (see `SectionImage`).
   */
  leading: boolean;
}
