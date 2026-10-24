'use client';

import { VisuallyHidden } from '@plp/ui';
import { type ReactNode, useCallback, useState } from 'react';

export interface Announcer {
  /** Queues a polite announcement; the same text twice is announced twice. */
  announce: (message: string) => void;
  /** The live region; render it once. */
  region: ReactNode;
}

/** A polite live region for results of keyboard and button actions ("Đã chuyển Hero tới…"). */
export function useAnnouncer(): Announcer {
  const [message, setMessage] = useState({ id: 0, text: '' });
  const announce = useCallback((text: string) => {
    setMessage((current) => ({ id: current.id + 1, text }));
  }, []);
  const region = (
    <VisuallyHidden role="status" aria-live="polite" aria-atomic="true">
      <span key={message.id}>{message.text}</span>
    </VisuallyHidden>
  );
  return { announce, region };
}
