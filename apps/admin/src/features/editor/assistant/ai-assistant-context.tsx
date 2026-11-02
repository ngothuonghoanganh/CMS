'use client';

import { type AiSuggestionResult, aiSuggestionEventSchema, endpoints } from '@plp/contracts';
import { useQueryClient } from '@tanstack/react-query';
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { ApiError, streamEndpoint } from '../../../lib/api';
import { aiQueryKeys } from '../../ai-create/queries';
import { problemMessage, reportUnexpected } from '../../shell/problem-message';
import { useEditor } from '../editor-context';
import { PROPERTIES_PANEL_ID } from '../focus-target';
import type { DraftSnapshot, EditorStore } from '../store';
import {
  acceptedChangesOf,
  type AssistAsk,
  changeKeyOf,
  conflictOf,
  failureReasonOf,
  type FocusedText,
  mergeRetry,
  retryAskOf,
  runningLabelOf,
  type ScopeConflict,
  type ScopeText,
  scopeTextOf,
  scopeTitleOf,
  suggestionRequestOf,
} from './assistant-model';

/** A request as it was sent: what it asked, the scope's text then, and the scope's name. */
export interface SentAsk {
  ask: AssistAsk;
  sent: ScopeText;
  title: string;
}

/** The scope changed while the AI wrote: `shown` asks, `accepted` lets applying overwrite. */
export type AssistConflict =
  { state: 'none' } | { state: 'shown' | 'accepted'; changes: ScopeConflict };

/**
 * Where the assistant is (board 21). `applied` keeps the draft the apply made, so "Hoàn tác"
 * undoes that step only.
 */
export type AssistPhase =
  | { kind: 'idle' }
  | ({ kind: 'running' } & SentAsk)
  | ({
      kind: 'result';
      result: AiSuggestionResult;
      excluded: ReadonlySet<string>;
      conflict: AssistConflict;
      /** The failed part "Thử lại" writes again now, and what came of the last retry. */
      retrying: string | null;
      retryNote: string | null;
    } & SentAsk)
  | ({ kind: 'failed'; reason: string } & SentAsk)
  | { kind: 'applied'; count: number; draft: DraftSnapshot };

export interface AiAssistant {
  phase: AssistPhase;
  /** A line after "Hủy" or "Bỏ": the draft did not change. */
  notice: string | null;
  focused: FocusedText | null;
  /** Sections the AI reads now ("AI đang đọc" on the canvas). */
  reading: ReadonlySet<string>;
  ask: (ask: AssistAsk) => void;
  cancel: () => void;
  retryPart: (key: string) => void;
  /** "Tạo lại với nội dung mới" and "Thử lại": the same request with the scope's text now. */
  askAgain: () => void;
  /** "Vẫn xem gợi ý": applying will overwrite what changed meanwhile. */
  keepSuggestions: () => void;
  toggle: (key: string) => void;
  discard: () => void;
  apply: () => void;
  undoApplied: () => void;
}

const AssistantContext = createContext<AiAssistant | null>(null);

const NO_SECTIONS: ReadonlySet<string> = new Set();

/**
 * What the assistant moves focus to after a change of state, the first that can take it: the
 * actions fall back to the "Trợ lý AI" tab while every chip is disabled (no uses left).
 */
export const AI_FOCUS = {
  actions: ['[data-ai-focus="actions"]:not(:disabled)', '[data-ai-focus="tab"]'],
  cancel: ['[data-ai-focus="cancel"]'],
  result: ['[data-ai-focus="result"]'],
  conflict: ['[data-ai-focus="conflict"]'],
  failed: ['[data-ai-focus="failed"]'],
  undo: ['[data-ai-focus="undo"]', '[data-ai-focus="tab"]'],
} as const;

/** The AI tab's panel; focus inside it follows the assistant's state. */
export const AI_PANEL_ID = 'editor-ai-assistant';

/**
 * Moves focus once React has drawn the new state, when the control that had it went away (the
 * clicked chip is disabled while the AI writes, "Hủy" goes when the answer comes) or it sat in
 * the assistant's panel. Someone typing on the canvas while the AI writes keeps their focus.
 */
function focusSoon(selectors: readonly string[]): void {
  requestAnimationFrame(() => {
    const active = document.activeElement;
    const lost = active === null || active === document.body || !active.isConnected;
    if (!lost && active.closest(`#${AI_PANEL_ID}`) === null) {
      return;
    }
    for (const selector of selectors) {
      const target = document.querySelector<HTMLElement>(selector);
      if (target !== null) {
        target.focus();
        return;
      }
    }
  });
}

async function requestSuggestion(
  siteId: string,
  pageId: string,
  ask: AssistAsk,
  sent: ScopeText,
  signal: AbortSignal,
): Promise<AiSuggestionResult> {
  // Written by the stream's callback, read after it ends.
  const seen: { result: AiSuggestionResult | null } = { result: null };
  await streamEndpoint(
    endpoints.aiSuggestions,
    [siteId, pageId],
    { body: suggestionRequestOf(ask, sent), signal },
    aiSuggestionEventSchema,
    (event) => {
      if (event.type === 'result') {
        seen.result = event.result;
      }
    },
  );
  if (seen.result === null) {
    throw new Error('The suggestion stream ended without its result');
  }
  return seen.result;
}

function okCount(result: AiSuggestionResult): number {
  return result.changes.filter((change) => change.status === 'ok').length;
}

export interface AiAssistantProviderProps {
  store: EditorStore;
  siteId: string;
  pageId: string;
  announce: (message: string) => void;
  children: ReactNode;
}

/**
 * The assistant's session in the editor (ADR-031): one request at a time, its answer, and the
 * apply. A request never changes the draft; "Áp dụng" is one store command (`applyAiChanges`),
 * one undo step that autosave then saves like any edit.
 */
export function AiAssistantProvider({
  store,
  siteId,
  pageId,
  announce,
  children,
}: AiAssistantProviderProps) {
  const queryClient = useQueryClient();
  const [phase, setPhase] = useState<AssistPhase>({ kind: 'idle' });
  const [notice, setNotice] = useState<string | null>(null);
  const [focused, setFocused] = useState<FocusedText | null>(null);
  const controller = useRef<AbortController | null>(null);

  // "Đoạn chữ" is the text field focused last, on the canvas or in the properties panel.
  useEffect(() => {
    function onFocusIn(event: FocusEvent) {
      if (!(event.target instanceof Element)) {
        return;
      }
      const text = event.target.closest('[data-content-path]');
      const section = text?.closest('[data-section-id]');
      if (text && section) {
        setFocused({
          sectionId: section.getAttribute('data-section-id') ?? '',
          path: text.getAttribute('data-content-path') ?? '',
        });
        return;
      }
      if (event.target.closest(`#${PROPERTIES_PANEL_ID}`)) {
        const field = event.target.closest('[data-field-path]');
        const sectionId = store.getState().selection.sectionId;
        setFocused(
          field && sectionId !== null
            ? { sectionId, path: field.getAttribute('data-field-path') ?? '' }
            : null,
        );
      }
    }
    document.addEventListener('focusin', onFocusIn);
    return () => {
      document.removeEventListener('focusin', onFocusIn);
    };
  }, [store]);

  // Leaving the editor stops the request; the API notices and gives the use back.
  useEffect(
    () => () => {
      controller.current?.abort();
    },
    [],
  );

  /** A new request replaces the one under way, whose answer nobody waits for any more. */
  const startRequest = useCallback((): AbortController => {
    controller.current?.abort();
    const request = new AbortController();
    controller.current = request;
    return request;
  }, []);

  const setUsage = useCallback(
    (result: AiSuggestionResult) => {
      queryClient.setQueryData(aiQueryKeys.usage(siteId), result.usage);
    },
    [queryClient, siteId],
  );

  /** Why a request was refused or broke: nothing was written and no use was spent. */
  const describeFailure = useCallback(
    (error: unknown): string => {
      reportUnexpected('The AI assistant request failed', error);
      if (
        error instanceof ApiError &&
        (error.code === 'ai_quota_exhausted' || error.code === 'ai_disabled')
      ) {
        void queryClient.invalidateQueries({ queryKey: aiQueryKeys.usage(siteId) });
      }
      return error instanceof ApiError || error instanceof TypeError
        ? problemMessage(error)
        : 'Kết nối tới dịch vụ AI bị gián đoạn.';
    },
    [queryClient, siteId],
  );

  const ask = useCallback(
    (input: AssistAsk) => {
      const request = startRequest();
      const draft = store.getState().draft;
      const sent = scopeTextOf(draft, input);
      const title = scopeTitleOf(draft.composition.sections, input.scope);
      setNotice(null);
      setPhase({ kind: 'running', ask: input, sent, title });
      announce(runningLabelOf(input.action, title));
      focusSoon(AI_FOCUS.cancel);
      requestSuggestion(siteId, pageId, input, sent, request.signal).then(
        (result) => {
          if (request.signal.aborted) {
            return;
          }
          setUsage(result);
          const written = okCount(result);
          if (written === 0) {
            const reason = failureReasonOf(result.failure);
            setPhase({ kind: 'failed', ask: input, sent, title, reason });
            focusSoon(AI_FOCUS.failed);
            return;
          }
          // The editor kept working while the AI wrote: did the scope change meanwhile?
          const changes = conflictOf(sent, scopeTextOf(store.getState().draft, input), input.scope);
          setPhase({
            kind: 'result',
            ask: input,
            sent,
            title,
            result,
            excluded: new Set(),
            conflict: changes === null ? { state: 'none' } : { state: 'shown', changes },
            retrying: null,
            retryNote: null,
          });
          if (changes !== null) {
            focusSoon(AI_FOCUS.conflict);
            return;
          }
          const failed = result.changes.length - written;
          announce(
            `Có ${written} gợi ý cho ${title}.${failed > 0 ? ` ${failed} phần chưa viết được.` : ''}`,
          );
          focusSoon(AI_FOCUS.result);
        },
        (error: unknown) => {
          if (request.signal.aborted) {
            return;
          }
          setPhase({ kind: 'failed', ask: input, sent, title, reason: describeFailure(error) });
          focusSoon(AI_FOCUS.failed);
        },
      );
    },
    [store, siteId, pageId, announce, startRequest, setUsage, describeFailure],
  );

  const cancel = useCallback(() => {
    controller.current?.abort();
    controller.current = null;
    const message = 'Đã hủy. Bản nháp không đổi và lượt này không bị tính.';
    setPhase({ kind: 'idle' });
    setNotice(message);
    announce(message);
    focusSoon(AI_FOCUS.actions);
  }, [announce]);

  const askAgain = useCallback(() => {
    if (phase.kind === 'result' || phase.kind === 'failed') {
      ask(phase.ask);
    }
  }, [phase, ask]);

  const retryPart = useCallback(
    (key: string) => {
      if (phase.kind !== 'result' || phase.retrying !== null) {
        return;
      }
      const change = phase.result.changes.find((item) => changeKeyOf(item) === key);
      if (change === undefined) {
        return;
      }
      const retry = retryAskOf(phase.ask, change);
      const request = startRequest();
      // Only a retry changes the result, one at a time: it is the result to merge into.
      const { result } = phase;
      setPhase({ ...phase, retrying: key, retryNote: null });
      const sent = scopeTextOf(store.getState().draft, retry);
      requestSuggestion(siteId, pageId, retry, sent, request.signal).then(
        (retried) => {
          if (request.signal.aborted) {
            return;
          }
          setUsage(retried);
          const merged = mergeRetry(result, key, retried);
          const note = merged.written ? null : 'Vẫn chưa viết được phần này.';
          setPhase((latest) =>
            latest.kind === 'result'
              ? { ...latest, result: merged.result, retrying: null, retryNote: note }
              : latest,
          );
          announce(note ?? 'Đã viết được phần này.');
        },
        (error: unknown) => {
          if (request.signal.aborted) {
            return;
          }
          const reason = describeFailure(error);
          setPhase((latest) =>
            latest.kind === 'result' ? { ...latest, retrying: null, retryNote: reason } : latest,
          );
          announce(reason);
        },
      );
    },
    [phase, store, siteId, pageId, announce, startRequest, setUsage, describeFailure],
  );

  const keepSuggestions = useCallback(() => {
    if (phase.kind === 'result' && phase.conflict.state === 'shown') {
      setPhase({ ...phase, conflict: { state: 'accepted', changes: phase.conflict.changes } });
      focusSoon(AI_FOCUS.result);
    }
  }, [phase]);

  const toggle = useCallback((key: string) => {
    setPhase((latest) => {
      if (latest.kind !== 'result') {
        return latest;
      }
      const excluded = new Set(latest.excluded);
      if (!excluded.delete(key)) {
        excluded.add(key);
      }
      return { ...latest, excluded };
    });
  }, []);

  const discard = useCallback(() => {
    controller.current?.abort();
    controller.current = null;
    const message = 'Đã bỏ gợi ý. Bản nháp không đổi.';
    setPhase({ kind: 'idle' });
    setNotice(message);
    announce(message);
    focusSoon(AI_FOCUS.actions);
  }, [announce]);

  const apply = useCallback(() => {
    if (phase.kind !== 'result' || phase.retrying !== null) {
      return;
    }
    // The scope may have changed since the answer came: ask before overwriting.
    if (phase.conflict.state === 'none') {
      const now = scopeTextOf(store.getState().draft, phase.ask);
      const changes = conflictOf(phase.sent, now, phase.ask.scope);
      if (changes !== null) {
        setPhase({ ...phase, conflict: { state: 'shown', changes } });
        focusSoon(AI_FOCUS.conflict);
        return;
      }
    }
    const count = store.getState().applyAiChanges(acceptedChangesOf(phase.result, phase.excluded));
    if (count === 0) {
      const note = 'Không áp dụng được: những phần này không còn trong bản nháp.';
      setPhase({ ...phase, retryNote: note });
      announce(note);
      return;
    }
    setPhase({ kind: 'applied', count, draft: store.getState().draft });
    announce(`Đã áp dụng ${count} thay đổi vào bản nháp.`);
    focusSoon(AI_FOCUS.undo);
  }, [phase, store, announce]);

  const undoApplied = useCallback(() => {
    if (phase.kind !== 'applied') {
      return;
    }
    // Only the apply's own step: after another edit, Ctrl+Z walks back one step at a time.
    if (store.getState().draft === phase.draft && store.getState().undo()) {
      announce('Đã hoàn tác thay đổi của AI.');
    }
    setPhase({ kind: 'idle' });
    focusSoon(AI_FOCUS.actions);
  }, [phase, store, announce]);

  const reading = useMemo((): ReadonlySet<string> => {
    if (phase.kind === 'running') {
      // "Gợi ý SEO" reads the whole page's text.
      return new Set(
        phase.sent.sections
          .filter((section) => Object.keys(section.texts).length > 0)
          .map((section) => section.id),
      );
    }
    if (phase.kind === 'result' && phase.retrying !== null) {
      return new Set([phase.retrying.slice(0, phase.retrying.indexOf(':'))]);
    }
    return NO_SECTIONS;
  }, [phase]);

  const value = useMemo<AiAssistant>(
    () => ({
      phase,
      notice,
      focused,
      reading,
      ask,
      cancel,
      retryPart,
      askAgain,
      keepSuggestions,
      toggle,
      discard,
      apply,
      undoApplied,
    }),
    [
      phase,
      notice,
      focused,
      reading,
      ask,
      cancel,
      retryPart,
      askAgain,
      keepSuggestions,
      toggle,
      discard,
      apply,
      undoApplied,
    ],
  );

  return <AssistantContext.Provider value={value}>{children}</AssistantContext.Provider>;
}

export function useAiAssistant(): AiAssistant {
  const assistant = useContext(AssistantContext);
  if (assistant === null) {
    throw new Error('useAiAssistant must be used inside <AiAssistantProvider>.');
  }
  return assistant;
}

/** Whether the AI reads the section now; never outside the editor's assistant. */
export function useAiReading(sectionId: string): boolean {
  return useContext(AssistantContext)?.reading.has(sectionId) ?? false;
}

/**
 * The apply "Hoàn tác" can still undo, while the draft is the one it made; null otherwise, and
 * outside the editor's assistant.
 */
export function useAiApplied(): { count: number; undo: () => void } | null {
  const assistant = useContext(AssistantContext);
  const phase = assistant?.phase;
  const draft = phase?.kind === 'applied' ? phase.draft : null;
  const current = useEditor((state) => draft !== null && state.draft === draft);
  return assistant && phase?.kind === 'applied' && current
    ? { count: phase.count, undo: assistant.undoApplied }
    : null;
}
