'use client';

import { EditorApp, type EditorInitialData } from '../editor';
import { PublishDialog } from './PublishDialog';

/**
 * The editor with its publish dialog. The route is a Server Component and cannot pass the
 * `renderPublishDialog` function itself, so this client wrapper does.
 */
export function EditorWithPublish({ initial }: { initial: EditorInitialData }) {
  return (
    <EditorApp
      initial={initial}
      renderPublishDialog={(props) => <PublishDialog {...props} site={initial.site} />}
    />
  );
}
