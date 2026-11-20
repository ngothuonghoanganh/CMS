'use client';

import { endpoints, type MethodSetupReturnTarget } from '@plp/contracts';
import { useMutation } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { api } from '../../lib/api';
import { navigateTo } from '../../lib/navigate';
import { reportUnexpected } from '../shell/problem-message';

export interface MethodSetup {
  /** Asks for the gateway's page and goes there; does nothing while one is being opened. */
  start: () => void;
  /** From the click until the browser has left for the gateway. */
  busy: boolean;
  /** Why the gateway's page could not be opened, for the caller to show; null otherwise. */
  error: Error | null;
}

/**
 * "Thêm phương thức", "Đổi thẻ" and "Thêm thẻ": asks the API for the gateway's page that saves a
 * card and goes there. The gateway leads back to board 29 or 28 (`returnTo`) with
 * `?paymentMethod=`. The card never passes through the admin. The button stays busy until the
 * page is left, so a second click opens no second session.
 */
export function useMethodSetup(
  workspaceId: string,
  returnTo: MethodSetupReturnTarget,
): MethodSetup {
  const [leaving, setLeaving] = useState(false);
  const mutation = useMutation({
    mutationFn: () => api(endpoints.startPaymentMethodSetup, [workspaceId], { body: { returnTo } }),
    onSuccess: ({ url }) => {
      setLeaving(true);
      navigateTo(url);
    },
    onError: (error) => {
      reportUnexpected('Starting the card setup failed', error);
    },
  });
  const { reset } = mutation;

  // Back from the gateway, the browser may show this page as it was left: ready again.
  useEffect(() => {
    function restored(event: PageTransitionEvent) {
      if (event.persisted) {
        setLeaving(false);
        reset();
      }
    }
    window.addEventListener('pageshow', restored);
    return () => {
      window.removeEventListener('pageshow', restored);
    };
  }, [reset]);

  const busy = mutation.isPending || leaving;
  return {
    start: () => {
      if (!busy) {
        mutation.mutate();
      }
    },
    busy,
    error: mutation.error,
  };
}
