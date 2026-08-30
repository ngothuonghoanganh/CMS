import type { Component, Editor } from 'grapesjs';

import { findPayloadComponent, payloadNodeId } from './builder-placement';

/** Session-only selection identity. Persisted PagePayload never contains this. */
export class BuilderSelection {
  private selectedNodeId: string | null = null;

  get id(): string | null {
    return this.selectedNodeId;
  }

  set(component: Component | undefined | null): string | null {
    this.selectedNodeId = component ? (payloadNodeId(component) ?? null) : null;
    return this.selectedNodeId;
  }

  setId(id: string | null): void {
    this.selectedNodeId = id;
  }

  clear(): void {
    this.selectedNodeId = null;
  }

  resolve(root: Component): Component | undefined {
    return this.selectedNodeId
      ? findPayloadComponent(root, this.selectedNodeId)
      : undefined;
  }

  /** Reconcile a deleted/undone component to a deterministic surviving node. */
  reconcile(root: Component, fallback?: Component): Component | undefined {
    const selected = this.resolve(root);
    if (selected) return selected;
    const next = fallback ?? root;
    this.set(next);
    return next;
  }

  select(editor: Editor, component: Component | undefined | null): void {
    if (!component) {
      this.clear();
      editor.select(undefined);
      return;
    }
    this.set(component);
    editor.select(component);
  }
}
