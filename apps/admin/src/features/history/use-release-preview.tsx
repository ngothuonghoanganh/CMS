'use client';

import { endpoints } from '@plp/contracts';
import { useToast } from '@plp/ui';
import { useState } from 'react';
import { api } from '../../lib/api';
import { problemMessage, reportUnexpected } from '../shell/problem-message';

/**
 * "Xem bản này": a signed preview link of an old release (ARCHITECTURE §2.1.7), opened in a new
 * tab. When the browser blocks the window, a toast offers the link instead.
 */
export function useReleasePreview(pageId: string) {
  const { toast } = useToast();
  const [pendingId, setPendingId] = useState<string | null>(null);

  async function openPreview(releaseId: string, version: number) {
    setPendingId(releaseId);
    try {
      const link = await api(endpoints.createPreviewLink, [pageId], {
        body: { kind: 'release', releaseId },
      });
      const opened = window.open(link.url, '_blank');
      if (opened) {
        opened.opener = null;
        return;
      }
      toast({
        title: 'Trình duyệt đã chặn cửa sổ xem trước',
        description: (
          <a href={link.url} target="_blank" rel="noopener noreferrer">
            {link.url}
          </a>
        ),
        action: {
          label: `Mở bản xem trước v${version}`,
          onClick: () => {
            window.open(link.url, '_blank', 'noopener,noreferrer');
          },
        },
        duration: 15_000,
      });
    } catch (error) {
      reportUnexpected('Opening a release preview failed', error);
      toast({
        tone: 'danger',
        title: `Chưa mở được bản xem trước v${version}`,
        description: problemMessage(error),
      });
    } finally {
      setPendingId(null);
    }
  }

  return { openPreview, pendingId };
}
