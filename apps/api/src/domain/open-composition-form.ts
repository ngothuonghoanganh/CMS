import {
  FormPropsSchema,
  type AnyPageNode,
  type FormProps,
  type OpenCompositionBehavior,
  type OpenCompositionNode,
} from '@payload/contracts';

export type ResolvedFormNode = {
  id: string;
  type: 'form';
  props: FormProps;
  children: [];
};

function flatten(root: AnyPageNode): AnyPageNode[] {
  const result: AnyPageNode[] = [];
  const pending = [root];
  while (pending.length) {
    const node = pending.pop();
    if (!node) continue;
    result.push(node);
    pending.push(...node.children);
  }
  return result;
}

function stringProp(
  node: OpenCompositionNode | AnyPageNode,
  key: string,
): string | undefined {
  const value = (node.props as Record<string, unknown>)[key];
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function formOptions(
  node: OpenCompositionNode | undefined,
): Array<{ value: string; label: string }> {
  const raw = node?.props.options;
  if (Array.isArray(raw)) {
    const options = raw.flatMap((option, index) => {
      if (typeof option === 'string' && option.trim()) {
        return [{ value: `option-${index + 1}`, label: option.trim() }];
      }
      if (
        typeof option === 'object' &&
        option !== null &&
        typeof option.value === 'string' &&
        typeof option.label === 'string' &&
        option.value.trim() &&
        option.label.trim()
      ) {
        return [{ value: option.value.trim(), label: option.label.trim() }];
      }
      return [];
    });
    if (options.length) return options.slice(0, 100);
  }
  return [{ value: 'option-1', label: 'Option 1' }];
}

function toFormProps(
  root: AnyPageNode,
  form: AnyPageNode,
  behaviors: readonly OpenCompositionBehavior[],
): FormProps | undefined {
  const legacy = FormPropsSchema.safeParse(form.props);
  if (legacy.success) return legacy.data;
  if (form.type !== 'form') return undefined;

  const nodes = new Map(flatten(root).map((node) => [node.id, node]));
  const fields = behaviors
    .filter(
      (behavior): behavior is Extract<OpenCompositionBehavior, { kind: 'field' }> =>
        behavior.kind === 'field' && behavior.formNodeId === form.id,
    )
    .map((behavior) => {
      const fieldNode = nodes.get(behavior.nodeId);
      const labelNode = behavior.labelNodeId
        ? nodes.get(behavior.labelNodeId)
        : undefined;
      const controlNode = behavior.controlNodeId
        ? nodes.get(behavior.controlNodeId)
        : undefined;
      const id = behavior.fieldKey;
      const label =
        (labelNode ? stringProp(labelNode, 'text') : undefined) ??
        (fieldNode ? stringProp(fieldNode, 'label') : undefined) ??
        behavior.fieldKey;
      const name =
        (controlNode ? stringProp(controlNode, 'name') : undefined) ?? behavior.fieldKey;
      const placeholder = controlNode
        ? stringProp(controlNode, 'placeholder')
        : undefined;
      const base = { id, label, name, required: behavior.required };
      switch (behavior.inputType) {
        case 'email':
          return {
            ...base,
            type: 'email' as const,
            ...(placeholder ? { placeholder } : {}),
          };
        case 'phone':
          return {
            ...base,
            type: 'phone' as const,
            ...(placeholder ? { placeholder } : {}),
          };
        case 'textarea':
          return {
            ...base,
            type: 'textarea' as const,
            ...(placeholder ? { placeholder } : {}),
          };
        case 'select':
          return {
            ...base,
            type: 'select' as const,
            ...(placeholder ? { placeholder } : {}),
            options: formOptions(controlNode as OpenCompositionNode | undefined),
          };
        case 'radio':
          return {
            ...base,
            type: 'radio' as const,
            options: formOptions(controlNode as OpenCompositionNode | undefined),
          };
        case 'checkbox':
          return { ...base, type: 'checkbox' as const };
        case 'text':
        default:
          return {
            ...base,
            type: 'text' as const,
            ...(placeholder ? { placeholder } : {}),
          };
      }
    });
  if (!fields.length) return undefined;

  const submitBehavior = behaviors.find(
    (behavior): behavior is Extract<OpenCompositionBehavior, { kind: 'action' }> =>
      behavior.kind === 'action' &&
      behavior.action === 'submit-form' &&
      behavior.targetNodeId === form.id,
  );
  const submitNode = submitBehavior ? nodes.get(submitBehavior.nodeId) : undefined;
  const submitLabel =
    (submitNode ? stringProp(submitNode, 'label') : undefined) ?? 'Submit';
  return FormPropsSchema.safeParse({
    fields,
    submitLabel,
    successMessage:
      stringProp(form, 'successMessage') ?? 'Thanks — we will be in touch soon.',
  }).success
    ? FormPropsSchema.parse({
        fields,
        submitLabel,
        successMessage:
          stringProp(form, 'successMessage') ?? 'Thanks — we will be in touch soon.',
      })
    : undefined;
}

export function findResolvedForm(
  root: AnyPageNode,
  formNodeId: string,
  behaviors: readonly OpenCompositionBehavior[] = [],
): ResolvedFormNode | undefined {
  const pending = [root];
  while (pending.length) {
    const node = pending.pop();
    if (!node) continue;
    if (node.type === 'form' && node.id === formNodeId) {
      const props = toFormProps(root, node, behaviors);
      return props ? { id: node.id, type: 'form', props, children: [] } : undefined;
    }
    pending.push(...node.children);
  }
  return undefined;
}
