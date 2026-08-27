import type { Component, ComponentDefinition, Editor } from 'grapesjs';

import {
  findPayloadComponent,
  moveNodeByIntent,
  type MoveNodeIntent,
} from './builder-interaction';
import { updateEditorViewportStyle, type BuilderViewport } from './builder-adapter';

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

function getRoot(editor: Editor): Component | undefined {
  return editor.getComponents().models[0];
}

function getNode(editor: Editor, nodeId: string): Component | undefined {
  const root = getRoot(editor);
  return root ? findPayloadComponent(root, nodeId) : undefined;
}

export function executeEditorCommand(
  editor: Editor,
  command: EditorCommand,
): EditorCommandResult {
  const root = getRoot(editor);
  if (!root) return { changed: false };

  switch (command.kind) {
    case 'insert': {
      const parent = command.parentId ? getNode(editor, command.parentId) : root;
      const created = parent?.append(command.definition) ?? [];
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
      editor.select(node);
      editor.runCommand('core:component-delete');
      return { changed: true };
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
      if (command.content !== undefined) node.set('content', command.content);
      if (command.attributes) {
        node.setAttributes({
          ...node.getAttributes({ noStyle: true }),
          ...command.attributes,
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
      const selection = editor.getSelected();
      return selection ? { changed: true, selection } : { changed: true };
    }
    case 'redo': {
      if (!editor.UndoManager.hasRedo()) return { changed: false };
      editor.runCommand('core:redo');
      const selection = editor.getSelected();
      return selection ? { changed: true, selection } : { changed: true };
    }
  }
}
