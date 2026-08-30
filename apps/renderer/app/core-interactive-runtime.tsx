'use client';

import React, {
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactElement,
  type ReactNode,
} from 'react';

function domId(value: string): string {
  return value.replace(/[^A-Za-z0-9_-]/g, '-');
}

type AccordionItem = {
  id: string;
  title: string;
  defaultOpen: boolean;
  content: ReactNode;
  style?: CSSProperties;
};

export function AccordionRuntime({
  allowMultiple,
  id,
  items,
  style,
}: {
  allowMultiple: boolean;
  id: string;
  items: AccordionItem[];
  style?: CSSProperties;
}): ReactElement {
  const [openIds, setOpenIds] = useState<Set<string>>(
    () => new Set(items.filter((item) => item.defaultOpen).map((item) => item.id)),
  );
  const safeId = domId(id);

  function toggle(itemId: string): void {
    setOpenIds((current) => {
      const next = new Set(allowMultiple ? current : []);
      if (!current.has(itemId)) next.add(itemId);
      return next;
    });
  }

  return (
    <div
      data-payload-node-id={id}
      data-payload-node-type="accordion"
      className="payload-accordion"
      style={style}
    >
      {items.map((item) => {
        const itemId = domId(item.id);
        const triggerId = `${safeId}-trigger-${itemId}`;
        const panelId = `${safeId}-panel-${itemId}`;
        const open = openIds.has(item.id);
        return (
          <section
            data-payload-node-id={item.id}
            data-payload-node-type="accordion-item"
            key={item.id}
            style={item.style}
          >
            <div role="heading" aria-level={3}>
              <button
                aria-controls={panelId}
                aria-expanded={open}
                id={triggerId}
                onClick={() => toggle(item.id)}
                type="button"
              >
                {item.title}
              </button>
            </div>
            <div
              aria-labelledby={triggerId}
              data-payload-panel={item.id}
              hidden={!open}
              id={panelId}
              role="region"
            >
              {item.content}
            </div>
          </section>
        );
      })}
    </div>
  );
}

type TabItem = {
  id: string;
  label: string;
  content: ReactNode;
  style?: CSSProperties;
};

export function TabsRuntime({
  id,
  items,
  orientation,
  style,
}: {
  id: string;
  items: TabItem[];
  orientation: 'horizontal' | 'vertical';
  style?: CSSProperties;
}): ReactElement {
  const [activeIndex, setActiveIndex] = useState(0);
  const [focusedIndex, setFocusedIndex] = useState(0);
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const safeId = domId(id);

  function focusTab(index: number): void {
    if (items.length === 0) return;
    const nextIndex = (index + items.length) % items.length;
    setFocusedIndex(nextIndex);
    tabRefs.current[nextIndex]?.focus();
  }

  function onTabKeyDown(
    index: number,
    event: ReactKeyboardEvent<HTMLButtonElement>,
  ): void {
    const previousKey = orientation === 'vertical' ? 'ArrowUp' : 'ArrowLeft';
    const nextKey = orientation === 'vertical' ? 'ArrowDown' : 'ArrowRight';
    if (event.key === previousKey) {
      event.preventDefault();
      focusTab(index - 1);
    } else if (event.key === nextKey) {
      event.preventDefault();
      focusTab(index + 1);
    } else if (event.key === 'Home') {
      event.preventDefault();
      focusTab(0);
    } else if (event.key === 'End') {
      event.preventDefault();
      focusTab(items.length - 1);
    } else if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      setActiveIndex(index);
    }
  }

  return (
    <div
      className={`payload-tabs payload-tabs-${orientation}`}
      data-payload-node-id={id}
      data-payload-node-type="tabs"
      style={style}
    >
      <div aria-label="Tabs" aria-orientation={orientation} role="tablist">
        {items.map((item, index) => {
          const itemId = domId(item.id);
          const tabId = `${safeId}-tab-${itemId}`;
          const panelId = `${safeId}-tabpanel-${itemId}`;
          return (
            <button
              aria-controls={panelId}
              aria-selected={index === activeIndex}
              id={tabId}
              key={item.id}
              onClick={() => {
                setFocusedIndex(index);
                setActiveIndex(index);
              }}
              onFocus={() => setFocusedIndex(index)}
              onKeyDown={(event) => onTabKeyDown(index, event)}
              ref={(element) => {
                tabRefs.current[index] = element;
              }}
              role="tab"
              tabIndex={index === focusedIndex ? 0 : -1}
              type="button"
            >
              {item.label}
            </button>
          );
        })}
      </div>
      {items.map((item, index) => {
        const itemId = domId(item.id);
        const tabId = `${safeId}-tab-${itemId}`;
        const panelId = `${safeId}-tabpanel-${itemId}`;
        return (
          <div
            aria-labelledby={tabId}
            data-payload-node-id={item.id}
            data-payload-node-type="tab-item"
            hidden={index !== activeIndex}
            id={panelId}
            key={item.id}
            role="tabpanel"
            style={item.style}
            tabIndex={0}
          >
            {item.content}
          </div>
        );
      })}
    </div>
  );
}
