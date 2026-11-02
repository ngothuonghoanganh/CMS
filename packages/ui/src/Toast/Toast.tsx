'use client';

import { Toast as RadixToast } from 'radix-ui';
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
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
import { VisuallyHidden } from '../VisuallyHidden/VisuallyHidden';
import { type ToastPlacement, toastPlacement } from './placement';
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

/** Text that ends a sentence, maybe inside closing quotes or brackets: "Đã gửi.", "“Ưu đãi!”". */
const SENTENCE_END = /[.!?…:;]["'”’»)\]]*\s*$/u;

/**
 * What separates two parts of a toast when it is announced. Radix reads the title, description and
 * action's text as one run, so without it "…răng”" runs into "Lead đã…". The separator is for
 * assistive technology only; text that already ends a sentence needs just a space.
 */
function sentenceBreak(previous: ReactNode): string {
  return typeof previous === 'string' && SENTENCE_END.test(previous) ? ' ' : '. ';
}

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

/**
 * Holds the toasts and renders their region ("Thông báo") at the bottom right, or at the top
 * right while the control in focus is under the bottom corner: a toast never hides it (WCAG
 * 2.4.11). The corner is chosen again whenever focus moves or leaves, the stack changes size (a
 * second toast), or the page scrolls or resizes, since each can bring the stack over the control.
 * With no control in focus there is nothing to keep in sight: the usual corner.
 */
export function ToastProvider({ children }: ToastProviderProps) {
  const [toasts, setToasts] = useState<readonly ToastRecord[]>([]);
  const [placement, setPlacement] = useState<ToastPlacement>('bottom');
  const lastId = useRef(0);
  const viewportRef = useRef<HTMLOListElement>(null);
  const showing = toasts.length > 0;

  useEffect(() => {
    if (!showing) {
      // The next toast starts from the usual corner.
      const reset = requestAnimationFrame(() => {
        setPlacement('bottom');
      });
      return () => {
        cancelAnimationFrame(reset);
      };
    }
    let frame = 0;
    function place() {
      // After the browser has scrolled the newly focused control into view.
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const stack = viewportRef.current;
        const focused = document.activeElement;
        // Focus inside the stack stays where it is: moving the stack would move it from under the
        // pointer or the user's eyes.
        if (stack === null || (focused !== null && stack.contains(focused))) {
          return;
        }
        // Focus fell to the page (the control was removed, or a click on no control blurred it).
        if (focused === null || focused === document.body || focused === document.documentElement) {
          setPlacement('bottom');
          return;
        }
        setPlacement(
          toastPlacement(
            focused.getBoundingClientRect(),
            stack.getBoundingClientRect(),
            window.innerHeight,
          ),
        );
      });
    }
    place();
    document.addEventListener('focusin', place);
    // Focus leaving for no control fires no focusin. Chromium fires focusout when the focused
    // control is removed too; Firefox and Safari fire nothing, and the next move places the stack.
    document.addEventListener('focusout', place);
    // Capture: scrolling any container, not only the page, moves the control.
    window.addEventListener('scroll', place, { capture: true, passive: true });
    window.addEventListener('resize', place);
    const stack = viewportRef.current;
    const resized = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(place);
    if (stack !== null) {
      resized?.observe(stack);
    }
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener('focusin', place);
      document.removeEventListener('focusout', place);
      window.removeEventListener('scroll', place, { capture: true });
      window.removeEventListener('resize', place);
      resized?.disconnect();
    };
  }, [showing]);

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
                  <>
                    <VisuallyHidden>{sentenceBreak(item.title)}</VisuallyHidden>
                    <RadixToast.Description className={styles.description}>
                      {item.description}
                    </RadixToast.Description>
                  </>
                ) : null}
                {item.action ? (
                  // The action's text is announced next.
                  <VisuallyHidden>
                    {sentenceBreak(hasDescription ? item.description : item.title)}
                  </VisuallyHidden>
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
        <RadixToast.Viewport
          ref={viewportRef}
          label="Thông báo"
          className={styles.viewport}
          data-placement={placement}
        />
      </RadixToast.Provider>
    </ToastContext.Provider>
  );
}
