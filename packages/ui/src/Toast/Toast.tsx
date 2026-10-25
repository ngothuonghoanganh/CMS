'use client';

import { Toast as RadixToast } from 'radix-ui';
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Button } from '../Button/Button';
import { IconButton } from '../IconButton/IconButton';
import {
  AlertCircleIcon,
  CheckCircleIcon,
  CloseIcon,
  InfoCircleIcon,
  WarningTriangleIcon,
} from '../icons';
import { cx } from '../internal/cx';
import { hasContent } from '../internal/hasContent';
import styles from './Toast.module.css';

export type ToastTone = 'neutral' | 'success' | 'warning' | 'danger';

export interface ToastAction {
  /** Visible button text, e.g. "Hoàn tác". */
  label: string;
  onClick: () => void;
  /**
   * How to perform the action without the toast (screen readers hear it when the toast is
   * announced). Defaults to the label.
   */
  altText?: string | undefined;
}

export interface ToastOptions {
  title: ReactNode;
  description?: ReactNode;
  /** Defaults to `neutral`. `danger` toasts interrupt assistive technology. */
  tone?: ToastTone | undefined;
  action?: ToastAction | undefined;
  /** Milliseconds before closing. Defaults to 5 s, or 8 s when there is an action. */
  duration?: number | undefined;
}

export interface ToastApi {
  /** Shows a toast and returns its id. */
  toast: (options: ToastOptions) => number;
  dismiss: (id: number) => void;
}

interface ToastRecord extends ToastOptions {
  id: number;
}

/** Older toasts give way so the stack never covers the page. */
const MAX_VISIBLE = 3;
const DEFAULT_DURATION = 5000;
const ACTION_DURATION = 8000;

const toneIcons: Record<ToastTone, ReactNode> = {
  neutral: <InfoCircleIcon size={18} />,
  success: <CheckCircleIcon size={18} />,
  warning: <WarningTriangleIcon size={18} strokeWidth={2} />,
  danger: <AlertCircleIcon size={18} strokeWidth={2} />,
};

const ToastContext = createContext<ToastApi | null>(null);

/** Short feedback after an action ("Đã sao chép", "Đã lưu cài đặt site"), with an optional undo. */
export function useToast(): ToastApi {
  const api = useContext(ToastContext);
  if (api === null) {
    throw new Error('useToast must be used inside <ToastProvider>; mount it in the admin layout.');
  }
  return api;
}

export interface ToastProviderProps {
  children: ReactNode;
}

/** Holds the toasts and renders their region ("Thông báo") at the bottom right. */
export function ToastProvider({ children }: ToastProviderProps) {
  const [toasts, setToasts] = useState<readonly ToastRecord[]>([]);
  const lastId = useRef(0);

  const dismiss = useCallback((id: number) => {
    setToasts((current) => current.filter((item) => item.id !== id));
  }, []);

  const toast = useCallback((options: ToastOptions) => {
    lastId.current += 1;
    const id = lastId.current;
    setToasts((current) => [...current.slice(-(MAX_VISIBLE - 1)), { ...options, id }]);
    return id;
  }, []);

  const api = useMemo<ToastApi>(() => ({ toast, dismiss }), [toast, dismiss]);

  return (
    <ToastContext.Provider value={api}>
      <RadixToast.Provider label="Thông báo" swipeDirection="right">
        {children}
        {toasts.map((item) => {
          const tone = item.tone ?? 'neutral';
          const hasDescription = hasContent(item.description);
          return (
            <RadixToast.Root
              key={item.id}
              type={tone === 'danger' ? 'foreground' : 'background'}
              duration={item.duration ?? (item.action ? ACTION_DURATION : DEFAULT_DURATION)}
              onOpenChange={(open) => {
                if (!open) {
                  dismiss(item.id);
                }
              }}
              className={cx(styles.toast, styles[tone])}
              data-tone={tone}
            >
              <span className={styles.icon} aria-hidden="true">
                {toneIcons[tone]}
              </span>
              <div className={styles.content}>
                <RadixToast.Title className={styles.title}>{item.title}</RadixToast.Title>
                {hasDescription ? (
                  <RadixToast.Description className={styles.description}>
                    {item.description}
                  </RadixToast.Description>
                ) : null}
              </div>
              {item.action ? (
                <RadixToast.Action altText={item.action.altText ?? item.action.label} asChild>
                  <Button variant="secondary" size="sm" onClick={item.action.onClick}>
                    {item.action.label}
                  </Button>
                </RadixToast.Action>
              ) : null}
              <RadixToast.Close asChild>
                <IconButton aria-label="Đóng" icon={<CloseIcon size={16} />} size="sm" />
              </RadixToast.Close>
            </RadixToast.Root>
          );
        })}
        <RadixToast.Viewport label="Thông báo" className={styles.viewport} />
      </RadixToast.Provider>
    </ToastContext.Provider>
  );
}
