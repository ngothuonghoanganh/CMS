'use client';

import { endpoints, type MethodSetupReturnTarget } from '@plp/contracts';
import { useMutation } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { navigateTo } from '../../lib/navigate';
import { reportUnexpected } from '../shell/problem-message';

/**
 * "Thêm phương thức" and "Đổi thẻ": asks the API for the gateway's page that saves a card and goes
 * there. The gateway leads back to board 29 or 28 (`returnTo`) with `?paymentMethod=`. The card
 * never passes through the admin.
 */
export function useMethodSetup(workspaceId: string, returnTo: MethodSetupReturnTarget) {
  return useMutation({
    mutationFn: () => api(endpoints.startPaymentMethodSetup, [workspaceId], { body: { returnTo } }),
    onSuccess: ({ url }) => {
      navigateTo(url);
    },
    onError: (error) => {
      reportUnexpected('Starting the card setup failed', error);
    },
  });
}
