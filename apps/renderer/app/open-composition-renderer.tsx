'use client';

import {
  type CompositionStyle,
  type OpenCompositionBehavior,
  type OpenCompositionNode,
  type OpenCompositionPayload,
  isSafePageImageSource,
  isSafePageVideoSource,
  isSafePageStyleValue,
  PAGE_RUNTIME_CLASS_NAMES,
  PAGE_RESPONSIVE_BREAKPOINTS,
  PAGE_STYLE_PROPERTY_BY_PAYLOAD_KEY,
  pageStyleReactProperty,
  resolveDesignSystemColorRole,
  resolvePageStyleValue,
  type SiteDesignSystem,
} from '@payload/contracts';
import React, {
  Fragment,
  useMemo,
  useState,
  type CSSProperties,
  type FormEvent,
  type ReactElement,
} from 'react';

import { getAnalyticsSessionId } from './analytics-client';

type OpenCompositionRendererProps = {
  payload: OpenCompositionPayload;
  context?: {
    siteSlug?: string | undefined;
    pagePath?: string | undefined;
    pageSlug?: string | undefined;
    tenantSlug?: string | undefined;
    customDomain?: boolean | undefined;
    designSystem?: SiteDesignSystem | undefined;
  };
};

type FormValue = string | boolean;
type FormState = 'idle' | 'submitting' | 'success' | 'error' | 'rate-limited';

type OpenFormRuntime = {
  behaviors: readonly OpenCompositionBehavior[];
  byId: Map<string, OpenCompositionNode>;
  fieldByControlId: Map<string, Extract<OpenCompositionBehavior, { kind: 'field' }>>;
  values: Record<string, FormValue>;
  setValue: (fieldKey: string, value: FormValue) => void;
  reset: () => void;
  submit: (event: FormEvent<HTMLFormElement>, form: OpenCompositionNode) => void;
  states: Record<string, FormState>;
  errors: Record<string, string | undefined>;
};

function flatten(root: OpenCompositionNode): OpenCompositionNode[] {
  const result: OpenCompositionNode[] = [];
  const pending = [root];
  while (pending.length) {
    const node = pending.pop();
    if (!node) continue;
    result.push(node);
    pending.push(...node.children);
  }
  return result;
}

function textProp(node: OpenCompositionNode, key: string, fallback = ''): string {
  const value = node.props[key];
  return typeof value === 'string' ? value : fallback;
}

function booleanProp(node: OpenCompositionNode, key: string, fallback = false): boolean {
  return typeof node.props[key] === 'boolean' ? node.props[key] : fallback;
}

function styleBlockToProperties(
  style: CompositionStyle | undefined,
  designSystem: SiteDesignSystem | undefined,
): CSSProperties {
  const result: CSSProperties = {};
  for (const [property, value] of Object.entries(style?.base ?? {})) {
    const definition = PAGE_STYLE_PROPERTY_BY_PAYLOAD_KEY[property];
    if (!definition || (typeof value !== 'string' && typeof value !== 'object')) continue;
    const resolved = resolvePageStyleValue(
      value as string | { kind: 'token'; tokenId: string },
      designSystem,
      definition.key,
    );
    if (!resolved || !isSafePageStyleValue(resolved)) continue;
    (result as Record<string, string>)[pageStyleReactProperty(definition)] = resolved;
  }
  return result;
}

function nodeStyle(
  node: OpenCompositionNode,
  context: OpenCompositionRendererProps['context'],
): CSSProperties {
  const authored = styleBlockToProperties(node.style, context?.designSystem);
  if (node.type === 'stack' && !authored.display) {
    authored.display = 'flex';
    authored.flexDirection = 'column';
    authored.gap = '16px';
  }
  if (node.type === 'row' && !authored.display) {
    authored.display = 'flex';
    authored.flexWrap = 'wrap';
    authored.gap = '16px';
    authored.alignItems = 'center';
  }
  if (node.type === 'grid' && !authored.display) {
    authored.display = 'grid';
    authored.gap = '16px';
  }
  if (node.type === 'card' && !authored.borderRadius) {
    authored.borderRadius = '8px';
  }
  return authored;
}

function partStyle(
  owner: OpenCompositionNode | undefined,
  partName: string,
  context: OpenCompositionRendererProps['context'],
): CSSProperties {
  return owner?.partsStyle?.[partName]
    ? styleBlockToProperties(owner.partsStyle[partName], context?.designSystem)
    : {};
}

function attributes(node: OpenCompositionNode) {
  return {
    'data-payload-node-id': node.id,
    'data-payload-node-type': node.type,
  };
}

function responsiveCss(
  root: OpenCompositionNode,
  viewport: 'tablet' | 'mobile',
  designSystem: SiteDesignSystem | undefined,
): string {
  function declarationsFor(block: Record<string, unknown>): string[] {
    return Object.entries(block).flatMap(([property, value]) => {
      const definition = PAGE_STYLE_PROPERTY_BY_PAYLOAD_KEY[property];
      if (!definition || (typeof value !== 'string' && typeof value !== 'object')) {
        return [];
      }
      const resolved = resolvePageStyleValue(
        value as string | { kind: 'token'; tokenId: string },
        designSystem,
        definition.key,
      );
      return resolved && isSafePageStyleValue(resolved)
        ? `${definition.cssProperty}:${resolved}!important`
        : [];
    });
  }

  return flatten(root)
    .flatMap((node) => {
      const rules: string[] = [];
      const block = node.style?.[viewport];
      if (block) {
        const declarations = declarationsFor(block);
        if (declarations.length) {
          rules.push(`[data-payload-node-id="${node.id}"]{${declarations.join(';')}}`);
        }
      }
      for (const [partName, style] of Object.entries(node.partsStyle ?? {})) {
        const partBlock = style[viewport];
        if (!partBlock) continue;
        const declarations = declarationsFor(partBlock);
        if (!declarations.length) continue;
        const selector =
          partName === 'root'
            ? `[data-payload-node-id="${node.id}"]`
            : `[data-payload-node-id="${node.id}"] [data-payload-part="${partName}"]`;
        rules.push(`${selector}{${declarations.join(';')}}`);
      }
      return rules;
    })
    .join('');
}

function safeHref(
  value: string,
  context: OpenCompositionRendererProps['context'],
): string {
  let href = '#';
  if (
    (value.startsWith('/') && !value.startsWith('//') && !value.includes('\\')) ||
    /^#[A-Za-z][A-Za-z0-9:_-]{0,127}$/.test(value) ||
    /^(?:https?:|mailto:|tel:)/i.test(value)
  ) {
    href = value;
  }
  if (
    context?.customDomain ||
    !context?.siteSlug ||
    !href.startsWith('/') ||
    href.startsWith('//')
  ) {
    return href;
  }
  const prefix = `/${context.siteSlug}`;
  return href === prefix || href.startsWith(`${prefix}/`)
    ? href
    : `${prefix}${href === '/' ? '' : href}`;
}

function OpenNodeContent({
  node,
  context,
  runtime,
}: {
  node: OpenCompositionNode;
  context: OpenCompositionRendererProps['context'];
  runtime: OpenFormRuntime;
}): ReactElement[] {
  return node.children.map((child) => (
    <Fragment key={child.id}>{renderOpenNode(child, context, runtime)}</Fragment>
  ));
}

function fieldForControl(
  node: OpenCompositionNode,
  runtime: OpenFormRuntime,
): Extract<OpenCompositionBehavior, { kind: 'field' }> | undefined {
  return runtime.fieldByControlId.get(node.id);
}

function renderControl(
  node: OpenCompositionNode,
  context: OpenCompositionRendererProps['context'],
  runtime: OpenFormRuntime,
): ReactElement {
  const field = fieldForControl(node, runtime);
  const form = field ? runtime.byId.get(field.formNodeId) : undefined;
  const fieldKey = field?.fieldKey ?? textProp(node, 'fieldKey', node.id);
  const inputType = field?.inputType ?? textProp(node, 'type', 'text');
  const value = runtime.values[fieldKey] ?? (inputType === 'checkbox' ? false : '');
  const common = {
    id: `payload-form-${fieldKey}`,
    name: textProp(node, 'name', fieldKey),
    required: field?.required ?? booleanProp(node, 'required'),
    'data-payload-node-id': node.id,
    'data-payload-node-type': node.type,
    'data-payload-part': 'input',
    style: {
      ...nodeStyle(node, context),
      ...partStyle(form, 'input', context),
    },
  };
  const onValue = (next: FormValue) => runtime.setValue(fieldKey, next);

  if (node.type === 'textarea' || inputType === 'textarea') {
    return (
      <textarea
        {...common}
        maxLength={10_000}
        onChange={(event) => onValue(event.target.value)}
        placeholder={textProp(node, 'placeholder')}
        value={typeof value === 'string' ? value : ''}
      />
    );
  }
  if (node.type === 'select' || inputType === 'select') {
    const options = Array.isArray(node.props.options)
      ? node.props.options.filter(
          (option): option is { value: string; label: string } =>
            typeof option === 'object' &&
            option !== null &&
            typeof option.value === 'string' &&
            typeof option.label === 'string',
        )
      : [];
    return (
      <select
        {...common}
        onChange={(event) => onValue(event.target.value)}
        value={typeof value === 'string' ? value : ''}
      >
        <option value="">{textProp(node, 'placeholder', 'Select an option')}</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    );
  }
  if (inputType === 'checkbox') {
    return (
      <input
        {...common}
        checked={value === true}
        onChange={(event) => onValue(event.target.checked)}
        type="checkbox"
      />
    );
  }
  if (inputType === 'radio') {
    const options = Array.isArray(node.props.options)
      ? node.props.options.filter(
          (option): option is { value: string; label: string } =>
            typeof option === 'object' &&
            option !== null &&
            typeof option.value === 'string' &&
            typeof option.label === 'string',
        )
      : [];
    return (
      <div {...attributes(node)} role="radiogroup">
        {options.map((option) => (
          <label key={option.value}>
            <input
              checked={value === option.value}
              name={common.name}
              onChange={() => onValue(option.value)}
              required={common.required && value === ''}
              type="radio"
              value={option.value}
            />
            {option.label}
          </label>
        ))}
      </div>
    );
  }
  return (
    <input
      {...common}
      maxLength={10_000}
      onChange={(event) => onValue(event.target.value)}
      placeholder={textProp(node, 'placeholder')}
      type={inputType === 'phone' ? 'tel' : inputType}
      value={typeof value === 'string' ? value : ''}
    />
  );
}

function renderFormField(
  node: OpenCompositionNode,
  context: OpenCompositionRendererProps['context'],
  runtime: OpenFormRuntime,
): ReactElement {
  const fieldBehavior = runtime.behaviors.find(
    (behavior): behavior is Extract<OpenCompositionBehavior, { kind: 'field' }> =>
      behavior.kind === 'field' && behavior.nodeId === node.id,
  );
  const form = fieldBehavior ? runtime.byId.get(fieldBehavior.formNodeId) : undefined;
  return (
    <div
      {...attributes(node)}
      className={PAGE_RUNTIME_CLASS_NAMES.formField}
      data-payload-part="field"
      style={{ ...nodeStyle(node, context), ...partStyle(form, 'field', context) }}
    >
      {OpenNodeContent({ node, context, runtime })}
    </div>
  );
}

function renderOpenNode(
  node: OpenCompositionNode,
  context: OpenCompositionRendererProps['context'],
  runtime: OpenFormRuntime,
): ReactElement {
  const style = nodeStyle(node, context);
  switch (node.type) {
    case 'root':
      return (
        <main {...attributes(node)} style={style}>
          {OpenNodeContent({ node, context, runtime })}
        </main>
      );
    case 'section':
      return (
        <section {...attributes(node)} style={style}>
          {OpenNodeContent({ node, context, runtime })}
        </section>
      );
    case 'container':
    case 'stack':
    case 'row':
    case 'grid':
    case 'card':
    case 'global-header':
    case 'global-footer':
    case 'collection-list':
    case 'collection-item':
    case 'navigation-view':
    case 'reusable-instance':
      return (
        <div {...attributes(node)} style={style}>
          {OpenNodeContent({ node, context, runtime })}
        </div>
      );
    case 'text':
      return (
        <p {...attributes(node)} style={style}>
          {textProp(node, 'text') || OpenNodeContent({ node, context, runtime })}
        </p>
      );
    case 'heading': {
      const level = Math.min(6, Math.max(1, Number(node.props.level) || 2)) as
        1 | 2 | 3 | 4 | 5 | 6;
      const Tag = `h${level}` as 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6';
      return (
        <Tag {...attributes(node)} style={style}>
          {textProp(node, 'text') || OpenNodeContent({ node, context, runtime })}
        </Tag>
      );
    }
    case 'image': {
      const src = textProp(node, 'src');
      return (
        <img
          {...attributes(node)}
          alt={textProp(node, 'alt')}
          decoding="async"
          loading="lazy"
          src={isSafePageImageSource(src) ? src : '/assets/placeholder.png'}
          style={style}
        />
      );
    }
    case 'icon':
      return (
        <span
          {...attributes(node)}
          aria-hidden="true"
          data-payload-icon={textProp(node, 'name', 'icon')}
          style={style}
        />
      );
    case 'button': {
      const action = runtime.behaviors.find(
        (behavior): behavior is Extract<OpenCompositionBehavior, { kind: 'action' }> =>
          behavior.kind === 'action' && behavior.nodeId === node.id,
      );
      const target = action?.kind === 'action' ? action.targetNodeId : undefined;
      const targetNode = target ? runtime.byId.get(target) : undefined;
      const href = textProp(node, 'href');
      const content = node.children.length
        ? OpenNodeContent({ node, context, runtime })
        : textProp(node, 'label', 'Button');
      if (href || action?.action === 'navigate') {
        return (
          <a {...attributes(node)} href={safeHref(href || '#', context)} style={style}>
            {content}
          </a>
        );
      }
      return (
        <button
          {...attributes(node)}
          onClick={action?.action === 'reset-form' ? runtime.reset : undefined}
          type={
            action?.action === 'submit-form' || targetNode?.type === 'form'
              ? 'submit'
              : 'button'
          }
          data-payload-part={targetNode?.type === 'form' ? 'submit' : undefined}
          style={
            targetNode?.type === 'form'
              ? { ...style, ...partStyle(targetNode, 'submit', context) }
              : style
          }
        >
          {content}
        </button>
      );
    }
    case 'link':
      return (
        <a
          {...attributes(node)}
          href={safeHref(textProp(node, 'href', '#'), context)}
          style={style}
        >
          {node.children.length
            ? OpenNodeContent({ node, context, runtime })
            : textProp(node, 'text', textProp(node, 'label', 'Link'))}
        </a>
      );
    case 'label': {
      const field = runtime.behaviors.find(
        (behavior): behavior is Extract<OpenCompositionBehavior, { kind: 'field' }> =>
          behavior.kind === 'field' && behavior.labelNodeId === node.id,
      );
      return (
        <label
          {...attributes(node)}
          htmlFor={field?.controlNodeId ? `payload-form-${field.fieldKey}` : undefined}
          data-payload-part="label"
          style={{
            ...style,
            ...partStyle(
              field ? runtime.byId.get(field.formNodeId) : undefined,
              'label',
              context,
            ),
          }}
        >
          {textProp(node, 'text', 'Label')}
          {field?.required ? <span aria-hidden="true"> *</span> : null}
          {OpenNodeContent({ node, context, runtime })}
        </label>
      );
    }
    case 'input':
    case 'textarea':
    case 'select':
      return renderControl(node, context, runtime);
    case 'form-field':
      return renderFormField(node, context, runtime);
    case 'form': {
      const state = runtime.states[node.id] ?? 'idle';
      if (state === 'success') {
        return (
          <div
            {...attributes(node)}
            aria-live="polite"
            className={PAGE_RUNTIME_CLASS_NAMES.formSuccess}
            data-payload-part="success"
            role="status"
            style={partStyle(node, 'success', context)}
          >
            {textProp(node, 'successMessage', 'Thanks — we will be in touch soon.')}
          </div>
        );
      }
      return (
        <form
          {...attributes(node)}
          className={PAGE_RUNTIME_CLASS_NAMES.form}
          data-payload-part="root"
          onSubmit={(event) => runtime.submit(event, node)}
          style={{ ...style, ...partStyle(node, 'root', context) }}
        >
          {OpenNodeContent({ node, context, runtime })}
          {runtime.errors[node.id] ? (
            <p
              aria-live="polite"
              data-payload-part="error"
              role="alert"
              style={partStyle(node, 'error', context)}
            >
              {runtime.errors[node.id]}
            </p>
          ) : null}
        </form>
      );
    }
    case 'disclosure':
    case 'disclosure-item':
      return (
        <details
          {...attributes(node)}
          open={booleanProp(node, 'defaultOpen')}
          style={style}
        >
          <summary>{textProp(node, 'title', textProp(node, 'label', 'Details'))}</summary>
          {OpenNodeContent({ node, context, runtime })}
        </details>
      );
    case 'disclosure-panel':
    case 'tab-panel':
    case 'tab-list':
    case 'tab-trigger':
    case 'tabs':
    case 'accordion':
    case 'accordion-item':
    case 'tab-item':
      return (
        <div {...attributes(node)} style={style}>
          {OpenNodeContent({ node, context, runtime })}
        </div>
      );
    case 'divider':
      return <hr {...attributes(node)} style={style} />;
    case 'list': {
      const items = Array.isArray(node.props.items) ? node.props.items : [];
      return (
        <ul {...attributes(node)} style={style}>
          {items.map((item, index) => (
            <li key={index}>
              {typeof item === 'string'
                ? item
                : typeof item === 'object' && item !== null && 'text' in item
                  ? String(item.text)
                  : ''}
            </li>
          ))}
        </ul>
      );
    }
    case 'video': {
      const src = textProp(node, 'src');
      return (
        <video
          {...attributes(node)}
          controls={booleanProp(node, 'controls', true)}
          muted={booleanProp(node, 'muted')}
          playsInline
          src={isSafePageVideoSource(src) ? src : undefined}
          style={style}
        />
      );
    }
    case 'quote':
      return (
        <blockquote {...attributes(node)} style={style}>
          <p>{textProp(node, 'text')}</p>
          {textProp(node, 'cite') ? <cite>{textProp(node, 'cite')}</cite> : null}
        </blockquote>
      );
    case 'site-brand':
      return (
        <span {...attributes(node)} style={style}>
          {textProp(node, 'siteName', textProp(node, 'text', ''))}
        </span>
      );
    case 'extension':
    case 'countdown':
    default:
      return (
        <div {...attributes(node)} style={style}>
          {textProp(node, 'text', textProp(node, 'label', ''))}
          {OpenNodeContent({ node, context, runtime })}
        </div>
      );
  }
}

function OpenCompositionTree({
  payload,
  context,
}: OpenCompositionRendererProps): ReactElement {
  const nodes = useMemo(() => flatten(payload.root), [payload.root]);
  const byId = useMemo(() => new Map(nodes.map((node) => [node.id, node])), [nodes]);
  const fieldByControlId = useMemo(
    () =>
      new Map(
        payload.behaviors
          .filter(
            (behavior): behavior is Extract<OpenCompositionBehavior, { kind: 'field' }> =>
              behavior.kind === 'field' && Boolean(behavior.controlNodeId),
          )
          .map((behavior) => [behavior.controlNodeId as string, behavior]),
      ),
    [payload.behaviors],
  );
  const fieldBehaviors = payload.behaviors.filter(
    (behavior): behavior is Extract<OpenCompositionBehavior, { kind: 'field' }> =>
      behavior.kind === 'field',
  );
  const initialValues = Object.fromEntries(
    fieldBehaviors.map((behavior) => [
      behavior.fieldKey,
      behavior.inputType === 'checkbox' ? false : '',
    ]),
  );
  const [values, setValues] = useState<Record<string, FormValue>>(initialValues);
  const [states, setStates] = useState<Record<string, FormState>>({});
  const [errors, setErrors] = useState<Record<string, string | undefined>>({});
  const runtime: OpenFormRuntime = {
    behaviors: payload.behaviors,
    byId,
    fieldByControlId,
    values,
    setValue: (fieldKey, value) =>
      setValues((current) => ({ ...current, [fieldKey]: value })),
    reset: () => {
      setValues(initialValues);
      setStates({});
      setErrors({});
    },
    states,
    errors,
    submit: (event, form) => {
      event.preventDefault();
      if (states[form.id] === 'submitting') return;
      const apiBaseUrl =
        process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://127.0.0.1:3001/api/v1';
      const pagePath =
        context?.pagePath ?? (context?.pageSlug ? `/${context.pageSlug}` : '/');
      const formBehaviors = fieldBehaviors.filter(
        (behavior) => behavior.formNodeId === form.id,
      );
      if (!context?.siteSlug) return;
      const submissionUrl = `${apiBaseUrl}/public/sites/${encodeURIComponent(context.siteSlug)}/forms/${encodeURIComponent(form.id)}/submissions?path=${encodeURIComponent(pagePath)}${context.tenantSlug ? `&tenantSlug=${encodeURIComponent(context.tenantSlug)}` : ''}`;
      setStates((current) => ({ ...current, [form.id]: 'submitting' }));
      setErrors((current) => ({ ...current, [form.id]: undefined }));
      void fetch(submissionUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...(getAnalyticsSessionId()
            ? { analyticsSessionId: getAnalyticsSessionId() }
            : {}),
          values: formBehaviors.map((behavior) => ({
            fieldId: behavior.fieldKey,
            value: values[behavior.fieldKey] ?? '',
          })),
        }),
      })
        .then(async (response) => {
          if (response.status === 429)
            throw new Error('Please wait a moment before trying again.');
          if (!response.ok) {
            let message = 'We could not submit this form. Please try again.';
            try {
              const body = (await response.json()) as { error?: { message?: string } };
              message = body.error?.message || message;
            } catch {
              // Keep the safe fallback for a non-JSON response.
            }
            throw new Error(message);
          }
        })
        .then(
          () => setStates((current) => ({ ...current, [form.id]: 'success' })),
          (error: unknown) => {
            setStates((current) => ({
              ...current,
              [form.id]:
                error instanceof Error && error.message.startsWith('Please wait')
                  ? 'rate-limited'
                  : 'error',
            }));
            setErrors((current) => ({
              ...current,
              [form.id]: error instanceof Error ? error.message : 'Submission failed.',
            }));
          },
        );
    },
  };
  return renderOpenNode(payload.root, context, runtime);
}

export function OpenCompositionRenderer({
  payload,
  context = {},
}: OpenCompositionRendererProps): ReactElement {
  const tablet = responsiveCss(payload.root, 'tablet', context.designSystem);
  const mobile = responsiveCss(payload.root, 'mobile', context.designSystem);
  return (
    <div
      className="payload-open-composition"
      style={{
        backgroundColor: resolveDesignSystemColorRole(
          context.designSystem,
          'pageBackground',
        ),
        color: resolveDesignSystemColorRole(context.designSystem, 'text'),
        minHeight: '100%',
      }}
    >
      {tablet || mobile ? (
        <style
          data-payload-open-responsive
        >{`${tablet ? `@media (max-width: ${PAGE_RESPONSIVE_BREAKPOINTS.tablet.maxWidth}px){${tablet}}` : ''}${mobile ? `@media (max-width: ${PAGE_RESPONSIVE_BREAKPOINTS.mobile.maxWidth}px){${mobile}}` : ''}`}</style>
      ) : null}
      <OpenCompositionTree context={context} payload={payload} />
    </div>
  );
}
