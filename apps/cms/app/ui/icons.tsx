import type { SVGProps } from 'react';

export type CmsIconName =
  | 'analytics'
  | 'assets'
  | 'audit'
  | 'billing'
  | 'chevronDown'
  | 'chevronRight'
  | 'collections'
  | 'dashboard'
  | 'designSystem'
  | 'domains'
  | 'extensions'
  | 'grip'
  | 'integrations'
  | 'menu'
  | 'navigation'
  | 'organization'
  | 'pages'
  | 'roles'
  | 'search'
  | 'seo'
  | 'sites'
  | 'submissions'
  | 'templates'
  | 'users'
  | 'workflows';

const paths: Record<CmsIconName, string> = {
  analytics: 'M4 19V5m0 14h16M8 16v-4m4 4V8m4 8V4',
  assets:
    'M4 5.5A1.5 1.5 0 0 1 5.5 4h13A1.5 1.5 0 0 1 20 5.5v13a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 18.5v-13ZM7 16l3.2-3.5 2.4 2.5 1.8-2 2.6 3H7ZM8 8.5h.01',
  audit: 'M6 4h12v16H6V4Zm3 4h6M9 12h6M9 16h4',
  billing:
    'M12 3v18M16 7.5c0-1.4-1.8-2.5-4-2.5S8 6.1 8 7.5 9.8 10 12 10s4 1.1 4 2.5-1.8 2.5-4 2.5-4-1.1-4-2.5',
  chevronDown: 'm6 9 6 6 6-6',
  chevronRight: 'm9 6 6 6-6 6',
  collections: 'M5 5h14v14H5V5Zm4 0v14m-4-5h14',
  dashboard: 'M4 4h6v6H4V4Zm10 0h6v6h-6V4ZM4 14h6v6H4v-6Zm10 0h6v6h-6v-6Z',
  designSystem: 'm12 3 2.2 5.1L20 10.3l-5.8 2.2L12 18l-2.2-5.5L4 10.3l5.8-2.2L12 3Z',
  domains: 'M4 8h16M7 4h10a1 1 0 0 1 1 1v14H6V5a1 1 0 0 1 1-1Zm2 8h6',
  extensions: 'M9 3v6H3m6-6L3 9m12 12v-6h6m-6 6 6-6',
  grip: 'M8 6h.01M12 6h.01M16 6h.01M8 12h.01M12 12h.01M16 12h.01M8 18h.01M12 18h.01M16 18h.01',
  integrations:
    'M8 7h8m-8 5h8m-8 5h5M6 4h12a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z',
  menu: 'M4 6h16M4 12h16M4 18h16',
  navigation: 'M5 6h14M5 12h14M5 18h14',
  organization: 'M4 20V5h10v15M14 9h6v11M7 8h4M7 12h4M7 16h4M17 13h1M17 17h1',
  pages: 'M6 3h9l3 3v15H6V3Zm9 0v4h3M9 11h6M9 15h6',
  roles: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm-7 8a7 7 0 0 1 14 0',
  search: 'm21 21-4.35-4.35m2.1-5.15a7.25 7.25 0 1 1-14.5 0 7.25 7.25 0 0 1 14.5 0Z',
  seo: 'm11 4-7 8h8l-1 8 7-9h-8l1-7Z',
  sites: 'M4 6h16v12H4V6Zm0 4h16M8 14h3',
  submissions: 'M4 5h16v14H4V5Zm0 3 8 5 8-5',
  templates: 'M5 4h14v16H5V4Zm3 4h8M8 12h8M8 16h5',
  users:
    'M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Zm-5 9a5 5 0 0 1 10 0m3-8a2.5 2.5 0 1 0 0-5m-1 13a4 4 0 0 1 4-4',
  workflows: 'M5 5h5v5H5V5Zm9 9h5v5h-5v-5ZM10 7h4a2 2 0 0 1 2 2v5',
};

export function Icon({
  name,
  size = 16,
  ...props
}: { name: CmsIconName; size?: number } & Omit<SVGProps<SVGSVGElement>, 'name'>) {
  return (
    <svg
      aria-hidden="true"
      className="cms-icon"
      fill="none"
      height={size}
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.7"
      viewBox="0 0 24 24"
      width={size}
      {...props}
    >
      <path d={paths[name]} />
    </svg>
  );
}
