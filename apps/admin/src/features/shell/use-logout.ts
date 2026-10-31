'use client';

import { endpoints } from '@plp/contracts';
import { useToast } from '@plp/ui';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { ApiError, api } from '../../lib/api';
import { loadPage } from '../../lib/page-load';
import { problemMessage, reportUnexpected } from './problem-message';
import type { LeaveOutcome } from './screen-leave';

export interface Logout {
  isPending: boolean;
  /**
   * Signs out; resolves with `'stayed'` when the session could not be ended (the user was told), or
   * when not even a page load could open the login page.
   */
  signOut: () => Promise<LeaveOutcome>;
}

/** A step after the session ended; a failure is reported, and the user still leaves. */
function afterSignOut(step: string, run: () => void): void {
  try {
    run();
  } catch (error) {
    reportUnexpected(`${step} after signing out failed`, error);
  }
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
    // The session is gone. Each step runs on its own: a failure is reported rather than taken for a
    // failed sign-out, and never keeps the login page from opening.
    afterSignOut('Dropping cached data', () => {
      queryClient.clear();
    });
    try {
      router.replace('/login');
    } catch (error) {
      reportUnexpected('Opening the login page after signing out failed', error);
      try {
        loadPage('/login');
      } catch (loadError) {
        // The user is still here: a screen that was leaving without saving saves and asks again.
        reportUnexpected('Loading the login page after signing out failed', loadError);
        return 'stayed';
      }
      return 'leaving';
    }
    afterSignOut('Refreshing the router', () => {
      router.refresh();
    });
    return 'leaving';
  }

  return { isPending: mutation.isPending, signOut };
}
