'use client';

import type { CheckTarget, PageSummary } from '@plp/contracts';
import { createContext, type ReactNode, useContext } from 'react';
import { useStore } from 'zustand';
import type { EditorState, EditorStore } from './store';

const StoreContext = createContext<EditorStore | null>(null);

export function EditorStoreProvider({
  store,
  children,
}: {
  store: EditorStore;
  children: ReactNode;
}) {
  return <StoreContext.Provider value={store}>{children}</StoreContext.Provider>;
}

/** The editor store itself, for event handlers that read the latest state or run commands. */
export function useEditorStoreApi(): EditorStore {
  const store = useContext(StoreContext);
  if (store === null) {
    throw new Error('useEditorStoreApi must be used inside <EditorStoreProvider>.');
  }
  return store;
}

/** Subscribes to one slice of the editor store. Return stable values (no new objects). */
export function useEditor<T>(selector: (state: EditorState) => T): T {
  return useStore(useEditorStoreApi(), selector);
}

/**
 * Actions that belong to the editor shell rather than the draft: dialogs, announcements and
 * guarded navigation. Panels call these so the shell keeps one instance of each dialog.
 */
export interface EditorServices {
  siteId: string;
  pageId: string;
  /** Other pages of the site, for page-link pickers. */
  sitePages: readonly PageSummary[];
  /** Opens "Thêm section" for an insertion at `requestedIndex`. */
  openAddSection: (requestedIndex: number) => void;
  /** Speaks a message through the editor's polite live region. */
  announce: (message: string) => void;
  /** Selects the section of a check target, opens the panel and focuses the field. */
  focusTarget: (target: CheckTarget) => void;
  /** In-app navigation that asks first when changes are not saved yet. */
  navigate: (href: string) => void;
}

const ServicesContext = createContext<EditorServices | null>(null);

export function EditorServicesProvider({
  services,
  children,
}: {
  services: EditorServices;
  children: ReactNode;
}) {
  return <ServicesContext.Provider value={services}>{children}</ServicesContext.Provider>;
}

export function useEditorServices(): EditorServices {
  const services = useContext(ServicesContext);
  if (services === null) {
    throw new Error('useEditorServices must be used inside <EditorServicesProvider>.');
  }
  return services;
}
