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
  type PageNodeV6,
  type PageNodeV7,
  type PageNodeStyle,
  type PageNodeStyleV7,
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
  SiteGlobalPayloadV1Schema,
  type SiteGlobals,
  PAGE_RESPONSIVE_BREAKPOINTS,
  isSafePageStyleValue,
  pageStyleReactProperty,
  PAGE_STYLE_PROPERTY_BY_PAYLOAD_KEY,
  resolvePageStyleValue,
  type ReusableRuntime,
  type SiteDesignSystem,
} from '@payload/contracts';
import React, { Fragment, type CSSProperties, type ReactElement } from 'react';

import { FormRenderer } from './form-renderer';
import { CountdownRuntime, ExtensionRuntimeBootstrap } from './extension-runtime';
import { AccordionRuntime, TabsRuntime } from './core-interactive-runtime';
import {
  NavigationViewRuntime,
  type NavigationViewPartStyles,
} from './runtime/navigation-view-runtime';

type RenderableNode =
  PageNode | PageNodeV2 | PageNodeV3 | PageNodeV4 | PageNodeV5 | PageNodeV6 | PageNodeV7;
type RootRenderableNode =
  | RootNode
  | Extract<PageNodeV2, { type: 'root' }>
  | Extract<PageNodeV3, { type: 'root' }>
  | Extract<PageNodeV4, { type: 'root' }>
  | Extract<PageNodeV5, { type: 'root' }>
  | Extract<PageNodeV6, { type: 'root' }>
  | Extract<PageNodeV7, { type: 'root' }>;
type SectionRenderableNode =
  | SectionNode
  | Extract<PageNodeV2, { type: 'section' }>
  | Extract<PageNodeV3, { type: 'section' }>
  | Extract<PageNodeV4, { type: 'section' }>
  | Extract<PageNodeV5, { type: 'section' }>
  | Extract<PageNodeV6, { type: 'section' }>
  | Extract<PageNodeV7, { type: 'section' }>;
type ContainerRenderableNode =
  | ContainerNode
  | Extract<PageNodeV2, { type: 'container' }>
  | Extract<PageNodeV3, { type: 'container' }>
  | Extract<PageNodeV4, { type: 'container' }>
  | Extract<PageNodeV5, { type: 'container' }>
  | Extract<PageNodeV6, { type: 'container' }>
  | Extract<PageNodeV7, { type: 'container' }>;

type AccordionRenderableNode =
  AccordionNodeV5 | Extract<PageNodeV6 | PageNodeV7, { type: 'accordion' }>;
type AccordionItemRenderableNode =
  AccordionItemNodeV5 | Extract<PageNodeV6 | PageNodeV7, { type: 'accordion-item' }>;
type TabsRenderableNode = TabsNodeV5 | Extract<PageNodeV6 | PageNodeV7, { type: 'tabs' }>;
type TabItemRenderableNode =
  TabItemNodeV5 | Extract<PageNodeV6 | PageNodeV7, { type: 'tab-item' }>;
type GalleryRenderableNode =
  GalleryNodeV5 | Extract<PageNodeV6 | PageNodeV7, { type: 'gallery' }>;
type GlobalHeaderRenderableNode = Extract<
  PageNodeV6 | PageNodeV7,
  { type: 'global-header' }
>;
type GlobalFooterRenderableNode = Extract<
  PageNodeV6 | PageNodeV7,
  { type: 'global-footer' }
>;
type NavigationViewRenderableNode = Extract<
  PageNodeV6 | PageNodeV7,
  { type: 'navigation-view' }
>;
type SiteBrandRenderableNode = Extract<PageNodeV6 | PageNodeV7, { type: 'site-brand' }>;
export type RenderContext = {
  siteSlug?: string;
  pagePath?: string;
  /** @deprecated legacy renderer callers may still provide pageSlug. */
  pageSlug?: string;
  tenantSlug?: string;
  siteName?: string;
  siteLogo?: string;
  runtimeIds?: readonly string[];
  extensions?: readonly PageRuntimeExtension[];
  customDomain?: boolean;
  navigation?:
    | {
        main?: readonly ResolvedNavigationItem[] | undefined;
        footer?: readonly ResolvedNavigationItem[] | undefined;
      }
    | undefined;
  globals?: SiteGlobals | undefined;
  reusables?: readonly ReusableRuntime[] | undefined;
  designSystem?: SiteDesignSystem | undefined;
  reusableStack?: readonly string[] | undefined;
};
type NodeRenderer = (node: RenderableNode, context: RenderContext) => ReactElement;

function styleBlockToProperties(
  style: PageNodeStyle['base'] | PageNodeStyleV7['base'] | undefined,
  context: RenderContext = {},
): CSSProperties {
  if (!style) {
    return {};
  }

  const result: CSSProperties = {};
  for (const [property, value] of Object.entries(style)) {
    const definition = PAGE_STYLE_PROPERTY_BY_PAYLOAD_KEY[property];
    if (!definition || (typeof value !== 'string' && typeof value !== 'object')) {
      continue;
    }
    const resolved = resolvePageStyleValue(
      value as string | { kind: 'token'; tokenId: string },
      context.designSystem,
      definition.key,
    );
    if (!resolved || !isSafePageStyleValue(resolved)) continue;
    (result as Record<string, string>)[pageStyleReactProperty(definition)] = resolved;
  }
  return result;
}

function nodeStyle(node: RenderableNode, context: RenderContext = {}): CSSProperties {
  const style = styleBlockToProperties(node.style?.base, context);
  // `props.align` is retained only as a legacy fallback. New edits are
  // written to style.textAlign, which must win whenever it is authored.
  if (node.type === 'text' && !node.style?.base?.textAlign && node.props.align) {
    style.textAlign = node.props.align;
  }
  return style;
}

function nodePartStyle(
  node: RenderableNode,
  part: string,
  context: RenderContext = {},
): CSSProperties | undefined {
  const partsStyle = (
    node as { partsStyle?: Record<string, PageNodeStyle | PageNodeStyleV7> }
  ).partsStyle;
  return partsStyle?.[part]
    ? styleBlockToProperties(partsStyle[part].base, context)
    : undefined;
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
    <main {...nodeAttributes(node)} style={nodeStyle(node, context)}>
      {renderChildren(node, context)}
    </main>
  );
}

function renderSection(
  node: SectionRenderableNode,
  context: RenderContext,
): ReactElement {
  return (
    <section {...nodeAttributes(node)} style={nodeStyle(node, context)}>
      {renderChildren(node, context)}
    </section>
  );
}

function renderContainer(
  node: ContainerRenderableNode,
  context: RenderContext,
): ReactElement {
  return (
    <div {...nodeAttributes(node)} style={nodeStyle(node, context)}>
      {renderChildren(node, context)}
    </div>
  );
}

function renderText(node: TextNode, context: RenderContext): ReactElement {
  return (
    <p {...nodeAttributes(node)} style={nodeStyle(node, context)}>
      {node.props.text}
    </p>
  );
}

function renderImage(node: ImageNode, context: RenderContext): ReactElement {
  return (
    <img
      {...nodeAttributes(node)}
      alt={node.props.alt}
      decoding="async"
      loading="lazy"
      src={node.props.src}
      style={nodeStyle(node, context)}
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

function renderButton(node: ButtonNode, context: RenderContext): ReactElement {
  const href = isSafeHref(node.props.href) ? node.props.href : '#';
  return (
    <a
      {...nodeAttributes(node)}
      href={href}
      rel={node.props.target === '_blank' ? 'noopener noreferrer' : undefined}
      style={nodeStyle(node, context)}
      target={node.props.target}
    >
      {node.props.label}
    </a>
  );
}

function renderHeading(node: HeadingNode, context: RenderContext): ReactElement {
  const Tag = `h${node.props.level}` as 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6';
  return (
    <Tag {...nodeAttributes(node)} style={nodeStyle(node, context)}>
      {node.props.text}
    </Tag>
  );
}

function renderLink(node: LinkNode, context: RenderContext): ReactElement {
  const href = isSafeHref(node.props.href) ? node.props.href : '#';
  return (
    <a
      {...nodeAttributes(node)}
      href={href}
      rel={node.props.target === '_blank' ? 'noopener noreferrer' : undefined}
      style={nodeStyle(node, context)}
      target={node.props.target}
    >
      {node.props.text}
    </a>
  );
}

function renderDivider(node: DividerNode, context: RenderContext): ReactElement {
  return <hr {...nodeAttributes(node)} style={nodeStyle(node, context)} />;
}

function renderList(node: ListNode, context: RenderContext): ReactElement {
  const Tag = node.props.ordered ? 'ol' : 'ul';
  return (
    <Tag {...nodeAttributes(node)} style={nodeStyle(node, context)}>
      {node.props.items.map((item) => (
        <li key={item.id}>{item.text}</li>
      ))}
    </Tag>
  );
}

function renderVideo(node: VideoNode, context: RenderContext): ReactElement {
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
      style={nodeStyle(node, context)}
    />
  );
}

function renderQuote(node: QuoteNodeV5, context: RenderContext): ReactElement {
  return (
    <blockquote {...nodeAttributes(node)} style={nodeStyle(node, context)}>
      <p>{node.props.text}</p>
      {node.props.cite?.trim() ? <cite>{node.props.cite}</cite> : null}
    </blockquote>
  );
}

function renderAccordion(
  node: AccordionRenderableNode,
  context: RenderContext,
): ReactElement {
  return (
    <AccordionRuntime
      allowMultiple={node.props.allowMultiple}
      {...('ariaLabel' in node.props && node.props.ariaLabel
        ? { ariaLabel: node.props.ariaLabel }
        : {})}
      headingLevel={'headingLevel' in node.props ? node.props.headingLevel : 3}
      id={node.id}
      items={node.children.map((item) => ({
        id: item.id,
        title: item.type === 'accordion-item' ? item.props.title : 'Accordion item',
        defaultOpen: item.type === 'accordion-item' ? item.props.defaultOpen : false,
        content: renderChildren(item, context),
        ...(item.style ? { style: nodeStyle(item, context) } : {}),
      }))}
      partsStyle={{
        root: nodePartStyle(node, 'root', context),
        item: nodePartStyle(node, 'item', context),
        trigger: nodePartStyle(node, 'trigger', context),
        panel: nodePartStyle(node, 'panel', context),
        icon: nodePartStyle(node, 'icon', context),
      }}
      style={nodeStyle(node, context)}
    />
  );
}

function renderAccordionItem(
  node: AccordionItemRenderableNode,
  context: RenderContext,
): ReactElement {
  return (
    <section {...nodeAttributes(node)} style={nodeStyle(node, context)}>
      {renderChildren(node, context)}
    </section>
  );
}

function renderTabs(node: TabsRenderableNode, context: RenderContext): ReactElement {
  return (
    <TabsRuntime
      activationMode={
        'activationMode' in node.props ? node.props.activationMode : 'automatic'
      }
      ariaLabel={'ariaLabel' in node.props ? node.props.ariaLabel : 'Tabs'}
      id={node.id}
      items={node.children.map((item) => ({
        id: item.id,
        label: item.type === 'tab-item' ? item.props.label : 'Tab',
        content: renderChildren(item, context),
        ...(item.style ? { style: nodeStyle(item, context) } : {}),
      }))}
      orientation={node.props.orientation}
      partsStyle={{
        root: nodePartStyle(node, 'root', context),
        list: nodePartStyle(node, 'list', context),
        tab: nodePartStyle(node, 'tab', context),
        activeTab: nodePartStyle(node, 'activeTab', context),
        panel: nodePartStyle(node, 'panel', context),
      }}
      style={nodeStyle(node, context)}
    />
  );
}

function renderTabItem(
  node: TabItemRenderableNode,
  context: RenderContext,
): ReactElement {
  return (
    <section {...nodeAttributes(node)} style={nodeStyle(node, context)}>
      {renderChildren(node, context)}
    </section>
  );
}

function renderGallery(
  node: GalleryRenderableNode,
  context: RenderContext,
): ReactElement {
  return (
    <div
      {...nodeAttributes(node)}
      style={{
        display: 'grid',
        gap: '16px',
        gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
        ...nodeStyle(node, context),
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
        style={nodeStyle(node, context)}
      >
        <CountdownRuntime label={node.props.label} targetAt={node.props.targetAt} />
      </div>
    );
  }
  return (
    <div {...nodeAttributes(node)} style={nodeStyle(node, context)}>
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
        style={nodeStyle(node, context)}
      >
        This custom extension is unavailable.
      </div>
    );
  }

  const { render } = custom;
  const href =
    render.buttonHref && isSafeHref(render.buttonHref) ? render.buttonHref : null;
  const style = nodeStyle(node, context);
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
            aria-current={
              item.href.split(/[?#]/, 1)[0] === (context.pagePath ?? '/')
                ? 'page'
                : undefined
            }
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

function renderNavigationView(
  node: NavigationViewRenderableNode,
  context: RenderContext,
): ReactElement {
  const items =
    node.props.source === 'footer'
      ? (context.navigation?.footer ?? [])
      : (context.navigation?.main ?? []);
  return (
    <NavigationViewRuntime
      alignment={node.props.alignment}
      ariaLabel={node.props.ariaLabel}
      customDomain={context.customDomain}
      id={node.id}
      items={items}
      mobileBehavior={node.props.mobileBehavior}
      orientation={node.props.orientation}
      pagePath={context.pagePath}
      partsStyle={
        {
          root: nodePartStyle(node, 'root', context),
          list: nodePartStyle(node, 'list', context),
          item: nodePartStyle(node, 'item', context),
          link: nodePartStyle(node, 'link', context),
          activeLink: nodePartStyle(node, 'activeLink', context),
          mobileToggle: nodePartStyle(node, 'mobileToggle', context),
          mobilePanel: nodePartStyle(node, 'mobilePanel', context),
        } satisfies NavigationViewPartStyles
      }
      siteSlug={context.siteSlug}
    />
  );
}

function renderSiteBrand(
  node: SiteBrandRenderableNode,
  context: RenderContext,
): ReactElement {
  const showLogo = node.props.display === 'logo' || node.props.display === 'logo-text';
  const showText = node.props.display === 'text' || node.props.display === 'logo-text';
  return (
    <a
      {...nodeAttributes(node)}
      data-payload-part="root"
      href={isSafeHref(node.props.href) ? node.props.href : '/'}
      style={{ ...nodeStyle(node, context), ...nodePartStyle(node, 'root', context) }}
    >
      {showLogo && context.siteLogo ? (
        <img alt="" data-payload-part="logo" src={context.siteLogo} />
      ) : null}
      {showText ? (
        <span data-payload-part="text">{context.siteName ?? 'Site'}</span>
      ) : null}
    </a>
  );
}

function renderGlobalHeaderChild(
  node: RenderableNode,
  context: RenderContext,
): ReactElement {
  const part =
    node.type === 'site-brand'
      ? 'brand'
      : node.type === 'navigation-view'
        ? 'navigation'
        : node.type === 'button' || node.type === 'link'
          ? 'actions'
          : undefined;
  const rendered = renderNode(node, context);
  return part
    ? React.cloneElement(
        rendered as React.ReactElement<{ 'data-payload-part'?: string }>,
        { 'data-payload-part': part },
      )
    : rendered;
}

function renderGlobalFooterChild(
  node: RenderableNode,
  context: RenderContext,
): ReactElement {
  return React.cloneElement(
    renderNode(node, context) as React.ReactElement<{ 'data-payload-part'?: string }>,
    { 'data-payload-part': 'content' },
  );
}

function renderGlobalHeader(
  node: GlobalHeaderRenderableNode,
  context: RenderContext,
): ReactElement {
  return (
    <header
      {...nodeAttributes(node)}
      data-site-global="header"
      data-site-global-position={node.props.position}
      style={{
        ...nodeStyle(node, context),
        ...nodePartStyle(node, 'root', context),
        ...(node.props.position === 'sticky'
          ? { position: 'sticky', top: 0, zIndex: 10 }
          : {}),
      }}
    >
      {node.children.map((child) => (
        <Fragment key={child.id}>{renderGlobalHeaderChild(child, context)}</Fragment>
      ))}
    </header>
  );
}

function renderGlobalFooter(
  node: GlobalFooterRenderableNode,
  context: RenderContext,
): ReactElement {
  return (
    <footer
      {...nodeAttributes(node)}
      data-site-global="footer"
      style={{ ...nodeStyle(node, context), ...nodePartStyle(node, 'root', context) }}
    >
      {node.children.map((child) => (
        <Fragment key={child.id}>{renderGlobalFooterChild(child, context)}</Fragment>
      ))}
    </footer>
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

function renderReusableInstance(
  node: Extract<PageNodeV7, { type: 'reusable-instance' }>,
  context: RenderContext,
): ReactElement {
  const source = context.reusables?.find(
    (candidate) => candidate.id === node.props.reusableId,
  );
  const stack = context.reusableStack ?? [];
  if (!source || stack.includes(node.props.reusableId)) {
    return (
      <div
        {...nodeAttributes(node)}
        aria-label="Reusable section unavailable"
        data-reusable-unavailable="true"
        data-reusable-source-id={node.props.reusableId}
        role="note"
      >
        Reusable section unavailable.
      </div>
    );
  }
  const nextContext: RenderContext = {
    ...context,
    reusableStack: [...stack, node.props.reusableId],
  };
  return (
    <div
      {...nodeAttributes(node)}
      data-reusable-id={node.props.reusableId}
      style={nodeStyle(node, context)}
    >
      {renderResponsiveStyles(source.document, nextContext)}
      {renderNode(source.document.root, nextContext)}
    </div>
  );
}

// This registry is intentionally explicit: the payload node type is the only
// dispatch key, and the renderer never imports editor or persistence modules.
export const PAGE_RENDERER_REGISTRY = {
  root: (node, context) => renderRoot(node as RootNode, context),
  section: (node, context) => renderSection(node as SectionNode, context),
  container: (node, context) => renderContainer(node as ContainerNode, context),
  text: (node, context) => renderText(node as TextNode, context),
  image: (node, context) => renderImage(node as ImageNode, context),
  button: (node, context) => renderButton(node as ButtonNode, context),
  form: (node, context) => renderForm(node as FormNode, context),
  countdown: (node, context) => renderCountdown(node as CountdownNode, context),
  extension: (node, context) => renderExtension(node as ExtensionNode, context),
  heading: (node, context) => renderHeading(node as HeadingNode, context),
  link: (node, context) => renderLink(node as LinkNode, context),
  divider: (node, context) => renderDivider(node as DividerNode, context),
  list: (node, context) => renderList(node as ListNode, context),
  video: (node, context) => renderVideo(node as VideoNode, context),
  quote: (node, context) => renderQuote(node as QuoteNodeV5, context),
  accordion: (node, context) => renderAccordion(node as AccordionNodeV5, context),
  'accordion-item': (node, context) =>
    renderAccordionItem(node as AccordionItemNodeV5, context),
  tabs: (node, context) => renderTabs(node as TabsNodeV5, context),
  'tab-item': (node, context) => renderTabItem(node as TabItemNodeV5, context),
  gallery: (node, context) => renderGallery(node as GalleryNodeV5, context),
  'global-header': (node, context) =>
    renderGlobalHeader(node as GlobalHeaderRenderableNode, context),
  'global-footer': (node, context) =>
    renderGlobalFooter(node as GlobalFooterRenderableNode, context),
  'navigation-view': (node, context) =>
    renderNavigationView(node as NavigationViewRenderableNode, context),
  'site-brand': (node, context) =>
    renderSiteBrand(node as SiteBrandRenderableNode, context),
  'reusable-instance': (node, context) =>
    renderReusableInstance(
      node as Extract<PageNodeV7, { type: 'reusable-instance' }>,
      context,
    ),
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

export function renderSiteGlobalDocument(
  payload: unknown,
  context: RenderContext = {},
): ReactElement | null {
  const parsed = SiteGlobalPayloadV1Schema.safeParse(payload);
  if (!parsed.success) return null;
  const expectedType =
    parsed.data.documentKind === 'site-header' ? 'global-header' : 'global-footer';
  if (!parsed.data.root.children.some((child) => child.type === expectedType))
    return null;
  return (
    <>
      {renderResponsiveStyles(parsed.data, context)}
      {parsed.data.root.children.map((child) => (
        <Fragment key={child.id}>{renderNode(child, context)}</Fragment>
      ))}
    </>
  );
}

type ResponsiveRule = {
  selector: string;
  declarations: string;
};

function responsiveNodeSelector(nodeId: string, context: RenderContext): string {
  const selector = `[data-payload-node-id="${nodeId}"]`;
  const reusableId = context.reusableStack?.at(-1);
  return reusableId ? `[data-reusable-id="${reusableId}"] ${selector}` : selector;
}

function responsiveRules(
  node: RenderableNode,
  viewport: 'tablet' | 'mobile',
  rules: ResponsiveRule[],
  context: RenderContext,
): void {
  const style = node.style?.[viewport];
  const declarations = style
    ? Object.entries(style)
        .flatMap(([property, value]) => {
          const definition = PAGE_STYLE_PROPERTY_BY_PAYLOAD_KEY[property];
          if (!definition || (typeof value !== 'string' && typeof value !== 'object'))
            return [];
          const resolved = resolvePageStyleValue(
            value as string | { kind: 'token'; tokenId: string },
            context.designSystem,
            definition.key,
          );
          return resolved && isSafePageStyleValue(resolved)
            ? [`${definition.cssProperty}:${resolved}!important`]
            : [];
        })
        .join(';')
    : '';

  if (declarations) {
    rules.push({
      selector: responsiveNodeSelector(node.id, context),
      declarations,
    });
  }

  for (const [partName, partStyle] of Object.entries(
    (node as { partsStyle?: Record<string, PageNodeStyle> }).partsStyle ?? {},
  )) {
    const partDeclarations = partStyle[viewport]
      ? Object.entries(partStyle[viewport] ?? {})
          .flatMap(([property, value]) => {
            const definition = PAGE_STYLE_PROPERTY_BY_PAYLOAD_KEY[property];
            if (!definition || (typeof value !== 'string' && typeof value !== 'object'))
              return [];
            const resolved = resolvePageStyleValue(
              value as string | { kind: 'token'; tokenId: string },
              context.designSystem,
              definition.key,
            );
            return resolved && isSafePageStyleValue(resolved)
              ? [`${definition.cssProperty}:${resolved}!important`]
              : [];
          })
          .join(';')
      : '';
    if (partDeclarations) {
      rules.push({
        selector:
          partName === 'root'
            ? responsiveNodeSelector(node.id, context)
            : `${responsiveNodeSelector(node.id, context)} [data-payload-part="${partName}"]`,
        declarations: partDeclarations,
      });
    }
  }

  node.children.forEach((child) => responsiveRules(child, viewport, rules, context));
}

function renderResponsiveStyles(
  payload: { root: RenderableNode },
  context: RenderContext = {},
): ReactElement | null {
  const tabletRules: ResponsiveRule[] = [];
  const mobileRules: ResponsiveRule[] = [];
  responsiveRules(payload.root, 'tablet', tabletRules, context);
  responsiveRules(payload.root, 'mobile', mobileRules, context);

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
      {context.globals?.header
        ? (renderSiteGlobalDocument(context.globals.header, context) ??
          renderGlobalNavigation(
            context.navigation?.main,
            context,
            'Main navigation',
            'header',
          ))
        : renderGlobalNavigation(
            context.navigation?.main,
            context,
            'Main navigation',
            'header',
          )}
      {renderResponsiveStyles(parsed.data, context)}
      {renderNode(parsed.data.root, context)}
      {context.globals?.footer
        ? (renderSiteGlobalDocument(context.globals.footer, context) ??
          renderGlobalNavigation(
            context.navigation?.footer,
            context,
            'Footer navigation',
            'footer',
          ))
        : renderGlobalNavigation(
            context.navigation?.footer,
            context,
            'Footer navigation',
            'footer',
          )}
    </div>
  );
}
