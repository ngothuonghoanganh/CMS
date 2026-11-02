import type { SectionInstance } from '@plp/contracts';

export interface ControlProps<F> {
  section: SectionInstance;
  field: F;
  /** Full content path, e.g. "items.0.title". */
  path: string;
}

/**
 * Marks text that is still sample copy, or that the AI wrote with a figure, a price or a claim to
 * check (ADR-031); publishing warns about both.
 */
export function sampleNote(section: SectionInstance, path: string): string | undefined {
  if (section.samplePaths.includes(path)) {
    return 'nội dung mẫu';
  }
  return section.reviewPaths.includes(path) ? 'AI viết · cần kiểm tra' : undefined;
}
