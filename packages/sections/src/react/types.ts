import type { SectionInstance } from '@plp/contracts';
import type { RenderContext } from './context.js';

/** Props every section component receives; `content` is already validated against its schema. */
export interface SectionProps<C> {
  section: SectionInstance;
  content: C;
  ctx: RenderContext;
}
