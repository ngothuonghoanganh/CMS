'use client';

import { useToast } from '@plp/ui';
import Link from 'next/link';
import { useCallback } from 'react';
import { useUpgradeHref } from './plan-context';
import { planProblemOf } from './plan-problem';
import { problemMessage } from '../shell/problem-message';

/**
 * Says a failed request in a toast. A 402 of the plan (ADR-035) is a warning that leads to board
 * 28 with "Nâng cấp", distinct from a 403 "Không có quyền" which stays a danger toast.
 */
export function useProblemToast(workspaceId?: string): (title: string, error: unknown) => void {
  const { toast } = useToast();
  const href = useUpgradeHref(workspaceId);
  return useCallback(
    (title, error) => {
      const message = problemMessage(error);
      if (planProblemOf(error) === null) {
        toast({ tone: 'danger', title, description: message });
        return;
      }
      toast({
        tone: 'warning',
        title,
        description:
          href === null ? (
            message
          ) : (
            <>
              {message} <Link href={href}>Nâng cấp</Link>
            </>
          ),
      });
    },
    [toast, href],
  );
}
