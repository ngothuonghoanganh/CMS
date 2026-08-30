import {
  PAGE_COMPONENT_REGISTRY,
  PagePayloadSchema,
  type ContainerNode,
  type ImageNode,
  type PageNode,
  type PageNodeV2,
  type PageNodeV3,
  type PageNodeV4,
  type PageNodeV5,
  type PageNodeStyle,
  type PagePayload,
  type FormNode,
  type RootNode,
  type SectionNode,
  type TextNode,
  type ButtonNode,
  type CountdownNode,
  type ExtensionNode,
  type HeadingNode,
  type LinkNode,
  type DividerNode,
  type ListNode,
  type VideoNode,
  type QuoteNodeV5,
  type AccordionNodeV5,
  type AccordionItemNodeV5,
  type TabsNodeV5,
  type TabItemNodeV5,
  type GalleryNodeV5,
  type PageRuntimeExtension,
  type ResolvedNavigationItem,
  PAGE_RESPONSIVE_BREAKPOINTS,
  isSafePageStyleValue,
  pageStyleReactProperty,
  PAGE_STYLE_PROPERTY_BY_PAYLOAD_KEY,
} from '@payload/contracts';
import React, { Fragment, type CSSProperties, type ReactElement } from 'react';

import { FormRenderer } from './form-renderer';
import { CountdownRuntime, ExtensionRuntimeBootstrap } from './extension-runtime';
import { AccordionRuntime, TabsRuntime } from './core-interactive-runtime';

type RenderableNode = PageNode | PageNodeV2 | PageNodeV3 | PageNodeV4 | PageNodeV5;
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
  pagePath?: string;
  /** @deprecated legacy renderer callers may still provide pageSlug. */
  pageSlug?: string;
  tenantSlug?: string;
  runtimeIds?: readonly string[];
  extensions?: readonly PageRuntimeExtension[];
  customDomain?: boolean;
  navigation?:
    | {
        main?: readonly ResolvedNavigationItem[] | undefined;
        footer?: readonly ResolvedNavigationItem[] | undefined;
      }
    | undefined;
};
type NodeRenderer = (node: RenderableNode, context: RenderContext) => ReactElement;

function styleBlockToProperties(style: PageNodeStyle['base'] | undefined): CSSProperties {
  if (!style) {
    return {};
  }

  const result: CSSProperties = {};
  for (const [property, value] of Object.entries(style)) {
    const definition = PAGE_STYLE_PROPERTY_BY_PAYLOAD_KEY[property];
    if (!definition || typeof value !== 'string' || !isSafePageStyleValue(value)) {
      continue;
    }
    (result as Record<string, string>)[pageStyleReactProperty(definition)] = value;
  }
  return result;
}

function nodeStyle(node: RenderableNode): CSSProperties {
  const style = styleBlockToProperties(node.style?.base);
  // `props.align` is retained only as a legacy fallback. New edits are
  // written to style.textAlign, which must win whenever it is authored.
  if (node.type === 'text' && !node.style?.base?.textAlign && node.props.align) {
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

function renderHeading(node: HeadingNode): ReactElement {
  const Tag = `h${node.props.level}` as 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6';
  return (
    <Tag {...nodeAttributes(node)} style={nodeStyle(node)}>
      {node.props.text}
    </Tag>
  );
}

function renderLink(node: LinkNode): ReactElement {
  const href = isSafeHref(node.props.href) ? node.props.href : '#';
  return (
    <a
      {...nodeAttributes(node)}
      href={href}
      rel={node.props.target === '_blank' ? 'noopener noreferrer' : undefined}
      style={nodeStyle(node)}
      target={node.props.target}
    >
      {node.props.text}
    </a>
  );
}

function renderDivider(node: DividerNode): ReactElement {
  return <hr {...nodeAttributes(node)} style={nodeStyle(node)} />;
}

function renderList(node: ListNode): ReactElement {
  const Tag = node.props.ordered ? 'ol' : 'ul';
  return (
    <Tag {...nodeAttributes(node)} style={nodeStyle(node)}>
      {node.props.items.map((item) => (
        <li key={item.id}>{item.text}</li>
      ))}
    </Tag>
  );
}

function renderVideo(node: VideoNode): ReactElement {
  return (
    <video
      {...nodeAttributes(node)}
      autoPlay={node.props.autoplay}
      controls={node.props.controls}
      loop={node.props.loop}
      muted={node.props.muted}
      playsInline={node.props.playsInline}
      poster={node.props.poster}
      src={node.props.src}
      style={nodeStyle(node)}
    />
  );
}

function renderQuote(node: QuoteNodeV5): ReactElement {
  return (
    <blockquote {...nodeAttributes(node)} style={nodeStyle(node)}>
      <p>{node.props.text}</p>
      {node.props.cite?.trim() ? <cite>{node.props.cite}</cite> : null}
    </blockquote>
  );
}

function renderAccordion(node: AccordionNodeV5, context: RenderContext): ReactElement {
  return (
    <AccordionRuntime
      allowMultiple={node.props.allowMultiple}
      id={node.id}
      items={node.children.map((item) => ({
        id: item.id,
        title: item.type === 'accordion-item' ? item.props.title : 'Accordion item',
        defaultOpen: item.type === 'accordion-item' ? item.props.defaultOpen : false,
        content: renderChildren(item, context),
        ...(item.style ? { style: nodeStyle(item) } : {}),
      }))}
      style={nodeStyle(node)}
    />
  );
}

function renderAccordionItem(
  node: AccordionItemNodeV5,
  context: RenderContext,
): ReactElement {
  return (
    <section {...nodeAttributes(node)} style={nodeStyle(node)}>
      {renderChildren(node, context)}
    </section>
  );
}

function renderTabs(node: TabsNodeV5, context: RenderContext): ReactElement {
  return (
    <TabsRuntime
      id={node.id}
      items={node.children.map((item) => ({
        id: item.id,
        label: item.type === 'tab-item' ? item.props.label : 'Tab',
        content: renderChildren(item, context),
        ...(item.style ? { style: nodeStyle(item) } : {}),
      }))}
      orientation={node.props.orientation}
      style={nodeStyle(node)}
    />
  );
}

function renderTabItem(node: TabItemNodeV5, context: RenderContext): ReactElement {
  return (
    <section {...nodeAttributes(node)} style={nodeStyle(node)}>
      {renderChildren(node, context)}
    </section>
  );
}

function renderGallery(node: GalleryNodeV5, context: RenderContext): ReactElement {
  return (
    <div
      {...nodeAttributes(node)}
      style={{
        display: 'grid',
        gap: '16px',
        gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
        ...nodeStyle(node),
      }}
    >
      {renderChildren(node, context)}
    </div>
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
  const pagePath = context.pagePath ?? (context.pageSlug ? `/${context.pageSlug}` : '/');
  const submissionUrl = context.siteSlug
    ? `${apiBaseUrl}/public/sites/${encodeURIComponent(context.siteSlug)}/forms/${encodeURIComponent(node.id)}/submissions?path=${encodeURIComponent(pagePath)}${context.tenantSlug ? `&tenantSlug=${encodeURIComponent(context.tenantSlug)}` : ''}`
    : undefined;
  return <FormRenderer node={node} {...(submissionUrl ? { submissionUrl } : {})} />;
}

function navigationHref(href: string, context: RenderContext): string {
  if (context.customDomain || !context.siteSlug || !href.startsWith('/')) return href;
  return `/${context.siteSlug}${href === '/' ? '' : href}`;
}

function renderNavigationItems(
  items: readonly ResolvedNavigationItem[],
  context: RenderContext,
): ReactElement {
  return (
    <ul>
      {items.map((item) => (
        <li key={item.id}>
          <a
            href={navigationHref(item.href, context)}
            rel={item.openInNewTab ? 'noopener noreferrer' : undefined}
            target={item.openInNewTab ? '_blank' : undefined}
          >
            {item.label}
          </a>
          {item.children?.length ? renderNavigationItems(item.children, context) : null}
        </li>
      ))}
    </ul>
  );
}

function renderGlobalNavigation(
  items: readonly ResolvedNavigationItem[] | undefined,
  context: RenderContext,
  label: string,
  element: 'header' | 'footer',
): ReactElement | null {
  if (!items?.length) return null;
  const content = <nav aria-label={label}>{renderNavigationItems(items, context)}</nav>;
  return element === 'header' ? (
    <header data-site-global="header">{content}</header>
  ) : (
    <footer data-site-global="footer">{content}</footer>
  );
}

// This registry is intentionally explicit: the payload node type is the only
// dispatch key, and the renderer never imports editor or persistence modules.
export const PAGE_RENDERER_REGISTRY = {
  root: (node, context) => renderRoot(node as RootNode, context),
  section: (node, context) => renderSection(node as SectionNode, context),
  container: (node, context) => renderContainer(node as ContainerNode, context),
  text: (node) => renderText(node as TextNode),
  image: (node) => renderImage(node as ImageNode),
  button: (node) => renderButton(node as ButtonNode),
  form: (node, context) => renderForm(node as FormNode, context),
  countdown: (node, context) => renderCountdown(node as CountdownNode, context),
  extension: (node, context) => renderExtension(node as ExtensionNode, context),
  heading: (node) => renderHeading(node as HeadingNode),
  link: (node) => renderLink(node as LinkNode),
  divider: (node) => renderDivider(node as DividerNode),
  list: (node) => renderList(node as ListNode),
  video: (node) => renderVideo(node as VideoNode),
  quote: (node) => renderQuote(node as QuoteNodeV5),
  accordion: (node, context) => renderAccordion(node as AccordionNodeV5, context),
  'accordion-item': (node, context) =>
    renderAccordionItem(node as AccordionItemNodeV5, context),
  tabs: (node, context) => renderTabs(node as TabsNodeV5, context),
  'tab-item': (node, context) => renderTabItem(node as TabItemNodeV5, context),
  gallery: (node, context) => renderGallery(node as GalleryNodeV5, context),
} satisfies Record<RenderableNode['type'], NodeRenderer>;

function renderUnsupportedNode(node: Pick<RenderableNode, 'id' | 'type'>): ReactElement {
  return (
    <div
      aria-label="Unsupported page component"
      data-payload-node-id={node.id}
      data-payload-node-type={node.type}
      data-payload-render-error="unsupported-component"
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
  const definition = PAGE_COMPONENT_REGISTRY[node.type];
  const Renderer = PAGE_RENDERER_REGISTRY[node.type];
  return definition ? Renderer(node, context) : renderUnsupportedNode(node);
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
            property in PAGE_STYLE_PROPERTY_BY_PAYLOAD_KEY &&
            typeof value === 'string' &&
            isSafePageStyleValue(value),
        )
        .map(
          ([property, value]) =>
            `${PAGE_STYLE_PROPERTY_BY_PAYLOAD_KEY[property]?.cssProperty}:${value}!important`,
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
    ? `@media (max-width: ${PAGE_RESPONSIVE_BREAKPOINTS.tablet.maxWidth}px){${tabletRules.map((rule) => `${rule.selector}{${rule.declarations}}`).join('')}}`
    : '';
  const mobile = mobileRules.length
    ? `@media (max-width: ${PAGE_RESPONSIVE_BREAKPOINTS.mobile.maxWidth}px){${mobileRules.map((rule) => `${rule.selector}{${rule.declarations}}`).join('')}}`
    : '';

  if (!tablet && !mobile) {
    return null;
  }

  return <style data-payload-responsive>{`${tablet}${mobile}`}</style>;
}

function RendererFallback(): ReactElement {
  return (
    <div
      className="payload-renderer-error"
      data-payload-render-error="invalid-page-document"
      role="alert"
    >
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
      {renderGlobalNavigation(
        context.navigation?.main,
        context,
        'Main navigation',
        'header',
      )}
      {renderResponsiveStyles(parsed.data)}
      {renderNode(parsed.data.root, context)}
      {renderGlobalNavigation(
        context.navigation?.footer,
        context,
        'Footer navigation',
        'footer',
      )}
    </div>
  );
}
