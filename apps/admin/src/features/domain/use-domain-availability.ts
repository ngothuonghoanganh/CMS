'use client';

import { endpoints, normalizeHostname } from '@plp/contracts';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { useDebouncedValue } from '../shell/use-debounced-value';
import { domainQueryKeys } from './queries';

const AVAILABILITY_DEBOUNCE_MS = 400;

export type DomainAvailabilityState =
  /** Nothing typed, or not a domain yet: the format is said when the form is sent. */
  | { kind: 'idle' }
  | { kind: 'checking' }
  | { kind: 'available' }
  /** This site has the domain already. */
  | { kind: 'already_added' }
  /** Another site verified it; adding it here asks for proof by the TXT record (ADR-022). */
  | { kind: 'taken' }
  | { kind: 'invalid'; reason: string }
  /** The check did not answer; adding the domain still works and says what is wrong. */
  | { kind: 'failed' };

/**
 * Board 14 checks a domain while it is typed: once it is a domain and has stayed the same for
 * 400 ms, the server says whether adding it would work. A newer value replaces the request in
 * flight, which is cancelled.
 */
export function useDomainAvailability(
  siteId: string,
  typed: string,
  baseDomain: string,
): DomainAvailabilityState {
  const value = typed.trim();
  const settled = useDebouncedValue(value, AVAILABILITY_DEBOUNCE_MS);
  const local = settled === '' ? null : normalizeHostname(settled, baseDomain);
  const hostname = local?.ok === true ? local.hostname : null;
  const query = useQuery({
    queryKey: domainQueryKeys.availability(siteId, hostname ?? ''),
    queryFn: ({ signal }) =>
      api(endpoints.domainAvailability, [siteId], {
        query: { hostname: hostname ?? '' },
        signal,
      }),
    enabled: hostname !== null,
    staleTime: 30_000,
  });

  if (value === '') {
    return { kind: 'idle' };
  }
  if (value !== settled) {
    return { kind: 'checking' };
  }
  if (hostname === null) {
    return { kind: 'idle' };
  }
  if (query.isError) {
    return { kind: 'failed' };
  }
  if (query.data === undefined || query.isFetching) {
    return { kind: 'checking' };
  }
  const { state, reason } = query.data;
  return state === 'invalid'
    ? { kind: 'invalid', reason: reason ?? 'Tên miền không hợp lệ' }
    : { kind: state };
}
