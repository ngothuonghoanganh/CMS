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

type TabItem = {
  id: string;
  label: string;
  content: ReactNode;
  style?: CSSProperties;
};

export type TabsPartStyles = {
  root?: CSSProperties | undefined;
  list?: CSSProperties | undefined;
  tab?: CSSProperties | undefined;
  activeTab?: CSSProperties | undefined;
  panel?: CSSProperties | undefined;
};

export function TabsRuntime({
  activationMode = 'automatic',
  ariaLabel = 'Tabs',
  id,
  items,
  orientation,
  partsStyle,
  style,
}: {
  activationMode?: 'manual' | 'automatic';
  ariaLabel?: string;
  id: string;
  items: TabItem[];
  orientation: 'horizontal' | 'vertical';
  partsStyle?: TabsPartStyles;
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
    if (activationMode === 'automatic') setActiveIndex(nextIndex);
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
    } else if (
      activationMode === 'manual' &&
      (event.key === 'Enter' || event.key === ' ')
    ) {
      event.preventDefault();
      setActiveIndex(index);
    }
  }

  return (
    <div
      className={`payload-tabs payload-tabs-${orientation}`}
      data-payload-node-id={id}
      data-payload-node-type="tabs"
      style={{ ...style, ...partsStyle?.root }}
    >
      <div
        aria-label={ariaLabel}
        aria-orientation={orientation}
        data-payload-part="list"
        role="tablist"
        style={partsStyle?.list}
      >
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
              data-payload-part={index === activeIndex ? 'activeTab' : 'tab'}
              style={{
                ...partsStyle?.tab,
                ...(index === activeIndex ? partsStyle?.activeTab : {}),
              }}
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
            data-payload-part="panel"
            style={{ ...item.style, ...partsStyle?.panel }}
            tabIndex={0}
          >
            {item.content}
          </div>
        );
      })}
    </div>
  );
}
