'use client';

import { endpoints } from '@plp/contracts';
import { useToast } from '@plp/ui';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { ApiError, api } from '../../lib/api';
import { problemMessage, reportUnexpected } from './problem-message';

/** "Đăng xuất": ends the session on the server, drops cached data and opens the login page. */
export function useLogout() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  function signedOut() {
    queryClient.clear();
    router.replace('/login');
    router.refresh();
  }
  return useMutation({
    mutationFn: () => api(endpoints.logout, []),
    onSuccess: signedOut,
    onError: (error) => {
      // The session already ended (it expired, or the user signed out in another tab).
      if (error instanceof ApiError && error.status === 401) {
        signedOut();
        return;
      }
      reportUnexpected('Sign-out failed', error);
      toast({ tone: 'danger', title: 'Chưa đăng xuất được', description: problemMessage(error) });
    },
  });
}
