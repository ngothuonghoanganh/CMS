'use client';

import React, {
  useState,
  type CSSProperties,
  type ReactElement,
  type ReactNode,
} from 'react';

function domId(value: string): string {
  return value.replace(/[^A-Za-z0-9_-]/g, '-');
}

export type AccordionItem = {
  id: string;
  title: string;
  defaultOpen: boolean;
  content: ReactNode;
  style?: CSSProperties;
  /** Persisted managed ids used by the Open Composition projection. */
  triggerId?: string;
  panelId?: string;
};

export type AccordionPartStyles = {
  root?: CSSProperties | undefined;
  item?: CSSProperties | undefined;
  trigger?: CSSProperties | undefined;
  panel?: CSSProperties | undefined;
  icon?: CSSProperties | undefined;
};

export function AccordionRuntime({
  allowMultiple,
  ariaLabel,
  headingLevel = 3,
  id,
  items,
  partsStyle,
  style,
  itemNodeType = 'accordion-item',
  panelNodeType,
  rootNodeType = 'accordion',
}: {
  allowMultiple: boolean;
  ariaLabel?: string;
  headingLevel?: 2 | 3 | 4 | 5 | 6;
  id: string;
  items: AccordionItem[];
  partsStyle?: AccordionPartStyles;
  style?: CSSProperties;
  itemNodeType?: string;
  panelNodeType?: string;
  rootNodeType?: string;
}): ReactElement {
  const [openIds, setOpenIds] = useState<Set<string>>(() => {
    const defaults = items.filter((item) => item.defaultOpen).map((item) => item.id);
    return new Set(allowMultiple ? defaults : defaults.slice(0, 1));
  });
  const safeId = domId(id);
  const HeadingTag = `h${headingLevel}` as 'h2' | 'h3' | 'h4' | 'h5' | 'h6';

  function toggle(itemId: string): void {
    setOpenIds((current) => {
      const next = new Set(allowMultiple ? current : []);
      if (!current.has(itemId)) next.add(itemId);
      return next;
    });
  }

  return (
    <div
      aria-label={ariaLabel}
      data-payload-node-id={id}
      data-payload-node-type={rootNodeType}
      className="payload-accordion"
      style={{ ...style, ...partsStyle?.root }}
    >
      {items.map((item) => {
        const itemId = domId(item.id);
        const triggerId = `${safeId}-trigger-${itemId}`;
        const panelId = `${safeId}-panel-${itemId}`;
        const open = openIds.has(item.id);
        return (
          <section
            data-payload-part="item"
            data-payload-node-id={item.id}
            data-payload-node-type={itemNodeType}
            key={item.id}
            style={{ ...item.style, ...partsStyle?.item }}
          >
            <HeadingTag>
              <button
                aria-controls={panelId}
                aria-expanded={open}
                id={triggerId}
                {...(item.triggerId ? { 'data-payload-node-id': item.triggerId } : {})}
                {...(item.triggerId ? { 'data-payload-node-type': 'button' } : {})}
                onClick={() => toggle(item.id)}
                style={partsStyle?.trigger}
                data-payload-part="trigger"
                type="button"
              >
                {item.title}
                <span
                  aria-hidden="true"
                  data-payload-part="icon"
                  style={partsStyle?.icon}
                >
                  {open ? '−' : '+'}
                </span>
              </button>
            </HeadingTag>
            <div
              aria-labelledby={triggerId}
              data-payload-panel={item.panelId ?? item.id}
              {...(item.panelId ? { 'data-payload-node-id': item.panelId } : {})}
              {...(item.panelId ? { 'data-payload-node-type': panelNodeType } : {})}
              hidden={!open}
              id={panelId}
              role="region"
              style={partsStyle?.panel}
              data-payload-part="panel"
            >
              {item.content}
            </div>
          </section>
        );
      })}
    </div>
  );
}
