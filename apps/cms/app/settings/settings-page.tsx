'use client';

import type { TenantPermission } from '@payload/contracts';
import Link from 'next/link';

import { useCmsShell } from '../cms-shell';
import { cmsViewPath, type CmsView } from '../cms-routes';
import { Icon, type CmsIconName } from '../ui/icons';
import { PageHeader } from '../ui/surfaces';

type SettingsLink = {
  description: string;
  icon: CmsIconName;
  key: CmsView;
  label: string;
  permission: TenantPermission;
};

const settingsGroups: Array<{ items: SettingsLink[]; title: string }> = [
  {
    title: 'Company and team',
    items: [
      {
        description: 'Company details, workspaces and members.',
        icon: 'organization',
        key: 'organization',
        label: 'Company settings',
        permission: 'workspace.read',
      },
      {
        description: 'Invite people and manage access.',
        icon: 'users',
        key: 'users',
        label: 'Members',
        permission: 'user.read',
      },
      {
        description: 'Choose what each role can do.',
        icon: 'roles',
        key: 'roles',
        label: 'Roles',
        permission: 'role.read',
      },
      {
        description: 'Plan, usage and invoices.',
        icon: 'billing',
        key: 'billing',
        label: 'Billing & usage',
        permission: 'billing.read',
      },
      {
        description: 'Review important changes in this company.',
        icon: 'audit',
        key: 'audit',
        label: 'Audit log',
        permission: 'audit.read',
      },
    ],
  },
  {
    title: 'Website defaults',
    items: [
      {
        description: 'Default brand styles used by websites.',
        icon: 'designSystem',
        key: 'design-system',
        label: 'Default brand',
        permission: 'design-system.read',
      },
      {
        description: 'Reusable page starting points.',
        icon: 'templates',
        key: 'templates',
        label: 'Templates',
        permission: 'template.read',
      },
      {
        description: 'Structured content used across pages.',
        icon: 'collections',
        key: 'collections',
        label: 'Content',
        permission: 'collection.read',
      },
      {
        description: 'Connect a custom website address.',
        icon: 'domains',
        key: 'domains',
        label: 'Domains',
        permission: 'domain.read',
      },
      {
        description: 'Search titles, descriptions and sharing previews.',
        icon: 'seo',
        key: 'seo',
        label: 'SEO',
        permission: 'seo.read',
      },
    ],
  },
  {
    title: 'Advanced tools',
    items: [
      {
        description: 'Understand visits and conversions.',
        icon: 'analytics',
        key: 'analytics',
        label: 'Analytics',
        permission: 'analytics.read',
      },
      {
        description: 'Connect forms and other services.',
        icon: 'integrations',
        key: 'integrations',
        label: 'Integrations',
        permission: 'integration.read',
      },
      {
        description: 'Automate actions after a form or page event.',
        icon: 'workflows',
        key: 'workflows',
        label: 'Workflows',
        permission: 'workflow.read',
      },
      {
        description: 'Manage installed platform extensions.',
        icon: 'extensions',
        key: 'extensions',
        label: 'Extensions',
        permission: 'extensions.read',
      },
    ],
  },
];

export default function SettingsPage() {
  const { can, workspaceId } = useCmsShell();

  return (
    <>
      <PageHeader
        description="Company settings and advanced tools live here. Your website work stays under Websites."
        eyebrow="Workspace"
        title="Settings"
      />
      <div className="settings-groups">
        {settingsGroups.map((group) => {
          const visibleItems = group.items.filter((item) => can(item.permission));
          if (!visibleItems.length) return null;
          return (
            <section className="settings-group panel" key={group.title}>
              <div className="panel-heading">
                <div>
                  <span className="eyebrow">Settings</span>
                  <h2>{group.title}</h2>
                </div>
              </div>
              <div className="settings-link-grid">
                {visibleItems.map((item) => (
                  <Link
                    className="settings-link-card"
                    href={cmsViewPath(workspaceId, item.key)}
                    key={item.key}
                  >
                    <span className="settings-link-icon">
                      <Icon name={item.icon} />
                    </span>
                    <span className="settings-link-copy">
                      <strong>{item.label}</strong>
                      <span className="muted">{item.description}</span>
                    </span>
                    <span aria-hidden="true" className="settings-link-arrow">
                      →
                    </span>
                  </Link>
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </>
  );
}
