'use client';

import { slugSchema } from '@plp/contracts';
import { useQuery } from '@tanstack/react-query';
import { problemMessage } from '../shell/problem-message';
import { useDebouncedValue } from '../shell/use-debounced-value';
import { fieldError } from '../shell/use-schema-form';
import { finalizeSlug } from '../seo/seo-presentation';
import { SLUG_CHECK_DELAY_MS, slugAvailabilityQuery } from '../seo/slug-availability';
import type { SlugCheck } from '../seo/use-slug-field';

/**
 * Live availability of the slug of a new page, once typing pauses. Format problems are left to
 * the form's own validation (they need no request).
 */
export function useSlugAvailability(siteId: string, slug: string): SlugCheck {
  const target = finalizeSlug(slug);
  const debounced = useDebouncedValue(target, SLUG_CHECK_DELAY_MS);
  const wellFormed = fieldError(slugSchema, debounced) === undefined;
  const query = useQuery({ ...slugAvailabilityQuery(siteId, debounced), enabled: wellFormed });

  if (fieldError(slugSchema, target) !== undefined) {
    return { state: 'idle' };
  }
  if (debounced !== target || query.isPending) {
    return { state: 'checking' };
  }
  if (query.isError) {
    return { state: 'failed', message: problemMessage(query.error) };
  }
  return query.data.available
    ? { state: 'available' }
    : {
        state: 'rejected',
        message: query.data.message ?? 'Đường dẫn này không dùng được, hãy chọn đường dẫn khác',
      };
}
