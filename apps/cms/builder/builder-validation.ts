import type { BuilderDocumentKind } from '@payload/contracts';

export type BuilderValidationSeverity = 'error' | 'warning';

export type BuilderValidationScope =
  'page' | 'header' | 'footer' | 'navigation' | 'design-system' | 'reusable';

export type BuilderValidationTab = 'content' | 'style' | 'settings';

export type BuilderValidationViewport = 'desktop' | 'tablet' | 'mobile';

export type BuilderValidationIssue = {
  id: string;
  code: string;
  severity: BuilderValidationSeverity;
  scope: BuilderValidationScope;
  message: string;
  nodeId?: string;
  documentId?: string;
  tab?: BuilderValidationTab;
  section?: string;
  field?: string;
  partName?: string;
  viewport?: BuilderValidationViewport;
  path?: readonly string[];
};

export type BuilderValidationContext = {
  scope: BuilderValidationScope;
  nodeId?: string;
  documentId?: string;
  tab?: BuilderValidationTab;
  section?: string;
  field?: string;
  partName?: string;
  viewport?: BuilderValidationViewport;
  path?: readonly string[];
};

export type BuilderCommandValidationReason = {
  kind: 'invalid-input' | 'invalid-placement' | 'unsupported-operation';
  message: string;
  field?: string;
  code?: string;
};

export type BuilderValidationNavigation = {
  switchDocument: (scope: BuilderValidationScope) => Promise<void> | void;
  switchViewport: (viewport: BuilderValidationViewport) => Promise<void> | void;
  selectNode: (nodeId: string) => Promise<void> | void;
  openInspector: (
    tab?: BuilderValidationTab,
    section?: string,
    partName?: string,
  ) => Promise<void> | void;
};

export type BuilderValidationCoordinator = {
  validateCurrentDocument: () => BuilderValidationIssue[];
  focusIssue: (issue: BuilderValidationIssue) => Promise<void>;
  focusFirstIssue: () => Promise<void>;
  clearIssue: (issueId: string) => void;
  clearResolvedIssues: () => void;
};

export function scopeForDocumentKind(
  documentKind: BuilderDocumentKind,
  editingReusable = false,
): BuilderValidationScope {
  if (editingReusable) return 'reusable';
  if (documentKind === 'site-header') return 'header';
  if (documentKind === 'site-footer') return 'footer';
  return 'page';
}

export function validationDomId(issueId: string): string {
  return `builder-validation-error-${issueId.replace(/[^a-zA-Z0-9_-]/g, '-')}`;
}

export function validationIssueTargetId(context: BuilderValidationContext): string {
  return [
    context.scope,
    context.documentId ?? '',
    context.nodeId ?? '',
    context.tab ?? '',
    context.section ?? '',
    context.partName ?? '',
    context.field ?? '',
    context.viewport ?? '',
  ].join('|');
}

export function createBuilderValidationIssue(
  input: BuilderValidationContext &
    Pick<BuilderValidationIssue, 'code' | 'message'> &
    Partial<Pick<BuilderValidationIssue, 'id' | 'severity'>>,
): BuilderValidationIssue {
  const id = input.id ?? validationIssueTargetId(input);
  return {
    id,
    code: input.code,
    severity: input.severity ?? 'error',
    scope: input.scope,
    message: input.message,
    ...(input.nodeId ? { nodeId: input.nodeId } : {}),
    ...(input.documentId ? { documentId: input.documentId } : {}),
    ...(input.tab ? { tab: input.tab } : {}),
    ...(input.section ? { section: input.section } : {}),
    ...(input.field ? { field: input.field } : {}),
    ...(input.partName ? { partName: input.partName } : {}),
    ...(input.viewport ? { viewport: input.viewport } : {}),
    ...(input.path ? { path: input.path } : {}),
  };
}

export function dedupeBuilderValidationIssues(
  issues: readonly BuilderValidationIssue[],
): BuilderValidationIssue[] {
  const byId = new Map<string, BuilderValidationIssue>();
  for (const issue of issues) byId.set(issue.id, issue);
  return [...byId.values()];
}

function scopeRank(scope: BuilderValidationScope): number {
  return scope === 'page' ? 0 : scope === 'header' ? 1 : scope === 'footer' ? 2 : 3;
}

function viewportRank(viewport?: BuilderValidationViewport): number {
  return viewport === 'desktop'
    ? 0
    : viewport === 'tablet'
      ? 1
      : viewport === 'mobile'
        ? 2
        : 3;
}

export function sortBuilderValidationIssues(
  issues: readonly BuilderValidationIssue[],
  context: {
    scope?: BuilderValidationScope;
    nodeId?: string | null;
    viewport?: BuilderValidationViewport;
  } = {},
): BuilderValidationIssue[] {
  return [...issues].sort((left, right) => {
    const leftCurrentScope = left.scope === context.scope ? 0 : 1;
    const rightCurrentScope = right.scope === context.scope ? 0 : 1;
    if (leftCurrentScope !== rightCurrentScope)
      return leftCurrentScope - rightCurrentScope;
    const leftCurrentNode = left.nodeId && left.nodeId === context.nodeId ? 0 : 1;
    const rightCurrentNode = right.nodeId && right.nodeId === context.nodeId ? 0 : 1;
    if (leftCurrentNode !== rightCurrentNode) return leftCurrentNode - rightCurrentNode;
    const leftCurrentViewport = left.viewport === context.viewport ? 0 : 1;
    const rightCurrentViewport = right.viewport === context.viewport ? 0 : 1;
    if (leftCurrentViewport !== rightCurrentViewport) {
      return leftCurrentViewport - rightCurrentViewport;
    }
    if (left.severity !== right.severity) return left.severity === 'error' ? -1 : 1;
    const leftPath = (left.path ?? []).join('.');
    const rightPath = (right.path ?? []).join('.');
    const pathOrder = leftPath.localeCompare(rightPath);
    if (pathOrder !== 0) return pathOrder;
    const scopeOrder = scopeRank(left.scope) - scopeRank(right.scope);
    if (scopeOrder !== 0) return scopeOrder;
    const viewportOrder = viewportRank(left.viewport) - viewportRank(right.viewport);
    if (viewportOrder !== 0) return viewportOrder;
    return left.id.localeCompare(right.id);
  });
}

export function knownValidationMessage(
  code: string | undefined,
  fallback: string,
): string {
  switch (code) {
    case 'BUTTON_URL_INVALID':
    case 'LINK_URL_INVALID':
    case 'IMAGE_SOURCE_INVALID':
    case 'VIDEO_SOURCE_INVALID':
      return 'Enter a valid, safe URL.';
    case 'STYLE_OPACITY_INVALID':
      return 'Opacity must be between 0 and 1.';
    case 'STYLE_UNSAFE_CSS':
      return 'Use a safe CSS value.';
    case 'FIELD_REQUIRED':
      return 'Enter a value.';
    default:
      return fallback;
  }
}

export function codeForValidationReason(
  reason: BuilderCommandValidationReason,
  context: BuilderValidationContext,
): string {
  if (reason.code) return reason.code;
  if (reason.field === 'href') {
    return context.scope === 'page' ? 'BUTTON_URL_INVALID' : 'LINK_URL_INVALID';
  }
  if (reason.field === 'opacity') return 'STYLE_OPACITY_INVALID';
  if (reason.kind === 'invalid-placement') return 'INVALID_PLACEMENT';
  return 'BUILDER_INPUT_INVALID';
}

export function validationIssueFromError(
  error: unknown,
  context: BuilderValidationContext,
  overrides: { code?: string; field?: string; message?: string } = {},
): BuilderValidationIssue {
  const candidate = error as { message?: unknown; path?: unknown } | null;
  const rawMessage =
    overrides.message ??
    (typeof candidate?.message === 'string'
      ? candidate.message
      : 'The value is invalid.');
  const path = Array.isArray(candidate?.path)
    ? candidate.path
        .filter(
          (segment): segment is string | number =>
            typeof segment === 'string' || typeof segment === 'number',
        )
        .map(String)
    : [];
  const lowerMessage = rawMessage.toLowerCase();
  const field =
    overrides.field ??
    (path.at(-1) && !['props', 'style', 'children', 'partsStyle'].includes(path.at(-1)!)
      ? path.at(-1)
      : undefined);
  const code =
    overrides.code ??
    (lowerMessage.includes('opacity')
      ? 'STYLE_OPACITY_INVALID'
      : lowerMessage.includes('unsafe css')
        ? 'STYLE_UNSAFE_CSS'
        : lowerMessage.includes('url') || lowerMessage.includes('source')
          ? 'BUTTON_URL_INVALID'
          : 'BUILDER_DOCUMENT_INVALID');
  const message = knownValidationMessage(
    code,
    rawMessage.replace(/ at [a-zA-Z0-9_.[]-]+$/, ''),
  );
  return createBuilderValidationIssue({
    ...context,
    ...(field ? { field } : {}),
    ...(path.length > 0 ? { path } : {}),
    code,
    message,
  });
}

function fieldSelectorMatches(
  element: HTMLElement,
  issue: BuilderValidationIssue,
): boolean {
  const { dataset } = element;
  return (
    dataset.builderField === issue.field &&
    dataset.builderNodeId === issue.nodeId &&
    (!issue.tab || dataset.builderTab === issue.tab) &&
    (!issue.section || dataset.builderSection === issue.section) &&
    (!issue.partName || dataset.builderPartName === issue.partName) &&
    (!issue.viewport || dataset.builderViewport === issue.viewport)
  );
}

function findValidationField(issue: BuilderValidationIssue): HTMLElement | undefined {
  if (!issue.nodeId || !issue.field || typeof document === 'undefined') return undefined;
  return Array.from(document.querySelectorAll<HTMLElement>('[data-builder-field]')).find(
    (element) => fieldSelectorMatches(element, issue),
  );
}

function waitForFrame(): Promise<void> {
  return new Promise((resolve) => {
    if (typeof window === 'undefined') {
      resolve();
      return;
    }
    window.requestAnimationFrame(() => resolve());
  });
}

async function waitForValidationField(
  issue: BuilderValidationIssue,
): Promise<HTMLElement | undefined> {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const field = findValidationField(issue);
    if (field) return field;
    await waitForFrame();
  }
  return undefined;
}

export function createBuilderValidationCoordinator(options: {
  getIssues: () => readonly BuilderValidationIssue[];
  setIssues: (issues: BuilderValidationIssue[]) => void;
  navigation: BuilderValidationNavigation;
}): BuilderValidationCoordinator {
  let flashTimer: number | undefined;

  const clearIssue = (issueId: string) => {
    options.setIssues(options.getIssues().filter((issue) => issue.id !== issueId));
  };

  return {
    validateCurrentDocument: () => [...options.getIssues()],
    async focusIssue(issue) {
      await options.navigation.switchDocument(issue.scope);
      if (issue.viewport) await options.navigation.switchViewport(issue.viewport);
      await waitForFrame();
      if (issue.nodeId) await options.navigation.selectNode(issue.nodeId);
      await waitForFrame();
      await options.navigation.openInspector(issue.tab, issue.section, issue.partName);
      await waitForFrame();

      const field = await waitForValidationField(issue);
      if (!field) return;
      const target = field.querySelector<HTMLElement>(
        'input:not([type="hidden"]), textarea, select, button',
      );
      field.scrollIntoView({ block: 'center', behavior: 'smooth' });
      field.classList.add('builder-validation-flash');
      target?.focus();
      if (flashTimer !== undefined && typeof window !== 'undefined') {
        window.clearTimeout(flashTimer);
      }
      if (typeof window !== 'undefined') {
        flashTimer = window.setTimeout(() => {
          field.classList.remove('builder-validation-flash');
          flashTimer = undefined;
        }, 1_500);
      }
    },
    async focusFirstIssue() {
      const first = options.getIssues()[0];
      if (first) await this.focusIssue(first);
    },
    clearIssue,
    clearResolvedIssues() {
      options.setIssues([]);
    },
  };
}
