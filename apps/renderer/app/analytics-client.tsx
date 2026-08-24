'use client';

import { useEffect, useRef, type ReactNode } from 'react';

import type { AnalyticsEventV1 } from '@payload/contracts';

const SESSION_STORAGE_KEY = 'payload.analytics.session.v1';
const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://127.0.0.1:3001/api/v1';

type AnalyticsEventInput =
  | { event: 'page.viewed'; siteSlug: string; pageSlug: string; tenantSlug?: string }
  | {
      event: 'element.clicked';
      siteSlug: string;
      pageSlug: string;
      nodeId: string;
      tenantSlug?: string;
    };

type StoredSession = {
  id: string;
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  utmTerm?: string;
  utmContent?: string;
};

export function getAnalyticsSessionId(): string | undefined {
  return readSession()?.id;
}

export function trackAnalyticsEvent(input: AnalyticsEventInput): void {
  if (typeof window === 'undefined') return;
  const session = readSession();
  if (!session) return;
  const context: NonNullable<AnalyticsEventV1['context']> = {
    ...(sanitizeReferrer(document.referrer)
      ? { referrer: sanitizeReferrer(document.referrer) }
      : {}),
    ...(session.utmSource ? { utmSource: session.utmSource } : {}),
    ...(session.utmMedium ? { utmMedium: session.utmMedium } : {}),
    ...(session.utmCampaign ? { utmCampaign: session.utmCampaign } : {}),
    ...(session.utmTerm ? { utmTerm: session.utmTerm } : {}),
    ...(session.utmContent ? { utmContent: session.utmContent } : {}),
    deviceType: clientDeviceType(),
  };
  const { tenantSlug, ...eventInput } = input;
  const payload = {
    version: 1 as const,
    ...eventInput,
    sessionId: session.id,
    context,
  } as AnalyticsEventV1;
  const body = JSON.stringify(payload);
  const url = `${apiBaseUrl}/analytics/events${tenantSlug ? `?tenantSlug=${encodeURIComponent(tenantSlug)}` : ''}`;
  try {
    const sent =
      typeof navigator.sendBeacon === 'function' &&
      navigator.sendBeacon(url, new Blob([body], { type: 'application/json' }));
    if (sent) return;
  } catch {
    // Beacon and storage APIs are optional browser capabilities.
  }
  void fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
    keepalive: true,
  }).catch(() => undefined);
}

export function AnalyticsTracker({
  siteSlug,
  pageSlug,
  tenantSlug,
}: {
  siteSlug: string;
  pageSlug: string;
  tenantSlug?: string;
}): ReactNode {
  const markerRef = useRef<HTMLSpanElement>(null);
  const pageViewSent = useRef(false);

  useEffect(() => {
    if (!pageViewSent.current) {
      pageViewSent.current = true;
      trackAnalyticsEvent({
        event: 'page.viewed',
        siteSlug,
        pageSlug,
        ...(tenantSlug ? { tenantSlug } : {}),
      });
    }
    const root = markerRef.current?.parentElement;
    if (!root) return undefined;
    const onClick = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const button = target.closest<HTMLAnchorElement>(
        'a[data-payload-node-type="button"]',
      );
      if (!button || !root.contains(button)) return;
      const nodeId = button.dataset.payloadNodeId;
      if (nodeId)
        trackAnalyticsEvent({
          event: 'element.clicked',
          siteSlug,
          pageSlug,
          nodeId,
          ...(tenantSlug ? { tenantSlug } : {}),
        });
    };
    root.addEventListener('click', onClick);
    return () => root.removeEventListener('click', onClick);
  }, [pageSlug, siteSlug, tenantSlug]);

  return <span aria-hidden="true" hidden ref={markerRef} />;
}

function readSession(): StoredSession | undefined {
  try {
    const existing = window.sessionStorage.getItem(SESSION_STORAGE_KEY);
    if (existing) {
      const parsed = JSON.parse(existing) as Partial<StoredSession>;
      if (typeof parsed.id === 'string' && /^[A-Za-z0-9_-]{16,128}$/.test(parsed.id)) {
        return parsed as StoredSession;
      }
    }
    const id = createSessionId();
    const params = new URLSearchParams(window.location.search);
    const session: StoredSession = {
      id,
      ...readUtm(params, 'utmSource', 'utm_source'),
      ...readUtm(params, 'utmMedium', 'utm_medium'),
      ...readUtm(params, 'utmCampaign', 'utm_campaign'),
      ...readUtm(params, 'utmTerm', 'utm_term'),
      ...readUtm(params, 'utmContent', 'utm_content'),
    };
    window.sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
    return session;
  } catch {
    return undefined;
  }
}

function readUtm(
  params: URLSearchParams,
  property: keyof Omit<StoredSession, 'id'>,
  queryKey: string,
): Partial<StoredSession> {
  const value = params.get(queryKey)?.trim().slice(0, 100);
  return value ? { [property]: value } : {};
}

function createSessionId(): string {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

function sanitizeReferrer(value: string): string | undefined {
  if (!value) return undefined;
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return undefined;
    return `${parsed.origin}${parsed.pathname}`.slice(0, 2_048);
  } catch {
    return undefined;
  }
}

function clientDeviceType(): 'desktop' | 'mobile' | 'tablet' | 'unknown' {
  const userAgent = navigator.userAgent;
  if (/ipad|tablet|playbook|silk/i.test(userAgent)) return 'tablet';
  if (/mobi|android|iphone|ipod/i.test(userAgent)) return 'mobile';
  return userAgent ? 'desktop' : 'unknown';
}
