'use client';

import { type Asset, endpoints, type PageDetailResponse } from '@plp/contracts';
import { useEffect } from 'react';
import { api } from '../../lib/api';
import { loadAssetsByIds } from '../assets/load-assets-by-ids';
import { referencedAssetIds } from './load-editor-data';
import type { EditorState, EditorStore } from './store';
import { runningSavesSettled } from './use-draft-saver';

/** The assets a draft from the server references that the store does not know yet. */
export async function loadMissingAssets(
  state: Pick<EditorState, 'site' | 'assetsById'>,
  detail: PageDetailResponse,
): Promise<Asset[]> {
  const missing = [
    ...referencedAssetIds(detail.draft.composition, detail.draft.seo, state.site),
  ].filter((id) => state.assetsById[id] === undefined);
  if (missing.length === 0) {
    return [];
  }
  return loadAssetsByIds(missing, (ids) =>
    api(endpoints.listAssets, [state.site.id], { query: { ids } }),
  );
}

/**
 * Replaces the store's draft with the server's (conflict reload, "Quay về bản live"), after
 * loading the images it references, so they do not look deleted from the library.
 */
export async function replaceWithServerDraft(
  store: EditorStore,
  detail: PageDetailResponse,
): Promise<void> {
  const assets = await loadMissingAssets(store.getState(), detail);
  store.getState().replaceDraftFromServer(detail, assets);
}

function isAbort(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError';
}

/**
 * Browser Back/Forward restores a screen from the router's cached payload, whose draft and base
 * revision can be older than the server's (the user kept editing before leaving). The store is
 * built from that payload, so the page is read again once on mount, and while nothing was edited
 * since:
 * - a newer draft replaces the store's (with the images it uses);
 * - the same draft still refreshes the page summary and checks (a rollback or publish elsewhere).
 * Once the user edits, the store is left alone: if it was outdated, the next save gets a 409 and
 * the conflict dialog offers the reload, so an answer racing an autosave never discards an edit.
 * The read waits for saves of the page still running in this tab: the screen left just now saves
 * its pending changes on the way out, and the answer must include them.
 */
export function useLatestServerDraft(store: EditorStore): void {
  useEffect(() => {
    const controller = new AbortController();
    const loaded = store.getState();

    async function check() {
      await runningSavesSettled(loaded.page.id);
      const detail = await api(endpoints.getPage, [loaded.page.id], {
        signal: controller.signal,
      });
      const untouched = () => {
        const current = store.getState();
        return (
          current.draftVersion === loaded.draftVersion &&
          current.baseRevision === loaded.baseRevision &&
          current.saveState === 'saved'
        );
      };
      if (!untouched()) {
        return;
      }
      if (detail.draft.revision === loaded.baseRevision) {
        store.getState().setServerState({ page: detail.page, checks: detail.checks });
        return;
      }
      const assets = await loadMissingAssets(store.getState(), detail);
      if (!controller.signal.aborted && untouched()) {
        store.getState().replaceDraftFromServer(detail, assets);
      }
    }

    check().catch((error: unknown) => {
      if (controller.signal.aborted && isAbort(error)) {
        return;
      }
      // The editor keeps the loaded draft; if it is outdated, the next save reports the conflict.
      console.error('Checking whether the draft changed on the server failed', error);
    });
    return () => {
      controller.abort();
    };
  }, [store]);
}
