import type { Component, ComponentDefinition, Editor } from 'grapesjs';
import { CountdownPropsSchema, ListPropsSchema } from '@payload/contracts';

import {
  canInsertNode,
  canMoveNode,
  findPayloadComponent,
  moveNodeByIntent,
  type MoveNodeIntent,
} from './builder-interaction';
import { resolveEditorPropertyUpdate } from './component-editor-bindings';
import {
  BUILDER_NODE_TYPE_ATTRIBUTE,
  BUILDER_COUNTDOWN_PROPS_ATTRIBUTE,
  isBuilderNodeType,
  reassignEditorNodeIds,
  sanitizeInlineText,
  listPreviewComponents,
  formPreviewComponents,
  updateEditorViewportStyle,
  type BuilderViewport,
  type BuilderNodeType,
} from './builder-adapter';

/**
 * The builder deliberately keeps GrapesJS as the Model-A document engine.
 * This command boundary is the single mutation vocabulary used by the CMS
 * surfaces; it prevents Canvas, Layers and Inspector from inventing separate
 * mutation semantics while leaving the persisted PagePayload unchanged.
 */
export type EditorCommand =
  | {
      kind: 'insert';
      definition: ComponentDefinition;
      parentId?: string | undefined;
      targetId?: string | undefined;
      position?: 'before' | 'after' | undefined;
    }
  | { kind: 'move'; intent: MoveNodeIntent }
  | { kind: 'remove'; nodeId: string }
  | { kind: 'duplicate'; nodeId: string }
  | {
      kind: 'update-props';
      nodeId: string;
      content?: string | undefined;
      attributes?: Record<string, string> | undefined;
      components?: ComponentDefinition[] | undefined;
    }
  | { kind: 'set-content'; nodeId: string; content: string }
  | { kind: 'set-property'; nodeId: string; property: string; value: unknown }
  | { kind: 'set-attributes'; attributes: Record<string, string>; nodeId: string }
  | { kind: 'set-style'; nodeId: string; style: Record<string, string> }
  | {
      kind: 'set-responsive-style';
      nodeId: string;
      property: string;
      value: string;
      viewport: BuilderViewport;
    }
  | { kind: 'undo' }
  | { kind: 'redo' };

export type EditorCommandResult = {
  changed: boolean;
  selection?: Component;
};

export type BuilderCommandBus = {
  dispatch: (command: EditorCommand) => EditorCommandResult;
  canDispatch: (command: EditorCommand) => boolean;
};

let duplicateHistorySequence = 0;

type HistoryEntry = { set?: (key: string, value: unknown) => void };

function getHistoryEntries(editor: Editor): HistoryEntry[] {
  const getStack = (editor.UndoManager as unknown as { getStack?: () => unknown })
    .getStack;
  if (typeof getStack !== 'function') return [];
  const stack = getStack.call(editor.UndoManager) as
    { models?: HistoryEntry[] } | HistoryEntry[];
  return Array.isArray(stack) ? stack : (stack.models ?? []);
}

function isolateNewHistoryActions(
  editor: Editor,
  previousEntries: Set<HistoryEntry>,
): void {
  const entries = getHistoryEntries(editor).filter(
    (entry) => !previousEntries.has(entry),
  );
  if (entries.length === 0) return;
  const marker = `builder-duplicate-${++duplicateHistorySequence}`;
  entries.forEach((entry) => {
    entry.set?.('magicFusionIndex', marker);
  });
}

function getRoot(editor: Editor): Component | undefined {
  return editor.getComponents().models[0];
}

function getNode(editor: Editor, nodeId: string): Component | undefined {
  const root = getRoot(editor);
  return root ? findPayloadComponent(root, nodeId) : undefined;
}

function definitionNodeType(
  definition: ComponentDefinition,
): BuilderNodeType | undefined {
  const type = definition.attributes?.[BUILDER_NODE_TYPE_ATTRIBUTE];
  return typeof type === 'string' && isBuilderNodeType(type) ? type : undefined;
}

function canInsertDefinition(
  parent: Component,
  definition: ComponentDefinition,
): boolean {
  const parentType = parent.getAttributes({ noStyle: true })[BUILDER_NODE_TYPE_ATTRIBUTE];
  const childType = definitionNodeType(definition);
  if (!isBuilderNodeType(parentType) || !childType) return false;
  // `droppable` is presentation behavior; command validation remains domain
  // driven and therefore also applies to Quick Add, Layers and keyboard paths.
  return canInsertNode(parentType, childType);
}

export function createEditorCommandBus(editor: Editor): BuilderCommandBus {
  const bus: BuilderCommandBus = {
    dispatch: (command) => {
      if (!bus.canDispatch(command)) return { changed: false };
      try {
        return executeEditorCommand(editor, command);
      } catch {
        // A command is a safety boundary for untrusted inspector values. The
        // caller can treat a failed dispatch as a no-op and keep the live
        // document intact.
        return { changed: false };
      }
    },
    canDispatch: (command) => {
      const root = getRoot(editor);
      if (!root) return false;
      if (command.kind === 'move') return canMoveNode(root, command.intent);
      if (command.kind === 'undo') return editor.UndoManager.hasUndo();
      if (command.kind === 'redo') return editor.UndoManager.hasRedo();
      if (command.kind === 'insert') {
        const hasTarget = command.targetId !== undefined;
        const target = hasTarget ? getNode(editor, command.targetId ?? '') : undefined;
        if (hasTarget && !target) return false;
        const parent = command.parentId
          ? getNode(editor, command.parentId)
          : (target?.parent() ?? root);
        return Boolean(
          parent &&
          canInsertDefinition(parent, command.definition) &&
          (!target || target.parent() === parent),
        );
      }
      if (command.kind === 'set-property') {
        const node = getNode(editor, command.nodeId);
        if (!node) return false;
        const type = node.getAttributes({ noStyle: true })[BUILDER_NODE_TYPE_ATTRIBUTE];
        if (!isBuilderNodeType(type)) return false;
        try {
          let property = command.property;
          const value =
            type === 'list' && command.property === 'ordered'
              ? {
                  ...ListPropsSchema.parse(
                    JSON.parse(
                      String(
                        node.getAttributes({ noStyle: true })['data-payload-list-props'],
                      ),
                    ) as unknown,
                  ),
                  ordered: command.value,
                }
              : type === 'countdown' &&
                  (command.property === 'label' || command.property === 'targetAt')
                ? {
                    ...CountdownPropsSchema.parse(
                      JSON.parse(
                        String(
                          node.getAttributes({ noStyle: true })[
                            BUILDER_COUNTDOWN_PROPS_ATTRIBUTE
                          ],
                        ),
                      ) as unknown,
                    ),
                    [command.property]: command.value,
                  }
                : command.value;
          if (type === 'list' && command.property === 'ordered') property = 'items';
          return Boolean(resolveEditorPropertyUpdate(type, property, value));
        } catch {
          return false;
        }
      }
      if ('nodeId' in command) {
        const node = getNode(editor, command.nodeId);
        return Boolean(node && (command.kind !== 'remove' || node !== root));
      }
      return true;
    },
  };
  return bus;
}

export function executeEditorCommand(
  editor: Editor,
  command: EditorCommand,
): EditorCommandResult {
  const root = getRoot(editor);
  if (!root) return { changed: false };

  switch (command.kind) {
    case 'insert': {
      const hasTarget = command.targetId !== undefined;
      const requestedTarget = command.targetId
        ? getNode(editor, command.targetId)
        : undefined;
      if (hasTarget && !requestedTarget) return { changed: false };
      const parent = command.parentId
        ? getNode(editor, command.parentId)
        : (requestedTarget?.parent() ?? root);
      if (!parent || !canInsertDefinition(parent, command.definition)) {
        return { changed: false };
      }
      let at: number | undefined;
      if (requestedTarget) {
        if (requestedTarget.parent() !== parent) return { changed: false };
        at = requestedTarget.index() + (command.position === 'after' ? 1 : 0);
      }
      const created = parent.append(
        command.definition,
        at === undefined ? undefined : { at },
      );
      const selection = created[0];
      return selection ? { changed: true, selection } : { changed: false };
    }
    case 'move': {
      const result = moveNodeByIntent(root, command.intent);
      if (!result.valid) return { changed: false };
      return { changed: true, selection: result.source };
    }
    case 'remove': {
      const node = getNode(editor, command.nodeId);
      if (!node || node === root) return { changed: false };
      const fallback = node.parent() ?? root;
      editor.select(node);
      editor.runCommand('core:component-delete');
      return { changed: true, selection: fallback };
    }
    case 'duplicate': {
      const node = getNode(editor, command.nodeId);
      if (!node || node === root) return { changed: false };
      const parent = node.parent();
      const existingChildren = parent?.components().models.slice() ?? [];
      const previousHistoryEntries = new Set(getHistoryEntries(editor));
      editor.select(node);
      editor.runCommand('tlb-clone');
      // GrapesJS does not promise that `tlb-clone` leaves the clone selected.
      // Resolve the newly added sibling by identity so ID repair never mutates
      // the source node while leaving its duplicate with a stale Page ID.
      const clone = parent
        ?.components()
        .models.find((candidate) => !existingChildren.includes(candidate));
      const selection = clone ?? editor.getSelected();
      const duplicate = clone ?? selection;
      if (duplicate) {
        // Native clone events are guarded in GrapesEditor, but the command
        // itself owns the identity transition so every command invocation
        // produces a fresh PagePayload subtree without an extra undo action.
        editor.getModel().skip(() => reassignEditorNodeIds(duplicate));
      }
      if (clone) editor.select(clone);
      isolateNewHistoryActions(editor, previousHistoryEntries);
      return selection ? { changed: true, selection } : { changed: true };
    }
    case 'set-content': {
      return executeEditorCommand(editor, {
        kind: 'update-props',
        nodeId: command.nodeId,
        content: command.content,
      });
    }
    case 'set-property': {
      const node = getNode(editor, command.nodeId);
      if (!node) return { changed: false };
      const type = node.getAttributes({ noStyle: true })[BUILDER_NODE_TYPE_ATTRIBUTE];
      if (!isBuilderNodeType(type)) return { changed: false };
      let value = command.value;
      let property = command.property;
      if (type === 'list' && command.property === 'ordered') {
        const raw = node.getAttributes({ noStyle: true })['data-payload-list-props'];
        let current: unknown;
        try {
          current = JSON.parse(String(raw)) as unknown;
        } catch {
          return { changed: false };
        }
        const parsed = ListPropsSchema.safeParse(current);
        if (!parsed.success || typeof command.value !== 'boolean')
          return { changed: false };
        value = { ...parsed.data, ordered: command.value };
        property = 'items';
      }
      if (
        type === 'countdown' &&
        (command.property === 'label' || command.property === 'targetAt')
      ) {
        const raw = node.getAttributes({ noStyle: true })[
          BUILDER_COUNTDOWN_PROPS_ATTRIBUTE
        ];
        let current: unknown;
        try {
          current = JSON.parse(String(raw)) as unknown;
        } catch {
          return { changed: false };
        }
        const parsed = CountdownPropsSchema.safeParse(current);
        if (!parsed.success || typeof command.value !== 'string') {
          return { changed: false };
        }
        value = { ...parsed.data, [command.property]: command.value };
      }
      const update = resolveEditorPropertyUpdate(type, property, value);
      if (!update) return { changed: false };
      if (update.kind === 'content') {
        node.set('content', update.value);
      } else {
        node.setAttributes({
          ...node.getAttributes({ noStyle: true }),
          ...update.attributes,
        });
        if (update.tagName) node.set('tagName', update.tagName);
        if (update.listProps) {
          // List item controls are editor-only descendants. Their semantic
          // representation is the validated list props JSON above.
          node.set('tagName', update.listProps.ordered ? 'ol' : 'ul');
          node.components(listPreviewComponents(update.listProps));
        }
        if (update.formProps) node.components(formPreviewComponents(update.formProps));
      }
      return { changed: true, selection: node };
    }
    case 'set-attributes': {
      return executeEditorCommand(editor, {
        kind: 'update-props',
        nodeId: command.nodeId,
        attributes: command.attributes,
      });
    }
    case 'update-props': {
      const node = getNode(editor, command.nodeId);
      if (!node) return { changed: false };
      const nodeType = node.getAttributes({ noStyle: true })[BUILDER_NODE_TYPE_ATTRIBUTE];
      if (command.components && nodeType !== 'form' && nodeType !== 'countdown') {
        return { changed: false };
      }
      if (command.content !== undefined) {
        node.set('content', sanitizeInlineText(command.content));
      }
      if (command.attributes) {
        const safeAttributes = Object.fromEntries(
          Object.entries(command.attributes).filter(
            ([key]) => key !== 'data-payload-node-id' && key !== 'data-payload-node-type',
          ),
        );
        node.setAttributes({
          ...node.getAttributes({ noStyle: true }),
          ...safeAttributes,
        });
      }
      if (command.components) node.components(command.components);
      return { changed: true, selection: node };
    }
    case 'set-style': {
      const node = getNode(editor, command.nodeId);
      if (!node) return { changed: false };
      node.setStyle(command.style);
      return { changed: true, selection: node };
    }
    case 'set-responsive-style': {
      const node = getNode(editor, command.nodeId);
      if (!node) return { changed: false };
      const changed = updateEditorViewportStyle(
        node,
        command.viewport,
        command.property,
        command.value,
      );
      return changed ? { changed: true, selection: node } : { changed: false };
    }
    case 'undo': {
      if (!editor.UndoManager.hasUndo()) return { changed: false };
      editor.runCommand('core:undo');
      const selection = editor.getSelected() ?? root;
      return selection ? { changed: true, selection } : { changed: true };
    }
    case 'redo': {
      if (!editor.UndoManager.hasRedo()) return { changed: false };
      editor.runCommand('core:redo');
      const selection = editor.getSelected() ?? root;
      return selection ? { changed: true, selection } : { changed: true };
    }
  }
}
