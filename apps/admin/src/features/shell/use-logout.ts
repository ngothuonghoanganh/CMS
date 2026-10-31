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
  /** Signs out; resolves with `'stayed'` when the session could not be ended (the user was told). */
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
  });

  async function signOut(): Promise<LeaveOutcome> {
    try {
      await mutation.mutateAsync();
    } catch (error) {
      // The session still exists: the user stays, and is told.
      reportUnexpected('Sign-out failed', error);
      toast({ tone: 'danger', title: 'Chưa đăng xuất được', description: problemMessage(error) });
      return 'stayed';
    }
    // The session is gone, so the user is leaving whatever happens here; a failure is reported
    // rather than taken for a failed sign-out.
    try {
      queryClient.clear();
      router.replace('/login');
      router.refresh();
    } catch (error) {
      reportUnexpected('Opening the login page after signing out failed', error);
    }
    return 'leaving';
  }

  return { isPending: mutation.isPending, signOut };
}
