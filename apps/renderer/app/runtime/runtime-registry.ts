import { AccordionRuntime } from './accordion-runtime';
import { TabsRuntime } from './tabs-runtime';

export const CORE_INTERACTIVE_RUNTIME_REGISTRY = {
  accordion: AccordionRuntime,
  tabs: TabsRuntime,
} as const;
