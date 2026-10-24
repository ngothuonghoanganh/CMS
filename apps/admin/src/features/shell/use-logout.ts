'use client';

import { endpoints } from '@plp/contracts';
import { useToast } from '@plp/ui';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { api } from '../../lib/api';
import { problemMessage, reportUnexpected } from './problem-message';

/** "Đăng xuất": ends the session on the server, drops cached data and opens the login page. */
export function useLogout() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: () => api(endpoints.logout, []),
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
}
