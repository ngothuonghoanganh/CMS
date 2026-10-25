import { createIcon } from './createIcon';

// Paths are copied from the design boards (docs/design/plp-ux-v1/screens) where they exist.

/* Actions */
export const CloseIcon = createIcon('close', <path d="M6 6l12 12M18 6L6 18" />);
export const PlusIcon = createIcon('plus', <path d="M12 5v14M5 12h14" />);
export const CheckIcon = createIcon('check', <path d="M5 12.5l4.5 4.5L19 7.5" />);
export const UndoIcon = createIcon(
  'undo',
  <>
    <path d="M9 6L4 11l5 5" />
    <path d="M4 11h11a5 5 0 0 1 0 10h-3" />
  </>,
);
export const RedoIcon = createIcon(
  'redo',
  <>
    <path d="M15 6l5 5-5 5" />
    <path d="M20 11H9a5 5 0 0 0 0 10h3" />
  </>,
);
export const CopyIcon = createIcon(
  'copy',
  <>
    <rect x="9" y="9" width="11" height="11" rx="1.5" />
    <path d="M5 15V5a1 1 0 0 1 1-1h10" />
  </>,
);
export const DuplicateIcon = createIcon(
  'duplicate',
  <>
    <rect x="9" y="9" width="11" height="11" rx="1.5" />
    <path d="M5 15V5a1 1 0 0 1 1-1h10" />
    <path d="M14.5 12.5v4M12.5 14.5h4" />
  </>,
);
export const TrashIcon = createIcon(
  'trash',
  <path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" />,
);
export const SearchIcon = createIcon(
  'search',
  <>
    <circle cx="11" cy="11" r="6.5" />
    <path d="M20 20l-4.2-4.2" />
  </>,
);
export const ExternalLinkIcon = createIcon(
  'external-link',
  <path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" />,
);
export const DownloadIcon = createIcon('download', <path d="M12 4v11M7 10l5 5 5-5M5 20h14" />);
export const PhoneIcon = createIcon(
  'phone',
  <path d="M6.6 4h2.6l1.3 3.6-1.8 1.4a11 11 0 0 0 6.3 6.3l1.4-1.8 3.6 1.3v2.6A1.6 1.6 0 0 1 18.4 19 15 15 0 0 1 5 5.6 1.6 1.6 0 0 1 6.6 4z" />,
);
export const LogoutIcon = createIcon(
  'logout',
  <path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3M10 17l5-5-5-5M15 12H4" />,
);
export const MoreHorizontalIcon = createIcon(
  'more-horizontal',
  <>
    <circle cx="5" cy="12" r="1.6" />
    <circle cx="12" cy="12" r="1.6" />
    <circle cx="19" cy="12" r="1.6" />
  </>,
  { filled: true },
);
export const DragHandleIcon = createIcon(
  'drag-handle',
  <>
    <circle cx="9" cy="6" r="1.5" />
    <circle cx="15" cy="6" r="1.5" />
    <circle cx="9" cy="12" r="1.5" />
    <circle cx="15" cy="12" r="1.5" />
    <circle cx="9" cy="18" r="1.5" />
    <circle cx="15" cy="18" r="1.5" />
  </>,
  { filled: true },
);
export const MenuIcon = createIcon('menu', <path d="M4 6h16M4 12h16M4 18h16" />);

/* Direction */
export const ChevronDownIcon = createIcon('chevron-down', <path d="M6 9l6 6 6-6" />);
export const ChevronRightIcon = createIcon('chevron-right', <path d="M9 6l6 6-6 6" />);
/** Up/down chevrons: switchers and sortable columns. */
export const ChevronUpDownIcon = createIcon(
  'chevron-up-down',
  <path d="M8 9l4-4 4 4M8 15l4 4 4-4" />,
);
export const ArrowLeftIcon = createIcon('arrow-left', <path d="M19 12H5M11 6l-6 6 6 6" />);
export const ArrowRightIcon = createIcon('arrow-right', <path d="M5 12h14M13 6l6 6-6 6" />);
export const ArrowUpIcon = createIcon('arrow-up', <path d="M12 19V5M6 11l6-6 6 6" />);
export const ArrowDownIcon = createIcon('arrow-down', <path d="M12 5v14M6 13l6 6 6-6" />);

/* Visibility and devices */
const eyeOutline = <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" />;
export const EyeIcon = createIcon(
  'eye',
  <>
    {eyeOutline}
    <circle cx="12" cy="12" r="2.8" />
  </>,
);
export const EyeOffIcon = createIcon(
  'eye-off',
  <>
    {eyeOutline}
    <path d="M4 4l16 16" />
  </>,
);
export const DesktopIcon = createIcon(
  'desktop',
  <>
    <rect x="3" y="4" width="18" height="12" rx="1.5" />
    <path d="M8 20h8M12 16v4" />
  </>,
);
export const TabletIcon = createIcon(
  'tablet',
  <>
    <rect x="5" y="3" width="14" height="18" rx="2" />
    <path d="M11 18h2" />
  </>,
);
export const MobileIcon = createIcon(
  'mobile',
  <>
    <rect x="7" y="3" width="10" height="18" rx="2" />
    <path d="M11 18h2" />
  </>,
);

/* Status */
export const CheckCircleIcon = createIcon(
  'check-circle',
  <>
    <circle cx="12" cy="12" r="9" />
    <path d="M8 12.5l2.8 2.8L16.5 9.5" />
  </>,
);
export const InfoCircleIcon = createIcon(
  'info-circle',
  <>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 11v5M12 7.8v.1" />
  </>,
);
/** Error mark: blocking checks and failed states. */
export const AlertCircleIcon = createIcon(
  'alert-circle',
  <>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7.5v5.5M12 16.2v.1" />
  </>,
);
export const WarningTriangleIcon = createIcon(
  'warning-triangle',
  <>
    <path d="M12 4l9 16H3z" />
    <path d="M12 10v4M12 17.2v.1" />
  </>,
);
export const LockIcon = createIcon(
  'lock',
  <>
    <rect x="5" y="11" width="14" height="9" rx="1.5" />
    <path d="M8 11V8a4 4 0 0 1 8 0v3" />
  </>,
);

/* Objects */
export const HistoryIcon = createIcon(
  'history',
  <>
    <path d="M4 12a8 8 0 1 0 2.3-5.6L4 8.5" />
    <path d="M4 4v4.5h4.5M12 8v4l3 2" />
  </>,
);
/** Sliders: settings, "Cài đặt trang & SEO", "Cài đặt site". */
export const SettingsIcon = createIcon(
  'settings',
  <>
    <path d="M4 7h10M18 7h2M4 17h4M12 17h8" />
    <circle cx="16" cy="7" r="2" />
    <circle cx="10" cy="17" r="2" />
  </>,
);
export const GlobeIcon = createIcon(
  'globe',
  <>
    <circle cx="12" cy="12" r="9" />
    <path d="M3 12h18M12 3c2.5 2.6 3.8 5.6 3.8 9s-1.3 6.4-3.8 9c-2.5-2.6-3.8-5.6-3.8-9S9.5 5.6 12 3z" />
  </>,
);
export const ShieldCheckIcon = createIcon(
  'shield-check',
  <>
    <path d="M12 3l7 3v6c0 4.5-3 7.8-7 9-4-1.2-7-4.5-7-9V6z" />
    <path d="M9 12l2 2 4-4" />
  </>,
);
export const FileIcon = createIcon(
  'file',
  <>
    <path d="M7 3h7l5 5v12a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z" />
    <path d="M14 3v5h5" />
  </>,
);
export const ImageIcon = createIcon(
  'image',
  <>
    <rect x="3" y="5" width="18" height="14" rx="1.5" />
    <circle cx="9" cy="10" r="1.6" />
    <path d="M21 16l-5-5-8 8" />
  </>,
);

/* Page goals (screen 02) */
export const InboxIcon = createIcon(
  'inbox',
  <path d="M4 13l2.5-7h11L20 13v6a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1zM4 13h4l1.5 2.5h5L16 13h4" />,
);
export const TagIcon = createIcon('tag', <path d="M3 12V4h8l10 10-8 8zM7.5 7.5h.01" />);
export const CalendarIcon = createIcon(
  'calendar',
  <path d="M5 5h14a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1zM4 10h16M8 3v4M16 3v4" />,
);
export const BoxIcon = createIcon(
  'box',
  <path d="M12 3l8 4.5v9L12 21l-8-4.5v-9zM4 7.5l8 4.5 8-4.5M12 12v9" />,
);
export const ListIcon = createIcon(
  'list',
  <path d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01" />,
);
export const BuildingIcon = createIcon(
  'building',
  <path d="M4 21V5l8-2v18M12 8h8v13M8 8h.01M8 12h.01M8 16h.01M16 12h.01M16 16h.01M3 21h18" />,
);
