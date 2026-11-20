'use client';

import {
  type BillingInfoResponse,
  type BillingSummary,
  endpoints,
  type InvoiceListResponse,
  type PaymentMethodResponse,
  type WorkspacePlan,
} from '@plp/contracts';
import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query';
import { usePathname } from 'next/navigation';
import { useEffect, useRef } from 'react';
import { api } from '../../lib/api';
import { adoptServerRender, serverFirstPage } from '../shell/server-render';

/** Query keys of a workspace's plan (ADR-035). */
export const billingQueryKeys = {
  all: (workspaceId: string) => ['workspaces', workspaceId, 'billing'] as const,
  /** The member-level plan of the sidebar, the banner and the "Nâng cấp" chips. */
  plan: (workspaceId: string) => ['workspaces', workspaceId, 'billing', 'plan'] as const,
  summary: (workspaceId: string) => ['workspaces', workspaceId, 'billing', 'summary'] as const,
  /** Board 29's three cards: the saved card, the billing info and the invoices. */
  paymentMethod: (workspaceId: string) =>
    ['workspaces', workspaceId, 'billing', 'payment-method'] as const,
  info: (workspaceId: string) => ['workspaces', workspaceId, 'billing', 'info'] as const,
  invoices: (workspaceId: string) => ['workspaces', workspaceId, 'billing', 'invoices'] as const,
  /** What choosing a plan does now; `payNow` tells the trial's two offers apart. */
  quote: (workspaceId: string, planId: string, cycle: string, payNow: boolean) =>
    ['workspaces', workspaceId, 'billing', 'quote', planId, cycle, payNow] as const,
};

/** Invoices per page of "Lịch sử giao dịch" ("Xem thêm" loads the next). */
export const INVOICE_PAGE_SIZE = 10;

/**
 * The workspace's plan, starting from what the server loaded with the frame. Changing the plan on
 * board 28 updates it, so the sidebar and the banner follow without a page load. The state also
 * moves with time (a trial ends) and with changes made elsewhere (the Owner upgrades in another
 * tab), so it is read again when the user comes back to the tab.
 */
export function useLivePlan(workspaceId: string, initial: WorkspacePlan): WorkspacePlan {
  const queryClient = useQueryClient();
  // A frame rendered again by the server (a load, another layout, a refresh) is the newest plan:
  // `initialData` alone would be ignored once an earlier screen cached the key.
  useEffect(() => {
    queryClient.setQueryData(billingQueryKeys.plan(workspaceId), initial);
  }, [queryClient, workspaceId, initial]);
  return useQuery({
    queryKey: billingQueryKeys.plan(workspaceId),
    queryFn: ({ signal }) => api(endpoints.getWorkspacePlan, [workspaceId], { signal }),
    initialData: initial,
    refetchOnWindowFocus: true,
  }).data;
}

/**
 * Reads the plan again when the user opens another screen of a frame that stays mounted (the
 * shell's layout): a change made elsewhere, or a trial that ended meanwhile, shows on that screen.
 */
export function usePlanOnEveryScreen(workspaceId: string): void {
  const queryClient = useQueryClient();
  const pathname = usePathname();
  const shownAt = useRef(pathname);
  useEffect(() => {
    if (shownAt.current !== pathname) {
      shownAt.current = pathname;
      void queryClient.invalidateQueries({
        queryKey: billingQueryKeys.plan(workspaceId),
        exact: true,
      });
    }
  }, [pathname, queryClient, workspaceId]);
}

/**
 * Board 28's summary from what the server loaded at `loadedAt`, which replaces an older visit's
 * cache (a site created meanwhile counts at once); read again when the user comes back to the tab.
 */
export function useBillingSummary(
  workspaceId: string,
  initial: BillingSummary,
  loadedAt: number,
): BillingSummary {
  const queryClient = useQueryClient();
  useEffect(() => {
    const key = billingQueryKeys.summary(workspaceId);
    const cached = queryClient.getQueryState(key);
    if (cached === undefined || cached.dataUpdatedAt < loadedAt) {
      queryClient.setQueryData(key, initial, { updatedAt: loadedAt });
    }
  }, [queryClient, workspaceId, initial, loadedAt]);
  return useQuery({
    queryKey: billingQueryKeys.summary(workspaceId),
    queryFn: ({ signal }) => api(endpoints.getBillingSummary, [workspaceId], { signal }),
    initialData: initial,
    initialDataUpdatedAt: loadedAt,
    refetchOnWindowFocus: true,
  }).data;
}

/** What board 29's page loaded on the server, and when (epoch ms). */
export interface PaymentsInitial {
  paymentMethod: PaymentMethodResponse;
  billingInfo: BillingInfoResponse;
  invoices: InvoiceListResponse;
  loadedAt: number;
}

/**
 * Board 29's three cards from what the server loaded; each replaces an older visit's cache and is
 * read again when the user comes back to the tab (a charge or a card saved in another tab).
 */
export function usePaymentsData(workspaceId: string, initial: PaymentsInitial) {
  const queryClient = useQueryClient();
  const { loadedAt } = initial;
  useEffect(() => {
    adoptServerRender(
      queryClient,
      billingQueryKeys.paymentMethod(workspaceId),
      initial.paymentMethod,
      loadedAt,
    );
    adoptServerRender(
      queryClient,
      billingQueryKeys.info(workspaceId),
      initial.billingInfo,
      loadedAt,
    );
    adoptServerRender(
      queryClient,
      billingQueryKeys.invoices(workspaceId),
      serverFirstPage(initial.invoices),
      loadedAt,
    );
  }, [queryClient, workspaceId, initial, loadedAt]);

  const paymentMethod = useQuery({
    queryKey: billingQueryKeys.paymentMethod(workspaceId),
    queryFn: ({ signal }) => api(endpoints.getPaymentMethod, [workspaceId], { signal }),
    initialData: initial.paymentMethod,
    initialDataUpdatedAt: loadedAt,
    refetchOnWindowFocus: true,
  });
  const billingInfo = useQuery({
    queryKey: billingQueryKeys.info(workspaceId),
    queryFn: ({ signal }) => api(endpoints.getBillingInfo, [workspaceId], { signal }),
    initialData: initial.billingInfo,
    initialDataUpdatedAt: loadedAt,
  });
  const invoices = useInfiniteQuery({
    queryKey: billingQueryKeys.invoices(workspaceId),
    queryFn: ({ pageParam, signal }) =>
      api(endpoints.listInvoices, [workspaceId], {
        query: { limit: INVOICE_PAGE_SIZE, ...(pageParam === null ? {} : { cursor: pageParam }) },
        signal,
      }),
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => lastPage.nextCursor,
    initialData: serverFirstPage(initial.invoices),
    initialDataUpdatedAt: loadedAt,
    refetchOnWindowFocus: true,
  });
  return { paymentMethod, billingInfo, invoices };
}
