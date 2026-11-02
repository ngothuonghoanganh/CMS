'use client';

import { SparklesIcon } from '@plp/ui';
import { type KeyboardEvent, useState } from 'react';
import { AiAssistantPanel } from './assistant/AiAssistantPanel';
import { PropertiesPanel } from './PropertiesPanel';
import styles from './SidePanel.module.css';

export type SideTab = 'properties' | 'assistant';

const tabs: readonly { id: SideTab; label: string }[] = [
  { id: 'properties', label: 'Thuộc tính' },
  { id: 'assistant', label: 'Trợ lý AI' },
];

const tabId = (tab: SideTab) => `editor-side-tab-${tab}`;
const panelId = (tab: SideTab) => `editor-side-panel-${tab}`;

export interface SidePanelProps {
  tab: SideTab;
  onTabChange: (tab: SideTab) => void;
}

/**
 * The right column of the editor: "Thuộc tính" and "Trợ lý AI" (board 21) as tabs. Both panels
 * stay mounted once shown, so a field being edited or a suggestion being read survives a switch.
 * Arrow keys move between the tabs and choose them (APG tabs, automatic activation).
 */
export function SidePanel({ tab, onTabChange }: SidePanelProps) {
  // The assistant reads the month's uses when first opened, not with every editor.
  const [assistantOpened, setAssistantOpened] = useState(tab === 'assistant');
  if (tab === 'assistant' && !assistantOpened) {
    setAssistantOpened(true);
  }

  function choose(next: SideTab) {
    onTabChange(next);
    document.getElementById(tabId(next))?.focus();
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const index = tabs.findIndex((item) => item.id === tab);
    const step = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
    const target =
      event.key === 'Home'
        ? tabs[0]
        : event.key === 'End'
          ? tabs[tabs.length - 1]
          : step === 0
            ? undefined
            : tabs[(index + step + tabs.length) % tabs.length];
    if (target !== undefined) {
      event.preventDefault();
      choose(target.id);
    }
  }

  return (
    <div className={styles.side}>
      <div role="tablist" aria-label="Bảng bên phải" className={styles.tabs} onKeyDown={onKeyDown}>
        {tabs.map((item) => (
          <button
            key={item.id}
            id={tabId(item.id)}
            type="button"
            role="tab"
            aria-selected={tab === item.id}
            aria-controls={panelId(item.id)}
            tabIndex={tab === item.id ? 0 : -1}
            className={styles.tab}
            data-ai-focus={item.id === 'assistant' ? 'tab' : undefined}
            onClick={() => {
              onTabChange(item.id);
            }}
          >
            {item.id === 'assistant' ? <SparklesIcon size={15} /> : null}
            {item.label}
          </button>
        ))}
      </div>
      <div
        id={panelId('properties')}
        role="tabpanel"
        aria-labelledby={tabId('properties')}
        hidden={tab !== 'properties'}
        className={styles.panel}
      >
        <PropertiesPanel />
      </div>
      <div
        id={panelId('assistant')}
        role="tabpanel"
        aria-labelledby={tabId('assistant')}
        hidden={tab !== 'assistant'}
        className={styles.panel}
      >
        {assistantOpened ? <AiAssistantPanel /> : null}
      </div>
    </div>
  );
}
