// Admin base components. Each component lives in its own folder with styles and tests.
// Tokens: import '@plp/ui/tokens.css' once in the admin root layout.

export { Avatar, type AvatarProps } from './Avatar/Avatar';
export { initialsOf } from './Avatar/initials';
export { Badge, type BadgeProps, type BadgeSize, type BadgeTone } from './Badge/Badge';
export { StatusBadge, type StatusBadgeProps } from './Badge/StatusBadge';
export { Button, type ButtonProps } from './Button/Button';
export {
  ButtonLink,
  type ButtonLinkProps,
  type LinkComponent,
  type LinkComponentProps,
} from './Button/ButtonLink';
export {
  buttonClassName,
  type ButtonSize,
  type ButtonStyleOptions,
  type ButtonVariant,
} from './Button/buttonClassName';
export { Callout, type CalloutProps, type CalloutTone } from './Callout/Callout';
export { Card, type CardProps } from './Card/Card';
export { Checkbox, type CheckboxProps } from './Checkbox/Checkbox';
export {
  ConfirmDialog,
  type ConfirmDialogProps,
  type ConfirmReasonOptions,
} from './Dialog/ConfirmDialog';
export { Dialog, type DialogProps, type DialogSize } from './Dialog/Dialog';
export {
  DropdownMenu,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  type DropdownMenuItemProps,
  type DropdownMenuProps,
  type DropdownMenuRadioGroupProps,
  type DropdownMenuRadioItemProps,
} from './DropdownMenu/DropdownMenu';
export { EmptyState, type EmptyStateProps } from './EmptyState/EmptyState';
export { Field, type FieldCounter, type FieldProps } from './Field/Field';
export { type FieldControlProps, type FieldTone, useFieldContext } from './Field/FieldContext';
export { Input, type InputProps } from './Field/Input';
export { Textarea, type TextareaProps } from './Field/Textarea';
export {
  IconButton,
  IconButtonLink,
  type IconButtonLinkProps,
  type IconButtonProps,
  type IconButtonSize,
  type IconButtonVariant,
} from './IconButton/IconButton';
export * from './icons';
export {
  RadioCardGroup,
  type RadioCardGroupProps,
  type RadioCardOption,
} from './RadioCardGroup/RadioCardGroup';
export {
  SegmentedControl,
  type SegmentedControlProps,
  type SegmentedOption,
} from './SegmentedControl/SegmentedControl';
export { Select, type SelectProps } from './Select/Select';
export { Skeleton, type SkeletonProps } from './Skeleton/Skeleton';
export { Spinner, type SpinnerProps } from './Spinner/Spinner';
export { Switch, type SwitchProps } from './Switch/Switch';
export { TabsNav, type TabsNavItem, type TabsNavProps } from './TabsNav/TabsNav';
export {
  type ToastAction,
  type ToastApi,
  type ToastOptions,
  ToastProvider,
  type ToastProviderProps,
  type ToastTone,
  useToast,
} from './Toast/Toast';
export { Tooltip, type TooltipProps } from './Tooltip/Tooltip';
export { VisuallyHidden, type VisuallyHiddenProps } from './VisuallyHidden/VisuallyHidden';
