import {
  PagePayloadSchema,
  type ContainerNode,
  type ImageNode,
  type PageNode,
  type PageNodeV2,
  type PageNodeV3,
  type PageNodeStyle,
  type PagePayload,
  type FormNode,
  type RootNode,
  type SectionNode,
  type TextNode,
  type ButtonNode,
  type CountdownNode,
  type ExtensionNode,
  type PageRuntimeExtension,
} from '@payload/contracts';
import React, { Fragment, type CSSProperties, type ReactElement } from 'react';

import { FormRenderer } from './form-renderer';
import { CountdownRuntime, ExtensionRuntimeBootstrap } from './extension-runtime';

const stylePropertyMap = {
  display: 'display',
  width: 'width',
  maxWidth: 'max-width',
  minHeight: 'min-height',
  padding: 'padding',
  margin: 'margin',
  gap: 'gap',
  backgroundColor: 'background-color',
  color: 'color',
  fontSize: 'font-size',
  fontWeight: 'font-weight',
  textAlign: 'text-align',
  borderRadius: 'border-radius',
} as const;

type RenderableNode = PageNode | PageNodeV2 | PageNodeV3;
type RootRenderableNode =
  | RootNode
  | Extract<PageNodeV2, { type: 'root' }>
  | Extract<PageNodeV3, { type: 'root' }>;
type SectionRenderableNode =
  | SectionNode
  | Extract<PageNodeV2, { type: 'section' }>
  | Extract<PageNodeV3, { type: 'section' }>;
type ContainerRenderableNode =
  | ContainerNode
  | Extract<PageNodeV2, { type: 'container' }>
  | Extract<PageNodeV3, { type: 'container' }>;
type RenderContext = {
  siteSlug?: string;
  pageSlug?: string;
  tenantSlug?: string;
  runtimeIds?: readonly string[];
  extensions?: readonly PageRuntimeExtension[];
};
type NodeRenderer = (node: RenderableNode, context: RenderContext) => ReactElement;

function isSafeCssValue(value: string): boolean {
  return (
    !/[;{}<>"'`\r\n]/.test(value) &&
    !/(?:url|expression|javascript|vbscript|@import)/i.test(value)
  );
}

function styleBlockToProperties(style: PageNodeStyle['base'] | undefined): CSSProperties {
  if (!style) {
    return {};
  }

  const result: CSSProperties = {};
  for (const [property, value] of Object.entries(style)) {
    if (typeof value !== 'string' || !isSafeCssValue(value)) {
      continue;
    }
    (result as Record<string, string>)[property] = value;
  }
  return result;
}

function nodeStyle(node: RenderableNode): CSSProperties {
  const style = styleBlockToProperties(node.style?.base);
  if (node.type === 'text' && node.props.align) {
    style.textAlign = node.props.align;
  }
  return style;
}

function nodeAttributes(node: RenderableNode): {
  'data-payload-node-id': string;
  'data-payload-node-type': RenderableNode['type'];
} {
  return {
    'data-payload-node-id': node.id,
    'data-payload-node-type': node.type,
  };
}

function renderChildren(node: RenderableNode, context: RenderContext): ReactElement[] {
  return node.children.map((child) => (
    <Fragment key={child.id}>{renderNode(child, context)}</Fragment>
  ));
}

function renderRoot(node: RootRenderableNode, context: RenderContext): ReactElement {
  return (
    <main {...nodeAttributes(node)} style={nodeStyle(node)}>
      {renderChildren(node, context)}
    </main>
  );
}

function renderSection(
  node: SectionRenderableNode,
  context: RenderContext,
): ReactElement {
  return (
    <section {...nodeAttributes(node)} style={nodeStyle(node)}>
      {renderChildren(node, context)}
    </section>
  );
}

function renderContainer(
  node: ContainerRenderableNode,
  context: RenderContext,
): ReactElement {
  return (
    <div {...nodeAttributes(node)} style={nodeStyle(node)}>
      {renderChildren(node, context)}
    </div>
  );
}

function renderText(node: TextNode): ReactElement {
  return (
    <p {...nodeAttributes(node)} style={nodeStyle(node)}>
      {node.props.text}
    </p>
  );
}

function renderImage(node: ImageNode): ReactElement {
  return (
    <img
      {...nodeAttributes(node)}
      alt={node.props.alt}
      decoding="async"
      loading="lazy"
      src={node.props.src}
      style={nodeStyle(node)}
    />
  );
}

function isSafeHref(value: string): boolean {
  if (value.startsWith('/') && !value.startsWith('//') && !value.includes('\\')) {
    return true;
  }
  if (/^#[A-Za-z][A-Za-z0-9:_-]{0,127}$/.test(value)) {
    return true;
  }
  try {
    const protocol = new URL(value).protocol;
    return protocol === 'http:' || protocol === 'https:';
  } catch {
    return (
      /^mailto:[^\s@]+@[^\s@]+\.[^\s@]+$/i.test(value) ||
      /^tel:\+?[0-9(). -]{3,}$/i.test(value)
    );
  }
}

function renderButton(node: ButtonNode): ReactElement {
  const href = isSafeHref(node.props.href) ? node.props.href : '#';
  return (
    <a
      {...nodeAttributes(node)}
      href={href}
      rel={node.props.target === '_blank' ? 'noopener noreferrer' : undefined}
      style={nodeStyle(node)}
      target={node.props.target}
    >
      {node.props.label}
    </a>
  );
}

function renderCountdown(node: CountdownNode, context: RenderContext): ReactElement {
  if (context.runtimeIds?.includes('countdown.runtime')) {
    return (
      <div
        {...nodeAttributes(node)}
        data-extension="demo-builder-countdown"
        style={nodeStyle(node)}
      >
        <CountdownRuntime label={node.props.label} targetAt={node.props.targetAt} />
      </div>
    );
  }
  return (
    <div {...nodeAttributes(node)} style={nodeStyle(node)}>
      <span>{node.props.label}</span>{' '}
      <time dateTime={node.props.targetAt}>{node.props.targetAt}</time>
    </div>
  );
}

function renderExtension(node: ExtensionNode, context: RenderContext): ReactElement {
  const runtime = context.extensions?.find(
    (extension) => extension.extensionId === node.props.extensionId,
  );
  const custom = runtime?.custom;
  if (!custom) {
    return (
      <div
        {...nodeAttributes(node)}
        aria-label="Unavailable custom extension"
        data-extension={node.props.extensionId}
        role="note"
        style={nodeStyle(node)}
      >
        This custom extension is unavailable.
      </div>
    );
  }

  const { render } = custom;
  const href =
    render.buttonHref && isSafeHref(render.buttonHref) ? render.buttonHref : null;
  const style = nodeStyle(node);
  return (
    <section
      {...nodeAttributes(node)}
      data-extension={custom.id}
      style={{
        ...style,
        borderLeft: `4px solid ${render.accentColor}`,
        padding: style.padding ?? '24px',
      }}
    >
      {render.eyebrow ? <span className="eyebrow">{render.eyebrow}</span> : null}
      <h2>{render.heading}</h2>
      {render.body ? <p>{render.body}</p> : null}
      {render.buttonLabel && href ? (
        <a href={href} style={{ display: 'inline-block', marginTop: '12px' }}>
          {render.buttonLabel}
        </a>
      ) : null}
    </section>
  );
}

function renderForm(node: FormNode, context: RenderContext): ReactElement {
  const apiBaseUrl =
    process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://127.0.0.1:3001/api/v1';
  const submissionUrl =
    context.siteSlug && context.pageSlug
      ? `${apiBaseUrl}/public/sites/${encodeURIComponent(context.siteSlug)}/pages/${encodeURIComponent(context.pageSlug)}/forms/${encodeURIComponent(node.id)}/submissions${context.tenantSlug ? `?tenantSlug=${encodeURIComponent(context.tenantSlug)}` : ''}`
      : undefined;
  return <FormRenderer node={node} {...(submissionUrl ? { submissionUrl } : {})} />;
}

// This registry is intentionally explicit: the payload node type is the only
// dispatch key, and the renderer never imports editor or persistence modules.
const rendererRegistry: Partial<Record<RenderableNode['type'], NodeRenderer>> = {
  root: (node, context) => renderRoot(node as RootNode, context),
  section: (node, context) => renderSection(node as SectionNode, context),
  container: (node, context) => renderContainer(node as ContainerNode, context),
  text: (node) => renderText(node as TextNode),
  image: (node) => renderImage(node as ImageNode),
  button: (node) => renderButton(node as ButtonNode),
  form: (node, context) => renderForm(node as FormNode, context),
  countdown: (node, context) => renderCountdown(node as CountdownNode, context),
  extension: (node, context) => renderExtension(node as ExtensionNode, context),
};

function renderUnsupportedNode(node: Pick<RenderableNode, 'id' | 'type'>): ReactElement {
  return (
    <div
      aria-label="Unsupported page component"
      data-payload-node-id={node.id}
      data-payload-node-type={node.type}
      role="note"
    >
      This page component is not supported.
    </div>
  );
}

export function renderNode(
  node: RenderableNode,
  context: RenderContext = {},
): ReactElement {
  const Renderer = rendererRegistry[node.type];
  return Renderer ? Renderer(node, context) : renderUnsupportedNode(node);
}

type ResponsiveRule = {
  selector: string;
  declarations: string;
};

function responsiveRules(
  node: RenderableNode,
  viewport: 'tablet' | 'mobile',
  rules: ResponsiveRule[],
): void {
  const style = node.style?.[viewport];
  const declarations = style
    ? Object.entries(style)
        .filter(
          ([property, value]) =>
            property in stylePropertyMap &&
            typeof value === 'string' &&
            isSafeCssValue(value),
        )
        .map(
          ([property, value]) =>
            `${stylePropertyMap[property as keyof typeof stylePropertyMap]}:${value}`,
        )
        .join(';')
    : '';

  if (declarations) {
    rules.push({
      selector: `[data-payload-node-id="${node.id}"]`,
      declarations,
    });
  }

  node.children.forEach((child) => responsiveRules(child, viewport, rules));
}

function renderResponsiveStyles(payload: PagePayload): ReactElement | null {
  const tabletRules: ResponsiveRule[] = [];
  const mobileRules: ResponsiveRule[] = [];
  responsiveRules(payload.root, 'tablet', tabletRules);
  responsiveRules(payload.root, 'mobile', mobileRules);

  const tablet = tabletRules.length
    ? `@media (max-width: 991px){${tabletRules.map((rule) => `${rule.selector}{${rule.declarations}}`).join('')}}`
    : '';
  const mobile = mobileRules.length
    ? `@media (max-width: 479px){${mobileRules.map((rule) => `${rule.selector}{${rule.declarations}}`).join('')}}`
    : '';

  if (!tablet && !mobile) {
    return null;
  }

  return <style data-payload-responsive>{`${tablet}${mobile}`}</style>;
}

function RendererFallback(): ReactElement {
  return (
    <div className="payload-renderer-error" role="alert">
      This page is temporarily unavailable.
    </div>
  );
}

export function renderPage(payload: unknown, context: RenderContext = {}): ReactElement {
  const parsed = PagePayloadSchema.safeParse(payload);
  if (!parsed.success) {
    return <RendererFallback />;
  }

  return (
    <div className="payload-page">
      {context.runtimeIds?.length ? (
        <ExtensionRuntimeBootstrap runtimeIds={context.runtimeIds} />
      ) : null}
      {renderResponsiveStyles(parsed.data)}
      {renderNode(parsed.data.root, context)}
    </div>
  );
}
