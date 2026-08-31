'use client';

import {
  PAGE_PREVIEW_MESSAGE_TYPE,
  PAGE_PREVIEW_READY_MESSAGE_TYPE,
  PagePreviewMessageSchema,
  PagePreviewSnapshotSchema,
  type PagePayload,
  type PageRuntimeExtension,
  type ReusableRuntime,
  type SiteDesignSystem,
  type SiteGlobals,
  type PagePreviewSnapshot,
  type ResolvedNavigationItem,
} from '@payload/contracts';
import { useEffect, useState, type ReactElement } from 'react';

import { renderPage } from '../../renderer';

type PreviewBridgeProps = {
  initialPayload: PagePayload;
  extensions?: readonly PageRuntimeExtension[] | undefined;
  siteSlug: string;
  siteName?: string | undefined;
  siteLogo?: string | undefined;
  pageSlug?: string | undefined;
  tenantSlug?: string | undefined;
  reusables?: readonly ReusableRuntime[] | undefined;
  designSystem?: SiteDesignSystem | undefined;
  globals?: SiteGlobals | undefined;
  navigation?:
    | {
        main?: readonly ResolvedNavigationItem[] | undefined;
        footer?: readonly ResolvedNavigationItem[] | undefined;
      }
    | undefined;
};

function rendererContext(
  snapshot: PagePreviewSnapshot,
  props: Pick<
    PreviewBridgeProps,
    'siteSlug' | 'siteName' | 'siteLogo' | 'pageSlug' | 'tenantSlug'
  >,
) {
  return {
    siteSlug: props.siteSlug,
    ...(props.siteName ? { siteName: props.siteName } : {}),
    ...(props.siteLogo ? { siteLogo: props.siteLogo } : {}),
    ...(props.pageSlug ? { pageSlug: props.pageSlug } : {}),
    ...(props.tenantSlug ? { tenantSlug: props.tenantSlug } : {}),
    ...(snapshot.navigation ? { navigation: snapshot.navigation } : {}),
    ...(snapshot.globals ? { globals: snapshot.globals } : {}),
    ...(snapshot.reusables?.length ? { reusables: snapshot.reusables } : {}),
    ...(snapshot.designSystem ? { designSystem: snapshot.designSystem } : {}),
    ...(snapshot.extensions?.length
      ? {
          runtimeIds: snapshot.extensions.flatMap((extension) => extension.runtimeIds),
          extensions: snapshot.extensions,
        }
      : {}),
  };
}

function configuredCmsOrigin(): string {
  if (process.env.NEXT_PUBLIC_CMS_BASE_URL) {
    try {
      return new URL(process.env.NEXT_PUBLIC_CMS_BASE_URL).origin;
    } catch {
      return window.location.origin;
    }
  }
  return 'http://127.0.0.1:3000';
}

export function PreviewBridge({
  initialPayload,
  extensions,
  siteSlug,
  siteName,
  siteLogo,
  pageSlug,
  tenantSlug,
  reusables,
  designSystem,
  globals,
  navigation,
}: PreviewBridgeProps) {
  const [snapshot, setSnapshot] = useState(() =>
    PagePreviewSnapshotSchema.parse({
      page: { schemaVersion: 1, payload: initialPayload },
      ...(extensions ? { extensions } : {}),
      ...(reusables ? { reusables } : {}),
      ...(designSystem ? { designSystem } : {}),
      ...(globals ? { globals } : {}),
      ...(navigation ? { navigation } : {}),
    }),
  );

  useEffect(() => {
    const allowedOrigin = configuredCmsOrigin();
    const opener = window.opener;
    const handleMessage = (event: MessageEvent<unknown>) => {
      if (event.origin !== allowedOrigin || event.source !== opener) return;
      const parsed = PagePreviewMessageSchema.safeParse(event.data);
      if (!parsed.success) return;
      if (parsed.data.snapshot) {
        setSnapshot(parsed.data.snapshot);
      } else if (parsed.data.document) {
        setSnapshot((current) => ({ ...current, page: parsed.data.document! }));
      }
    };

    window.addEventListener('message', handleMessage);
    opener?.postMessage({ type: PAGE_PREVIEW_READY_MESSAGE_TYPE }, allowedOrigin);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  return renderPage(
    snapshot.page.payload,
    rendererContext(snapshot, { siteSlug, siteName, siteLogo, pageSlug, tenantSlug }),
  ) as ReactElement;
}

export { PAGE_PREVIEW_MESSAGE_TYPE };
