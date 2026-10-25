import {
  type Asset,
  type ChecksResult,
  type ColorSchemeId,
  colorSchemeIds,
  type Composition,
  MAX_SECTIONS,
  type MobileOrder,
  mobileOrderSchema,
  type PageDetailResponse,
  type PageSummary,
  type PublicLeadCapture,
  type Role,
  type SaveDraftResponse,
  type SectionInstance,
  type SectionType,
  type Seo,
  seoSchema,
  type Site,
  slugSchema,
  type SpacingPreset,
  spacingPresets,
} from '@plp/contracts';
import {
  canMoveSection,
  createSectionInstance,
  getAtPath,
  getSectionDefinition,
  getVariant,
  insertionIndex,
  isPathWithin,
  listMinimum,
  setAtPath,
  validateComposition,
} from '@plp/sections/schema';
import { type Draft, produce } from 'immer';
import { createStore, type StoreApi } from 'zustand/vanilla';
import {
  canWriteAt,
  clampToField,
  listItemsOf,
  remapListPaths,
  resolvePath,
  samplePathsOfNewItem,
  withoutSamplePath,
} from './content-fields';

export type Device = 'desktop' | 'tablet' | 'mobile';
/** The two visibility flags of a section; the tablet preview (768 px) shows the desktop group. */
export type VisibilityGroup = 'desktop' | 'mobile';

export function visibilityGroupOf(device: Device): VisibilityGroup {
  return device === 'mobile' ? 'mobile' : 'desktop';
}

export type SaveState = 'saved' | 'dirty' | 'saving' | 'error' | 'conflict';

/** What one undo step restores. */
export interface DraftSnapshot {
  slug: string;
  composition: Composition;
  seo: Seo;
}

export interface Selection {
  sectionId: string | null;
  /** Content path to focus in the properties panel, e.g. "items.0.title". */
  fieldPath: string | null;
}

export interface SaveFailure {
  /** `invalid`: the server rejected the draft (422); `retryable`: network or server error. */
  kind: 'invalid' | 'retryable' | 'other';
  message: string;
}

export const MAX_HISTORY = 100;

export interface EditorInit {
  detail: PageDetailResponse;
  site: Site;
  assets: readonly Asset[];
  role: Role;
  /** Consent texts of the site's current settings, drawn in a lead form (ADR-017). */
  leadCapture: PublicLeadCapture | null;
  /** Section id generator; defaults to 12 lowercase alphanumerics from `crypto.randomUUID()`. */
  newId?: () => string;
}

export interface UpdateOptions {
  /**
   * Merge consecutive updates of the same field into one undo step, until `closeHistoryStep()`.
   * Inputs use it while typing and close the step on blur, so a typed word is one step.
   */
  merge?: boolean;
}

export interface EditorState {
  draft: DraftSnapshot;
  /** Server revision the draft is based on; sent with every save. */
  baseRevision: number;
  selection: Selection;
  device: Device;
  history: { past: DraftSnapshot[]; future: DraftSnapshot[] };
  saveState: SaveState;
  lastSavedAt: string | null;
  saveError: SaveFailure | null;
  page: PageSummary;
  checks: ChecksResult;
  site: Site;
  assetsById: Readonly<Record<string, Asset>>;
  role: Role;
  leadCapture: PublicLeadCapture | null;
  /** Local counter of draft changes. Everything is saved when it equals `savedVersion`. */
  draftVersion: number;
  savedVersion: number;
  /** Field whose typing currently merges into the last undo step. */
  mergeKey: string | null;

  /* Draft commands: each validates against the registry, records one undo step and returns
     false (changing nothing) when the result would be invalid. */
  addSection: (type: SectionType, variant: string | undefined, requestedIndex: number) => boolean;
  removeSection: (sectionId: string) => boolean;
  duplicateSection: (sectionId: string) => boolean;
  moveSection: (sectionId: string, toIndex: number) => boolean;
  updateContent: (
    sectionId: string,
    path: string,
    value: unknown,
    options?: UpdateOptions,
  ) => boolean;
  addListItem: (sectionId: string, listKey: string) => boolean;
  removeListItem: (sectionId: string, listKey: string, index: number) => boolean;
  moveListItem: (sectionId: string, listKey: string, fromIndex: number, toIndex: number) => boolean;
  setVariant: (sectionId: string, variant: string) => boolean;
  setColorScheme: (sectionId: string, scheme: ColorSchemeId) => boolean;
  setSpacing: (sectionId: string, spacing: SpacingPreset) => boolean;
  setVisibility: (sectionId: string, group: VisibilityGroup, visible: boolean) => boolean;
  setMobileOrder: (sectionId: string, order: MobileOrder) => boolean;
  updateSeo: (patch: Partial<Seo>, options?: UpdateOptions) => boolean;
  setSlug: (slug: string, options?: UpdateOptions) => boolean;
  undo: () => boolean;
  redo: () => boolean;
  /** Ends the merged undo step started by an update with `{ merge: true }`. */
  closeHistoryStep: () => void;

  /* View state */
  select: (sectionId: string | null, fieldPath?: string | null) => boolean;
  setDevice: (device: Device) => void;

  /* Server state */
  /**
   * Replaces the draft with the server's (conflict reload, "Quay về bản live", a stale draft
   * restored by Back/Forward). `assets` are the ones the new draft references that the store did
   * not know yet; callers load them first so images do not look deleted.
   */
  replaceDraftFromServer: (detail: PageDetailResponse, assets: readonly Asset[]) => void;
  markSaving: () => void;
  applySaved: (response: SaveDraftResponse, savedVersion: number) => void;
  markSaveFailed: (failure: SaveFailure) => void;
  markConflict: () => void;
  /** After publish, rollback or unpublish: the page summary and checks changed on the server. */
  setServerState: (update: { page?: PageSummary; checks?: ChecksResult }) => void;
  setSite: (site: Site) => void;
  addAssets: (assets: readonly Asset[]) => void;
}

export type EditorStore = StoreApi<EditorState>;

export function randomSectionId(): string {
  return crypto.randomUUID().replace(/-/g, '').slice(0, 12);
}

export function hasUnsavedChanges(state: Pick<EditorState, 'draftVersion' | 'savedVersion'>) {
  return state.draftVersion !== state.savedVersion;
}

/** A save response built from the store when there is nothing new to save. */
export function currentSaveResponse(state: EditorState): SaveDraftResponse {
  return {
    revision: state.baseRevision,
    updatedAt: state.lastSavedAt ?? state.page.updatedAt,
    page: state.page,
    checks: state.checks,
  };
}

function snapshotOf(detail: PageDetailResponse): DraftSnapshot {
  return {
    slug: detail.draft.slug,
    composition: detail.draft.composition,
    seo: detail.draft.seo,
  };
}

function indexAssets(assets: readonly Asset[]): Record<string, Asset> {
  return Object.fromEntries(assets.map((asset) => [asset.id, asset]));
}

/** A command never turns a pending conflict or a running save into "dirty". */
function dirtyStateAfter(current: SaveState): SaveState {
  return current === 'conflict' || current === 'saving' ? current : 'dirty';
}

/** Keeps the selection only while the section (and field) still exist. */
function validSelection(selection: Selection, composition: Composition): Selection {
  if (selection.sectionId === null) {
    return selection;
  }
  const exists = composition.sections.some((section) => section.id === selection.sectionId);
  return exists ? selection : { sectionId: null, fieldPath: null };
}

type SectionRecipe = (section: Draft<SectionInstance>, index: number) => boolean;

export function createEditorStore(init: EditorInit): EditorStore {
  const newId = init.newId ?? randomSectionId;

  return createStore<EditorState>()((set, get) => {
    /** Records `next` as the new draft with one undo step (or merges into the open one). */
    function commit(next: DraftSnapshot, mergeKey: string | null, selection?: Selection): true {
      const state = get();
      const merging = mergeKey !== null && state.mergeKey === mergeKey;
      const past = merging
        ? state.history.past
        : [...state.history.past, state.draft].slice(-MAX_HISTORY);
      set({
        draft: next,
        history: { past, future: [] },
        mergeKey,
        draftVersion: state.draftVersion + 1,
        saveState: dirtyStateAfter(state.saveState),
        selection: selection ?? validSelection(state.selection, next.composition),
      });
      return true;
    }

    /**
     * Applies a recipe to a copy of the draft. Returns false when the recipe refuses or the result
     * breaks a registry rule; an unchanged draft is accepted without an undo step.
     */
    function edit(
      recipe: (draft: Draft<DraftSnapshot>) => boolean,
      options: { mergeKey?: string | null; selection?: Selection } = {},
    ): boolean {
      const current = get().draft;
      const outcome = { accepted: true };
      const next = produce(current, (draft) => {
        outcome.accepted = recipe(draft);
      });
      if (!outcome.accepted) {
        return false;
      }
      if (next === current) {
        return true;
      }
      if (next.composition !== current.composition) {
        const sections = next.composition.sections;
        if (sections.length > MAX_SECTIONS || validateComposition(next.composition).length > 0) {
          return false;
        }
      }
      return commit(next, options.mergeKey ?? null, options.selection);
    }

    function editSection(sectionId: string, recipe: SectionRecipe, mergeKey?: string): boolean {
      return edit(
        (draft) => {
          const index = draft.composition.sections.findIndex((section) => section.id === sectionId);
          const section = draft.composition.sections[index];
          return section ? recipe(section, index) : false;
        },
        { mergeKey: mergeKey ?? null },
      );
    }

    function findSection(sectionId: string): SectionInstance | undefined {
      return get().draft.composition.sections.find((section) => section.id === sectionId);
    }

    function uniqueId(): string {
      const taken = new Set(get().draft.composition.sections.map((section) => section.id));
      let id = newId();
      while (taken.has(id)) {
        id = newId();
      }
      return id;
    }

    function listOf(section: SectionInstance, listKey: string) {
      const target = resolvePath(section.type, listKey);
      return target?.kind === 'list' ? target.field : null;
    }

    function step(direction: 'undo' | 'redo'): boolean {
      const state = get();
      const source = direction === 'undo' ? state.history.past : state.history.future;
      const target = source[source.length - 1];
      if (!target) {
        return false;
      }
      const remaining = source.slice(0, -1);
      const other = direction === 'undo' ? state.history.future : state.history.past;
      const moved = [...other, state.draft].slice(-MAX_HISTORY);
      set({
        draft: target,
        history:
          direction === 'undo'
            ? { past: remaining, future: moved }
            : { past: moved, future: remaining },
        mergeKey: null,
        draftVersion: state.draftVersion + 1,
        saveState: dirtyStateAfter(state.saveState),
        selection: validSelection(state.selection, target.composition),
      });
      return true;
    }

    return {
      draft: snapshotOf(init.detail),
      baseRevision: init.detail.draft.revision,
      selection: { sectionId: null, fieldPath: null },
      device: 'desktop',
      history: { past: [], future: [] },
      saveState: 'saved',
      lastSavedAt: init.detail.draft.updatedAt,
      saveError: null,
      page: init.detail.page,
      checks: init.detail.checks,
      site: init.site,
      assetsById: indexAssets(init.assets),
      role: init.role,
      leadCapture: init.leadCapture,
      draftVersion: 0,
      savedVersion: 0,
      mergeKey: null,

      addSection(type, variant, requestedIndex) {
        const definition = getSectionDefinition(type);
        const variantId = variant ?? definition.defaultVariant;
        const sections = get().draft.composition.sections;
        if (
          !getVariant(definition, variantId) ||
          sections.length >= MAX_SECTIONS ||
          (definition.singleton && sections.some((section) => section.type === type))
        ) {
          return false;
        }
        const index = insertionIndex(sections, type, requestedIndex);
        const instance = createSectionInstance(type, variantId, uniqueId());
        return edit(
          (draft) => {
            draft.composition.sections.splice(index, 0, instance);
            return true;
          },
          { selection: { sectionId: instance.id, fieldPath: null } },
        );
      },

      removeSection(sectionId) {
        return edit((draft) => {
          const index = draft.composition.sections.findIndex((section) => section.id === sectionId);
          if (index === -1) {
            return false;
          }
          draft.composition.sections.splice(index, 1);
          return true;
        });
      },

      duplicateSection(sectionId) {
        const sections = get().draft.composition.sections;
        const index = sections.findIndex((section) => section.id === sectionId);
        const original = sections[index];
        if (
          !original ||
          getSectionDefinition(original.type).singleton ||
          sections.length >= MAX_SECTIONS
        ) {
          return false;
        }
        const copy: SectionInstance = { ...structuredClone(original), id: uniqueId() };
        return edit(
          (draft) => {
            draft.composition.sections.splice(index + 1, 0, copy);
            return true;
          },
          { selection: { sectionId: copy.id, fieldPath: null } },
        );
      },

      moveSection(sectionId, toIndex) {
        const sections = get().draft.composition.sections;
        const fromIndex = sections.findIndex((section) => section.id === sectionId);
        if (fromIndex === -1 || !canMoveSection(sections, fromIndex, toIndex)) {
          return false;
        }
        return edit((draft) => {
          const [moving] = draft.composition.sections.splice(fromIndex, 1);
          if (!moving) {
            return false;
          }
          draft.composition.sections.splice(toIndex, 0, moving);
          return true;
        });
      },

      updateContent(sectionId, path, value, options = {}) {
        const section = findSection(sectionId);
        if (!section) {
          return false;
        }
        const target = resolvePath(section.type, path);
        if (target?.kind !== 'leaf' || !canWriteAt(section.content, path)) {
          return false;
        }
        const nextValue = clampToField(target, value);
        if (Object.is(nextValue, getAtPath(section.content, path))) {
          return true;
        }
        const content = setAtPath(section.content, path, nextValue);
        return editSection(
          sectionId,
          (draft) => {
            draft.content = content;
            draft.samplePaths = withoutSamplePath(draft.samplePaths, path);
            return true;
          },
          options.merge ? `content:${sectionId}:${path}` : undefined,
        );
      },

      addListItem(sectionId, listKey) {
        const section = findSection(sectionId);
        const list = section ? listOf(section, listKey) : null;
        if (!section || !list) {
          return false;
        }
        const items = listItemsOf(section.content, listKey);
        if (items.length >= list.max) {
          return false;
        }
        const item = list.newItem();
        const content = setAtPath(section.content, listKey, [...items, item]);
        const added = samplePathsOfNewItem(section, listKey, item, items.length);
        return editSection(sectionId, (draft) => {
          draft.content = content;
          draft.samplePaths = [...draft.samplePaths, ...added];
          return true;
        });
      },

      removeListItem(sectionId, listKey, index) {
        const section = findSection(sectionId);
        const list = section ? listOf(section, listKey) : null;
        if (!section || !list) {
          return false;
        }
        const items = listItemsOf(section.content, listKey);
        if (
          items.length <= listMinimum(section.type, section.variant, listKey) ||
          index < 0 ||
          index >= items.length
        ) {
          return false;
        }
        const content = setAtPath(
          section.content,
          listKey,
          items.filter((_item, itemIndex) => itemIndex !== index),
        );
        const selection = get().selection;
        const removedPath = `${listKey}.${index}`;
        const keepField =
          selection.sectionId !== sectionId ||
          selection.fieldPath === null ||
          !isPathWithin(selection.fieldPath, removedPath);
        const done = editSection(sectionId, (draft) => {
          draft.content = content;
          draft.samplePaths = remapListPaths(draft.samplePaths, listKey, (old) =>
            old === index ? null : old > index ? old - 1 : old,
          );
          return true;
        });
        if (done && !keepField) {
          set({ selection: { sectionId, fieldPath: null } });
        }
        return done;
      },

      moveListItem(sectionId, listKey, fromIndex, toIndex) {
        const section = findSection(sectionId);
        const list = section ? listOf(section, listKey) : null;
        if (!section || !list) {
          return false;
        }
        const items = listItemsOf(section.content, listKey);
        const inRange = (value: number) => value >= 0 && value < items.length;
        if (!inRange(fromIndex) || !inRange(toIndex) || fromIndex === toIndex) {
          return false;
        }
        const reordered = [...items];
        const [moving] = reordered.splice(fromIndex, 1);
        if (!moving) {
          return false;
        }
        reordered.splice(toIndex, 0, moving);
        const content = setAtPath(section.content, listKey, reordered);
        const order = reordered.map((item) => items.indexOf(item));
        return editSection(sectionId, (draft) => {
          draft.content = content;
          draft.samplePaths = remapListPaths(draft.samplePaths, listKey, (old) =>
            order.indexOf(old),
          );
          return true;
        });
      },

      setVariant(sectionId, variant) {
        const section = findSection(sectionId);
        const definition = section ? getSectionDefinition(section.type) : undefined;
        if (!section || !definition || !getVariant(definition, variant)) {
          return false;
        }
        // A variant can need more list items than the current one (the benefits grid needs 3,
        // the alternating layout 2): new sample items, marked as sample, fill the gap.
        let content = section.content;
        const addedSamples: string[] = [];
        for (const field of definition.fields) {
          if (field.kind !== 'list') {
            continue;
          }
          const items = listItemsOf(content, field.key);
          const missing = listMinimum(section.type, variant, field.key) - items.length;
          if (missing <= 0) {
            continue;
          }
          const extra = Array.from({ length: missing }, () => field.newItem());
          extra.forEach((item, offset) => {
            addedSamples.push(
              ...samplePathsOfNewItem(
                { ...section, variant },
                field.key,
                item,
                items.length + offset,
              ),
            );
          });
          content = setAtPath(content, field.key, [...items, ...extra]);
        }
        return editSection(sectionId, (draft) => {
          draft.variant = variant;
          if (content !== section.content) {
            draft.content = content;
            draft.samplePaths = [...draft.samplePaths, ...addedSamples];
          }
          return true;
        });
      },

      setColorScheme(sectionId, scheme) {
        if (!colorSchemeIds.includes(scheme)) {
          return false;
        }
        return editSection(sectionId, (draft) => {
          draft.colorScheme = scheme;
          return true;
        });
      },

      setSpacing(sectionId, spacing) {
        if (!spacingPresets.includes(spacing)) {
          return false;
        }
        return editSection(sectionId, (draft) => {
          draft.spacing = spacing;
          return true;
        });
      },

      setVisibility(sectionId, group, visible) {
        return editSection(sectionId, (draft) => {
          draft.visibility[group] = visible;
          return true;
        });
      },

      setMobileOrder(sectionId, order) {
        const section = findSection(sectionId);
        const variant = section
          ? getVariant(getSectionDefinition(section.type), section.variant)
          : undefined;
        if (!variant?.hasMedia || !mobileOrderSchema.safeParse(order).success) {
          return false;
        }
        return editSection(sectionId, (draft) => {
          draft.mobileOrder = order;
          return true;
        });
      },

      updateSeo(patch, options = {}) {
        const next = { ...get().draft.seo, ...patch };
        if (!seoSchema.safeParse(next).success) {
          return false;
        }
        const fields = Object.keys(patch).sort().join(',');
        return edit(
          (draft) => {
            Object.assign(draft.seo, patch);
            return true;
          },
          { mergeKey: options.merge ? `seo:${fields}` : null },
        );
      },

      setSlug(slug, options = {}) {
        const parsed = slugSchema.safeParse(slug);
        if (!parsed.success || parsed.data !== slug) {
          return false;
        }
        return edit(
          (draft) => {
            draft.slug = slug;
            return true;
          },
          { mergeKey: options.merge ? 'slug' : null },
        );
      },

      undo: () => step('undo'),
      redo: () => step('redo'),

      closeHistoryStep() {
        if (get().mergeKey !== null) {
          set({ mergeKey: null });
        }
      },

      select(sectionId, fieldPath = null) {
        if (sectionId !== null && !findSection(sectionId)) {
          return false;
        }
        const selection = { sectionId, fieldPath: sectionId === null ? null : fieldPath };
        const current = get().selection;
        const changed =
          current.sectionId !== selection.sectionId || current.fieldPath !== selection.fieldPath;
        // A field that unmounts with the selection (Escape closes the panel) never blurs, so the
        // typing step it opened ends here: the next typing in that field is a new undo step.
        set(changed ? { selection, mergeKey: null } : { selection });
        return true;
      },

      setDevice(device) {
        set({ device });
      },

      replaceDraftFromServer(detail, assets) {
        const state = get();
        const draft = snapshotOf(detail);
        const version = state.draftVersion + 1;
        set({
          draft,
          assetsById:
            assets.length === 0
              ? state.assetsById
              : { ...state.assetsById, ...indexAssets(assets) },
          baseRevision: detail.draft.revision,
          page: detail.page,
          checks: detail.checks,
          history: { past: [], future: [] },
          mergeKey: null,
          saveState: 'saved',
          saveError: null,
          lastSavedAt: detail.draft.updatedAt,
          draftVersion: version,
          savedVersion: version,
          selection: validSelection(state.selection, draft.composition),
        });
      },

      markSaving() {
        set({ saveState: 'saving' });
      },

      applySaved(response, savedVersion) {
        const state = get();
        if (state.saveState === 'conflict') {
          return;
        }
        set({
          baseRevision: response.revision,
          page: response.page,
          checks: response.checks,
          lastSavedAt: response.updatedAt,
          savedVersion,
          saveError: null,
          saveState: state.draftVersion === savedVersion ? 'saved' : 'dirty',
        });
      },

      markSaveFailed(failure) {
        if (get().saveState === 'conflict') {
          return;
        }
        set({ saveState: 'error', saveError: failure });
      },

      markConflict() {
        set({ saveState: 'conflict', saveError: null });
      },

      setServerState(update) {
        set({
          ...(update.page ? { page: update.page } : {}),
          ...(update.checks ? { checks: update.checks } : {}),
        });
      },

      setSite(site) {
        set({ site });
      },

      addAssets(assets) {
        if (assets.length === 0) {
          return;
        }
        set({ assetsById: { ...get().assetsById, ...indexAssets(assets) } });
      },
    };
  });
}
