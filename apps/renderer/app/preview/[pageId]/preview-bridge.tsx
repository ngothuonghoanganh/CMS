'use client';

import {
  PAGE_PREVIEW_MESSAGE_TYPE,
  PAGE_PREVIEW_READY_MESSAGE_TYPE,
  PagePreviewMessageSchema,
  type PagePayload,
  type PageRuntimeExtension,
} from '@payload/contracts';
import { useEffect, useState, type ReactElement } from 'react';

import { renderPage } from '../../renderer';

type PreviewBridgeProps = {
  initialPayload: PagePayload;
  extensions?: readonly PageRuntimeExtension[] | undefined;
};

function rendererContext(extensions: readonly PageRuntimeExtension[] | undefined) {
  return extensions?.length
    ? {
        runtimeIds: extensions.flatMap((extension) => extension.runtimeIds),
        extensions,
      }
    : {};
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

export function PreviewBridge({ initialPayload, extensions }: PreviewBridgeProps) {
  const [payload, setPayload] = useState(initialPayload);

  useEffect(() => {
    const allowedOrigin = configuredCmsOrigin();
    const opener = window.opener;
    const handleMessage = (event: MessageEvent<unknown>) => {
      if (event.origin !== allowedOrigin || event.source !== opener) return;
      const parsed = PagePreviewMessageSchema.safeParse(event.data);
      if (parsed.success) setPayload(parsed.data.document.payload);
    };

    window.addEventListener('message', handleMessage);
    opener?.postMessage({ type: PAGE_PREVIEW_READY_MESSAGE_TYPE }, allowedOrigin);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  return renderPage(payload, rendererContext(extensions)) as ReactElement;
}

export { PAGE_PREVIEW_MESSAGE_TYPE };
