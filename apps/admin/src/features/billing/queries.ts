'use client';

import { INVOICE_PAGE_SIZE } from './payment-presentation';
import { dueWaiting } from './plan-presentation';
import {
  type BillingInfoResponse,
  type BillingSummary,
  endpoints,
  type InvoiceListResponse,
  type PaymentMethodResponse,
  type WorkspacePlan,
} from '@plp/contracts';
import {
  type QueryClient,
  useInfiniteQuery,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
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
  /** One invoice with its transfer details (board 29's "Chuyển khoản"). */
  invoice: (workspaceId: string, invoiceId: string) =>
    ['workspaces', workspaceId, 'billing', 'invoice', invoiceId] as const,
  /** What choosing a plan does now; `payNow` tells the trial's two offers apart. */
  quote: (workspaceId: string, planId: string, cycle: string, payNow: boolean) =>
    ['workspaces', workspaceId, 'billing', 'quote', planId, cycle, payNow] as const,
};

/** What the member-level plan keeps of a summary. */
export function workspacePlanOf(summary: BillingSummary): WorkspacePlan {
  const { id, name, limits, features } = summary.plan;
  return {
    plan: { id, name, limits, features },
    state: summary.state,
    access: summary.access,
    trialDaysLeft: summary.trialDaysLeft,
    graceDaysLeft: summary.graceDaysLeft,
    paymentWaiting: dueWaiting(summary.dueInvoice),
    awaitingTransfer: summary.awaitingTransfer,
  };
}

/**
 * A lifecycle action answered with the new summary (cancel, keep, a scheduled change): it replaces
 * the cached one, and the plan of the sidebar, the banners and the "Nâng cấp" chips follows at
 * once, without waiting for the next read.
 */
export function adoptSummary(
  queryClient: QueryClient,
  workspaceId: string,
  summary: BillingSummary,
): void {
  queryClient.setQueryData(billingQueryKeys.summary(workspaceId), summary);
  queryClient.setQueryData(billingQueryKeys.plan(workspaceId), workspacePlanOf(summary));
  invalidateAfterPlanChange(queryClient, workspaceId);
}

/**
 * What else reads again once the plan changed, from the dialog or an invoice paid on board 29:
 * automations and custom roles depend on the plan, and the charge made or settled an invoice.
 */
export function invalidateAfterPlanChange(queryClient: QueryClient, workspaceId: string): void {
  void queryClient.invalidateQueries({ queryKey: ['sites'] });
  void queryClient.invalidateQueries({ queryKey: billingQueryKeys.invoices(workspaceId) });
}

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

/** One invoice with its transfer details, read while a transfer waits. */
export function useInvoiceDetail(workspaceId: string, invoiceId: string | null) {
  return useQuery({
    queryKey: billingQueryKeys.invoice(workspaceId, invoiceId ?? ''),
    queryFn: ({ signal }) => api(endpoints.getInvoice, [workspaceId, invoiceId ?? ''], { signal }),
    enabled: invoiceId !== null,
  });
}

/** What board 29's page loaded on the server, and when (epoch ms). */
export interface PaymentsInitial {
  summary: BillingSummary;
  paymentMethod: PaymentMethodResponse;
  billingInfo: BillingInfoResponse;
  invoices: InvoiceListResponse;
  loadedAt: number;
}

/** The saved card, read for the notice of a return from the gateway to board 28. */
export function usePaymentMethod(workspaceId: string, enabled: boolean) {
  return useQuery({
    queryKey: billingQueryKeys.paymentMethod(workspaceId),
    queryFn: ({ signal }) => api(endpoints.getPaymentMethod, [workspaceId], { signal }),
    enabled,
  });
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

  const summary = useBillingSummary(workspaceId, initial.summary, loadedAt);
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
  return { summary, paymentMethod, billingInfo, invoices };
}
