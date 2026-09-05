'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

import { Icon } from './ui/icons';
import { ThemeSwitcher } from './ui/theme-provider';

type WorkspaceOption = { id: string; name: string };

export function AppHeader({
  companyName,
  currentWorkspaceId,
  workspaces,
  userEmail,
  mobileSidebarOpen,
  onOpenSidebar,
  onSwitchWorkspace,
  onLogout,
}: {
  companyName: string;
  currentWorkspaceId: string;
  workspaces: WorkspaceOption[];
  userEmail: string;
  mobileSidebarOpen: boolean;
  onOpenSidebar: () => void;
  onSwitchWorkspace: (workspaceId: string) => void;
  onLogout: () => void;
}) {
  const currentWorkspace = workspaces.find(
    (workspace) => workspace.id === currentWorkspaceId,
  );

  return (
    <header className="topbar">
      <button
        aria-controls="cms-sidebar"
        aria-expanded={mobileSidebarOpen}
        aria-label={mobileSidebarOpen ? 'Close navigation' : 'Open navigation'}
        className="mobile-menu-button"
        onClick={onOpenSidebar}
        type="button"
      >
        <Icon name="menu" />
      </button>
      <div className="context-cluster">
        <CurrentCompany name={companyName} />
        <WorkspaceSwitcher
          currentWorkspace={currentWorkspace}
          onSwitch={onSwitchWorkspace}
          workspaces={workspaces}
        />
      </div>
      <div className="header-account">
        <ThemeSwitcher />
        <div className="header-user-summary">
          <span aria-hidden="true" className="user-avatar">
            {userEmail.slice(0, 1).toUpperCase()}
          </span>
          <span className="user-menu-copy">
            <strong>{userEmail.split('@')[0] || 'Account'}</strong>
            <span className="muted small">{userEmail}</span>
          </span>
        </div>
        <button
          aria-label="Log out"
          className="button button-ghost user-logout"
          onClick={onLogout}
          title="Log out"
          type="button"
        >
          Log out
        </button>
      </div>
    </header>
  );
}

export function CurrentCompany({ name }: { name: string }) {
  return (
    <div aria-label="Current company" className="context-switcher current-company">
      <span className="context-label">Company</span>
      <strong className="context-value" title={name}>
        {name}
      </strong>
    </div>
  );
}

function WorkspaceSwitcher({
  currentWorkspace,
  workspaces,
  onSwitch,
}: {
  currentWorkspace: WorkspaceOption | undefined;
  workspaces: WorkspaceOption[];
  onSwitch: (workspaceId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const triggerRef = useRef<HTMLButtonElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const filteredWorkspaces = useMemo(() => {
    const query = search.trim().toLowerCase();
    return query
      ? workspaces.filter((workspace) => workspace.name.toLowerCase().includes(query))
      : workspaces;
  }, [search, workspaces]);

  useEffect(() => {
    if (!open) return;
    searchRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open]);

  if (!currentWorkspace) {
    return (
      <div aria-label="Current workspace" className="context-switcher workspace-switcher">
        <span className="context-label">Workspace</span>
        <strong className="context-value">Current workspace</strong>
      </div>
    );
  }

  if (workspaces.length <= 1) {
    return (
      <div aria-label="Current workspace" className="context-switcher workspace-switcher">
        <span className="context-label">Workspace</span>
        <strong className="context-value" title={currentWorkspace.name}>
          {currentWorkspace.name}
        </strong>
      </div>
    );
  }

  return (
    <div className="context-switcher workspace-switcher">
      <span className="context-label">Workspace</span>
      <button
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-label="Current workspace"
        className="workspace-trigger"
        onClick={() => setOpen((current) => !current)}
        ref={triggerRef}
        title={currentWorkspace.name}
        type="button"
      >
        <span className="context-value">{currentWorkspace.name}</span>
        <span aria-hidden="true" className="workspace-chevron">
          <Icon name="chevronDown" size={14} />
        </span>
      </button>
      {open ? (
        <div aria-label="Workspace options" className="workspace-popover" role="listbox">
          {workspaces.length > 4 ? (
            <input
              aria-label="Search workspaces"
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search workspace…"
              ref={searchRef}
              value={search}
            />
          ) : null}
          <div className="workspace-option-list">
            {filteredWorkspaces.length ? (
              filteredWorkspaces.map((workspace) => (
                <button
                  aria-selected={workspace.id === currentWorkspace.id}
                  className="workspace-option"
                  key={workspace.id}
                  onClick={() => {
                    setOpen(false);
                    setSearch('');
                    if (workspace.id !== currentWorkspace.id) onSwitch(workspace.id);
                  }}
                  role="option"
                  type="button"
                >
                  <span className="workspace-option-check" aria-hidden="true">
                    {workspace.id === currentWorkspace.id ? '✓' : ''}
                  </span>
                  <span>{workspace.name}</span>
                </button>
              ))
            ) : (
              <span className="muted small workspace-empty">No workspaces match.</span>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
