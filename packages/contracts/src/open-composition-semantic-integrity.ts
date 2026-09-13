import type {
  OpenCompositionBehavior,
  OpenCompositionNode,
  OpenCompositionPayload,
} from './open-composition';

/** The maximum number of choices an author can put in a choice field. */
export const OPEN_COMPOSITION_MAX_OPTIONS = 50;
/** The maximum length shared by persisted option values and field keys. */
export const OPEN_COMPOSITION_MAX_SEMANTIC_VALUE_LENGTH = 64;
/** The maximum length used by generated Open Composition node and behavior IDs. */
const OPEN_COMPOSITION_MAX_GENERATED_ID_LENGTH = 128;

export type OpenCompositionOption = {
  label: string;
  value: string;
};

const INPUT_TYPES = [
  'text',
  'email',
  'phone',
  'textarea',
  'select',
  'checkbox',
  'radio',
] as const;

type OpenCompositionInputType = (typeof INPUT_TYPES)[number];

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isInputType(value: unknown): value is OpenCompositionInputType {
  return (
    typeof value === 'string' && INPUT_TYPES.includes(value as OpenCompositionInputType)
  );
}

function textValue(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

/**
 * Appends a numeric collision suffix without truncating the suffix itself.
 * Callers provide a max length that can fit the suffix text.
 */
export function withBoundedNumericSuffix(
  base: string,
  suffix: number,
  maxLength: number,
): string {
  const suffixText = `-${suffix}`;
  const baseLength = Math.max(0, maxLength - suffixText.length);
  return `${base.slice(0, baseLength)}${suffixText}`;
}

function boundedChildId(prefix: string, suffix: string, usedIds: Set<string>): string {
  const base = `${prefix}-${suffix}`.replace(/[^A-Za-z0-9_-]/g, '-');
  const initialCandidate = (/^[A-Za-z]/.test(base) ? base : `node-${base}`).slice(
    0,
    OPEN_COMPOSITION_MAX_GENERATED_ID_LENGTH,
  );
  let candidate = initialCandidate;
  let index = 2;
  while (usedIds.has(candidate)) {
    candidate = withBoundedNumericSuffix(
      initialCandidate,
      index,
      OPEN_COMPOSITION_MAX_GENERATED_ID_LENGTH,
    );
    index += 1;
  }
  usedIds.add(candidate);
  return candidate;
}

function boundedBehaviorId(prefix: string, usedIds: Set<string>): string {
  const base = `${prefix}-behavior`.replace(/[^A-Za-z0-9_-]/g, '-');
  const initialCandidate = (/^[A-Za-z]/.test(base) ? base : `behavior-${base}`).slice(
    0,
    OPEN_COMPOSITION_MAX_GENERATED_ID_LENGTH,
  );
  let candidate = initialCandidate;
  let index = 2;
  while (usedIds.has(candidate)) {
    candidate = withBoundedNumericSuffix(
      initialCandidate,
      index,
      OPEN_COMPOSITION_MAX_GENERATED_ID_LENGTH,
    );
    index += 1;
  }
  usedIds.add(candidate);
  return candidate;
}

function fieldKey(value: unknown, fallback: string): string {
  const source = typeof value === 'string' ? value : fallback;
  let result = source
    .trim()
    .replace(/[^A-Za-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, OPEN_COMPOSITION_MAX_SEMANTIC_VALUE_LENGTH);
  if (!result || !/^[A-Za-z]/.test(result)) result = `field-${result}`;
  return result.slice(0, OPEN_COMPOSITION_MAX_SEMANTIC_VALUE_LENGTH) || 'field';
}

/**
 * Normalizes an option candidate exactly as the persistence canonicalizer does.
 * The editor uses this for semantic validation while retaining the candidate's
 * raw draft text in its controlled inputs.
 */
export function normalizeOpenCompositionOptionValue(
  value: unknown,
  label: unknown = '',
  index = 0,
): string {
  const valueText = typeof value === 'string' ? value : '';
  const labelText = typeof label === 'string' ? label : '';
  const source = valueText.trim() || labelText;
  const normalized = source
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, OPEN_COMPOSITION_MAX_SEMANTIC_VALUE_LENGTH);
  return normalized || `option-${index + 1}`;
}

/**
 * Converts old/freeform choice props into a bounded, unique list. This helper
 * is intentionally forgiving at the migration boundary; the editor only
 * emits values that satisfy these same invariants.
 */
export function canonicalizeOpenCompositionOptions(
  value: unknown,
): OpenCompositionOption[] {
  const source = Array.isArray(value) ? value : [];
  const result: OpenCompositionOption[] = [];
  const usedValues = new Set<string>();

  source.slice(0, OPEN_COMPOSITION_MAX_OPTIONS).forEach((candidate, index) => {
    const label =
      typeof candidate === 'string'
        ? candidate.trim()
        : isObject(candidate) && typeof candidate.label === 'string'
          ? candidate.label.trim()
          : '';
    if (!label) return;
    const rawValue =
      isObject(candidate) && typeof candidate.value === 'string' ? candidate.value : '';
    const baseValue = normalizeOpenCompositionOptionValue(rawValue, label, index);
    let nextValue = baseValue;
    let suffix = 2;
    while (usedValues.has(nextValue)) {
      nextValue = withBoundedNumericSuffix(
        baseValue,
        suffix,
        OPEN_COMPOSITION_MAX_SEMANTIC_VALUE_LENGTH,
      );
      suffix += 1;
    }
    usedValues.add(nextValue);
    result.push({ label: label.slice(0, 120), value: nextValue });
  });

  if (result.length > 0) return result;
  return [
    { label: 'Option 1', value: 'option-1' },
    { label: 'Option 2', value: 'option-2' },
  ];
}

function cloneNode(node: OpenCompositionNode): OpenCompositionNode {
  return {
    ...node,
    props: { ...node.props },
    children: node.children.map(cloneNode),
  };
}

function nodeMap(root: OpenCompositionNode): Map<string, OpenCompositionNode> {
  const result = new Map<string, OpenCompositionNode>();
  const visit = (node: OpenCompositionNode): void => {
    result.set(node.id, node);
    node.children.forEach(visit);
  };
  visit(root);
  return result;
}

function containsNode(root: OpenCompositionNode, id: string): boolean {
  if (root.id === id) return true;
  return root.children.some((child) => containsNode(child, id));
}

function normalizeButtonOrLink(
  node: OpenCompositionNode,
  usedIds: Set<string>,
): OpenCompositionNode {
  if (node.type !== 'button' && node.type !== 'link') return node;
  const textChildren = node.children.filter((child) => child.type === 'text');
  const visualText = textChildren
    .map((child) => textValue(child.props.text)?.trim() ?? '')
    .filter(Boolean)
    .join(' ')
    .trim();
  const legacyText = textValue(node.props.label) ?? textValue(node.props.text);
  const label =
    visualText || legacyText?.trim() || (node.type === 'button' ? 'Button' : 'Link');
  const firstText = textChildren[0];
  const children = firstText
    ? node.children
        .filter((child) => child.type !== 'text' || child === firstText)
        .map((child) =>
          child === firstText
            ? { ...child, props: { ...child.props, text: label } }
            : child,
        )
    : [
        ...node.children,
        {
          id: boundedChildId(node.id, 'text', usedIds),
          type: 'text' as const,
          props: { text: label },
          children: [],
        },
      ];
  const props: Record<string, unknown> = { ...node.props, label };
  delete props.text;
  return { ...node, props, children };
}

function normalizeInputType(
  control: OpenCompositionNode,
  behavior: Extract<OpenCompositionBehavior, { kind: 'field' }> | undefined,
): OpenCompositionInputType {
  if (behavior?.inputType) return behavior.inputType;
  if (control.type === 'textarea') return 'textarea';
  if (control.type === 'select') return 'select';
  const value = control.props.type === 'tel' ? 'phone' : control.props.type;
  return isInputType(value) ? value : 'text';
}

function normalizeField(
  node: OpenCompositionNode,
  formNodeId: string | undefined,
  fields: Map<string, Extract<OpenCompositionBehavior, { kind: 'field' }>>,
  usedNodeIds: Set<string>,
  usedBehaviorIds: Set<string>,
  fieldKeys: Set<string>,
): OpenCompositionNode {
  if (node.type !== 'form-field' || !formNodeId) return node;
  const existingBehavior = fields.get(node.id);
  const existingLabel = node.children.find((child) => child.type === 'label');
  const existingControl = node.children.find((child) =>
    ['input', 'textarea', 'select'].includes(child.type),
  );
  const label =
    existingLabel ??
    ({
      id: boundedChildId(node.id, 'label', usedNodeIds),
      type: 'label' as const,
      props: { text: 'Field label' },
      children: [],
    } satisfies OpenCompositionNode);
  const control =
    existingControl ??
    ({
      id: boundedChildId(node.id, 'control', usedNodeIds),
      type: 'input' as const,
      props: {},
      children: [],
    } satisfies OpenCompositionNode);
  const requestedKey =
    existingBehavior?.fieldKey ??
    node.props.fieldKey ??
    control.props.fieldKey ??
    control.props.name;
  const baseKey = fieldKey(requestedKey, `field-${node.id}`);
  let nextFieldKey = baseKey;
  let fieldSuffix = 2;
  while (fieldKeys.has(nextFieldKey)) {
    nextFieldKey = withBoundedNumericSuffix(
      baseKey,
      fieldSuffix,
      OPEN_COMPOSITION_MAX_SEMANTIC_VALUE_LENGTH,
    );
    fieldSuffix += 1;
  }
  fieldKeys.add(nextFieldKey);
  const required = existingBehavior?.required ?? node.props.required === true;
  const inputType = normalizeInputType(control, existingBehavior);
  const controlType: OpenCompositionNode['type'] =
    inputType === 'textarea' ? 'textarea' : inputType === 'select' ? 'select' : 'input';
  const controlProps: Record<string, unknown> = {
    ...control.props,
    fieldKey: nextFieldKey,
    name: nextFieldKey,
    type: inputType,
  };
  if (inputType === 'select' || inputType === 'radio') {
    controlProps.options = canonicalizeOpenCompositionOptions(control.props.options);
  } else {
    delete controlProps.options;
  }
  const canonicalControl: OpenCompositionNode = {
    ...control,
    type: controlType,
    props: controlProps,
  };
  const canonicalLabel: OpenCompositionNode = {
    ...label,
    props: {
      ...label.props,
      text: textValue(label.props.text)?.trim() || 'Field label',
    },
  };
  const children = node.children.filter((child) => {
    if (child.type === 'label') return child === existingLabel;
    if (['input', 'textarea', 'select'].includes(child.type))
      return child === existingControl;
    return true;
  });
  const labelIndex = children.indexOf(existingLabel as OpenCompositionNode);
  const controlIndex = children.indexOf(existingControl as OpenCompositionNode);
  const canonicalChildren = children.map((child, index) => {
    if (existingLabel && index === labelIndex) return canonicalLabel;
    if (existingControl && index === controlIndex) return canonicalControl;
    return child;
  });
  if (!existingLabel) canonicalChildren.unshift(canonicalLabel);
  if (!existingControl) canonicalChildren.push(canonicalControl);
  const behavior: Extract<OpenCompositionBehavior, { kind: 'field' }> = {
    id: existingBehavior?.id ?? boundedBehaviorId(node.id, usedBehaviorIds),
    kind: 'field',
    nodeId: node.id,
    formNodeId,
    fieldKey: nextFieldKey,
    inputType,
    required,
    labelNodeId: canonicalLabel.id,
    controlNodeId: canonicalControl.id,
  };
  fields.set(node.id, behavior);
  return {
    ...node,
    props: { ...node.props, fieldKey: nextFieldKey, required },
    children: canonicalChildren,
  };
}

/**
 * Canonicalizes the V8 semantic projections at a persistence/runtime boundary.
 * The returned object is new and the input is never mutated.
 *
 * Canonical ownership:
 * - Button/Link visual text child owns the words; `props.label` is a derived
 *   compatibility projection kept equal for existing Inspector consumers.
 * - Form Field behavior owns field key, type and required state; node props
 *   and control attributes are derived projections.
 * - Quote attribution is `cite`; `citation` is a one-way legacy alias.
 */
export function canonicalizeOpenCompositionPayload(
  payload: OpenCompositionPayload,
): OpenCompositionPayload {
  const root = cloneNode(payload.root);
  const usedNodeIds = new Set(nodeMap(root).keys());
  const usedBehaviorIds = new Set(payload.behaviors.map((behavior) => behavior.id));
  const fields = new Map<string, Extract<OpenCompositionBehavior, { kind: 'field' }>>(
    payload.behaviors
      .filter(
        (behavior): behavior is Extract<OpenCompositionBehavior, { kind: 'field' }> =>
          behavior.kind === 'field',
      )
      .map((behavior) => [behavior.nodeId, { ...behavior }]),
  );
  const fieldKeysByForm = new Map<string, Set<string>>();
  const canonicalFieldNodeIds = new Set<string>();

  const visit = (
    node: OpenCompositionNode,
    formNodeId?: string,
    parentType?: OpenCompositionNode['type'],
  ): void => {
    const nextFormNodeId = node.type === 'form' ? node.id : formNodeId;
    // A Form Field is an owned semantic unit, not generic page content. Drop
    // legacy/orphan placements at the canonicalization boundary so old V8
    // drafts can be repaired without preserving a visible-but-unsubmittable
    // control.
    node.children = node.children.filter(
      (child) => child.type !== 'form-field' || node.type === 'form',
    );
    node.children.forEach((child) => visit(child, nextFormNodeId, node.type));
    if (node.type === 'button' || node.type === 'link') {
      const normalized = normalizeButtonOrLink(node, usedNodeIds);
      node.props = normalized.props;
      node.children = normalized.children;
    }
    if (node.type === 'quote' && node.props.cite === undefined) {
      const citation = textValue(node.props.citation);
      if (citation !== undefined) node.props.cite = citation;
    }
    if (node.type === 'quote') delete node.props.citation;
    const fieldKeys = nextFormNodeId
      ? (fieldKeysByForm.get(nextFormNodeId) ?? new Set<string>())
      : new Set<string>();
    const normalizedField = normalizeField(
      node,
      node.type === 'form-field' && parentType === 'form' ? nextFormNodeId : undefined,
      fields,
      usedNodeIds,
      usedBehaviorIds,
      fieldKeys,
    );
    if (node.type === 'form-field' && parentType === 'form' && nextFormNodeId) {
      canonicalFieldNodeIds.add(node.id);
    }
    if (nextFormNodeId) fieldKeysByForm.set(nextFormNodeId, fieldKeys);
    node.props = normalizedField.props;
    node.children = normalizedField.children;
  };
  visit(root);

  const nodes = nodeMap(root);
  const canonicalBehaviors: OpenCompositionBehavior[] = [];
  const canonicalBehaviorIds = new Set<string>();
  const appendBehavior = (behavior: OpenCompositionBehavior): void => {
    if (canonicalBehaviorIds.has(behavior.id)) return;
    canonicalBehaviorIds.add(behavior.id);
    canonicalBehaviors.push(behavior);
  };
  for (const behavior of payload.behaviors) {
    if (behavior.kind === 'field') {
      const field = fields.get(behavior.nodeId);
      if (field && canonicalFieldNodeIds.has(behavior.nodeId)) appendBehavior(field);
      continue;
    }
    if (
      behavior.kind === 'action' &&
      (behavior.action === 'submit-form' || behavior.action === 'reset-form')
    ) {
      const target = behavior.targetNodeId ? nodes.get(behavior.targetNodeId) : undefined;
      const source = nodes.get(behavior.nodeId);
      const sourceIsInsideTarget =
        target?.type === 'form' &&
        source !== undefined &&
        (source.type === 'form' || containsNode(target, source.id));
      if (!sourceIsInsideTarget) continue;
    }
    appendBehavior({ ...behavior });
  }
  for (const field of fields.values()) {
    if (canonicalFieldNodeIds.has(field.nodeId)) appendBehavior(field);
  }

  return {
    ...payload,
    root,
    behaviors: canonicalBehaviors,
  };
}
