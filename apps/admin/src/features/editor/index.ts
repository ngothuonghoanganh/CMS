// Public surface of the editor feature. Routes and other features import from here.
export {
  EditorApp,
  type EditorAppProps,
  type EditorInitialData,
  type PublishDialogRenderProps,
} from './EditorApp';
export {
  EditorServicesProvider,
  EditorStoreProvider,
  useEditor,
  useEditorServices,
  useEditorStoreApi,
  type EditorServices,
} from './editor-context';
export { ConflictDialog } from './ConflictDialog';
export { focusFieldElement, focusTarget, type FocusTargetOptions } from './focus-target';
export { LIST_LIMIT, loadAllPages, referencedAssetIds } from './load-editor-data';
export { refreshPageSummary, useLatestServerDraft } from './server-draft';
export {
  createEditorStore,
  type Device,
  type DraftSnapshot,
  type EditorInit,
  type EditorState,
  type EditorStore,
  hasUnsavedChanges,
  type SaveState,
  visibilityGroupOf,
} from './store';
export {
  AUTOSAVE_DELAY_MS,
  createDraftSaver,
  DraftConflictError,
  type DraftSaver,
  useDraftSaver,
} from './use-draft-saver';
export {
  isUnsaved,
  type LeaveGuard,
  useBeforeUnloadGuard,
  useHistoryLeaveGuard,
  useLeaveGuard,
} from './use-leave-guard';
export { displayUrl, liveStatusView, SAME_AS_LIVE, saveStatusView } from './presentation';
