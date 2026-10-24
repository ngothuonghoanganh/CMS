import type { PageSummary } from '@plp/contracts';
import { ToastProvider } from '@plp/ui';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import { type ReactElement, type ReactNode, useMemo, useState } from 'react';
import { vi } from 'vitest';
import { type EditorServices, EditorServicesProvider, EditorStoreProvider } from './editor-context';
import type { EditorStore } from './store';
import { PAGE_ID, SITE_ID } from './test-fixtures';
import { useAnnouncer } from './use-announcer';

/** Test-only providers around editor components; never imported by application code. */

export interface RenderEditorOptions {
  store: EditorStore;
  sitePages?: PageSummary[];
  services?: Partial<EditorServices>;
}

function Providers({
  store,
  sitePages,
  services,
  children,
}: RenderEditorOptions & { children: ReactNode }) {
  const { announce, region } = useAnnouncer();
  const [client] = useState(
    () => new QueryClient({ defaultOptions: { queries: { retry: false } } }),
  );
  const value = useMemo<EditorServices>(
    () => ({
      siteId: SITE_ID,
      pageId: PAGE_ID,
      sitePages: sitePages ?? [],
      openAddSection: vi.fn(),
      announce,
      focusTarget: vi.fn(),
      navigate: vi.fn(),
      ...services,
    }),
    [announce, sitePages, services],
  );
  return (
    <QueryClientProvider client={client}>
      <ToastProvider>
        <EditorStoreProvider store={store}>
          <EditorServicesProvider services={value}>
            {children}
            {region}
          </EditorServicesProvider>
        </EditorStoreProvider>
      </ToastProvider>
    </QueryClientProvider>
  );
}

export function renderEditor(ui: ReactElement, options: RenderEditorOptions) {
  return render(ui, {
    wrapper: ({ children }) => <Providers {...options}>{children}</Providers>,
  });
}
