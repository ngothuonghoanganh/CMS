'use client';

import { endpoints } from '@plp/contracts';
import { useToast } from '@plp/ui';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { ApiError, api } from '../../lib/api';
import { problemMessage, reportUnexpected } from './problem-message';
import type { LeaveOutcome } from './screen-leave';

export interface Logout {
  isPending: boolean;
  /** Signs out; resolves with `'stayed'` when that failed (the user was told). */
  signOut: () => Promise<LeaveOutcome>;
}

/** "Đăng xuất": ends the session on the server, drops cached data and opens the login page. */
export function useLogout(): Logout {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const mutation = useMutation({
    mutationFn: async () => {
      try {
        await api(endpoints.logout, []);
      } catch (error) {
        // The session already ended (it expired, or the user signed out in another tab).
        if (error instanceof ApiError && error.status === 401) {
          return;
        }
        throw error;
      }
    },
    onSuccess: () => {
      queryClient.clear();
      router.replace('/login');
      router.refresh();
    },
    onError: (error) => {
      reportUnexpected('Sign-out failed', error);
      toast({ tone: 'danger', title: 'Chưa đăng xuất được', description: problemMessage(error) });
    },
  });
  return {
    isPending: mutation.isPending,
    signOut: () =>
      mutation.mutateAsync().then(
        (): LeaveOutcome => 'leaving',
        // `onError` already showed and reported the failure; the caller learns the user stays.
        (): LeaveOutcome => 'stayed',
      ),
  };
}
