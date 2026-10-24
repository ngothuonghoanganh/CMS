import type { SectionInstance } from '@plp/contracts';

export interface ControlProps<F> {
  section: SectionInstance;
  field: F;
  /** Full content path, e.g. "items.0.title". */
  path: string;
}

/** Marks text that is still sample copy; publishing warns about it. */
export function sampleNote(section: SectionInstance, path: string): string | undefined {
  return section.samplePaths.includes(path) ? 'nội dung mẫu' : undefined;
}
