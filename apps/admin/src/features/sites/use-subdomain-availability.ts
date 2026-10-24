'use client';

import { endpoints, subdomainSchema } from '@plp/contracts';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { useDebouncedValue } from '../shell/use-debounced-value';
import { fieldError } from '../shell/use-schema-form';

export const AVAILABILITY_DEBOUNCE_MS = 400;

export type SubdomainAvailabilityState =
  | { kind: 'idle' }
  | { kind: 'checking' }
  | { kind: 'available' }
  | { kind: 'unavailable'; message: string }
  | { kind: 'failed' };

const reasonMessages = {
  invalid: 'Tên miền con không hợp lệ',
  reserved: 'Tên này được hệ thống giữ lại, hãy chọn tên khác',
  taken: 'Tên miền con này đã có site khác dùng',
} as const;

/**
 * Live check of a subdomain while the user types: the format with the contract schema, then the
 * server (`subdomainAvailability`) once the value has been stable for 400 ms.
 */
export function useSubdomainAvailability(subdomain: string): SubdomainAvailabilityState {
  const settled = useDebouncedValue(subdomain, AVAILABILITY_DEBOUNCE_MS);
  const formatProblem = settled === '' ? undefined : fieldError(subdomainSchema, settled);
  const query = useQuery({
    queryKey: ['subdomain-availability', settled],
    queryFn: ({ signal }) =>
      api(endpoints.subdomainAvailability, [], { query: { subdomain: settled }, signal }),
    enabled: settled !== '' && formatProblem === undefined,
    staleTime: 30_000,
  });

  if (subdomain === '') {
    return { kind: 'idle' };
  }
  if (subdomain !== settled) {
    return { kind: 'checking' };
  }
  if (formatProblem !== undefined) {
    return { kind: 'unavailable', message: formatProblem };
  }
  if (query.isError) {
    return { kind: 'failed' };
  }
  if (query.data === undefined || query.isFetching) {
    return { kind: 'checking' };
  }
  if (query.data.available) {
    return { kind: 'available' };
  }
  const reason = query.data.reason ?? 'invalid';
  return { kind: 'unavailable', message: query.data.message ?? reasonMessages[reason] };
}
