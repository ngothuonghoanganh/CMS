import type { Component, ComponentDefinition, Editor } from 'grapesjs';

import {
  canInsertNode,
  canMoveNode,
  findPayloadComponent,
  moveNodeByIntent,
  type MoveNodeIntent,
} from './builder-interaction';
import {
  BUILDER_NODE_TYPE_ATTRIBUTE,
  isBuilderNodeType,
  sanitizeInlineText,
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
  return {
    dispatch: (command) => executeEditorCommand(editor, command),
    canDispatch: (command) => {
      const root = getRoot(editor);
      if (!root) return false;
      if (command.kind === 'move') return canMoveNode(root, command.intent);
      if (command.kind === 'undo') return editor.UndoManager.hasUndo();
      if (command.kind === 'redo') return editor.UndoManager.hasRedo();
      if (command.kind === 'insert') {
        const target = command.targetId ? getNode(editor, command.targetId) : undefined;
        const parent = command.parentId
          ? getNode(editor, command.parentId)
          : (target?.parent() ?? root);
        return Boolean(
          parent &&
          canInsertDefinition(parent, command.definition) &&
          (!target || target.parent() === parent),
        );
      }
      if ('nodeId' in command) {
        const node = getNode(editor, command.nodeId);
        return Boolean(node && (command.kind !== 'remove' || node !== root));
      }
      return true;
    },
  };
}

export function executeEditorCommand(
  editor: Editor,
  command: EditorCommand,
): EditorCommandResult {
  const root = getRoot(editor);
  if (!root) return { changed: false };

  switch (command.kind) {
    case 'insert': {
      const requestedTarget = command.targetId
        ? getNode(editor, command.targetId)
        : undefined;
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
      editor.select(node);
      editor.runCommand('tlb-clone');
      const selection = editor.getSelected();
      return selection ? { changed: true, selection } : { changed: true };
    }
    case 'set-content': {
      return executeEditorCommand(editor, {
        kind: 'update-props',
        nodeId: command.nodeId,
        content: command.content,
      });
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
      updateEditorViewportStyle(node, command.viewport, command.property, command.value);
      return { changed: true, selection: node };
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
