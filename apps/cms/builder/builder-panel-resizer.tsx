'use client';

import {
  useRef,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactElement,
} from 'react';

import { clampPanelWidth, type BuilderPanelSide } from './builder-panel-size';

type BuilderPanelResizerProps = {
  side: BuilderPanelSide;
  value: number;
  otherPanelWidth: number;
  viewportWidth: number;
  onChange: (width: number) => void;
  onResizeStart: () => void;
  onResizeEnd: () => void;
};

const KEYBOARD_STEP = 16;
const KEYBOARD_LARGE_STEP = 48;

export function BuilderPanelResizer({
  side,
  value,
  otherPanelWidth,
  viewportWidth,
  onChange,
  onResizeStart,
  onResizeEnd,
}: BuilderPanelResizerProps): ReactElement {
  const resizingRef = useRef(false);

  const finishPointerResize = () => {
    if (!resizingRef.current) return;
    resizingRef.current = false;
    window.removeEventListener('pointermove', handlePointerMove, true);
    window.removeEventListener('pointerup', finishPointerResize, true);
    window.removeEventListener('pointercancel', finishPointerResize, true);
    onResizeEnd();
  };

  const handlePointerMove = (event: PointerEvent) => {
    if (!resizingRef.current) return;
    const start = startRef.current;
    if (!start) return;
    const delta = side === 'left' ? event.clientX - start.x : start.x - event.clientX;
    onChange(clampPanelWidth(side, start.width + delta, viewportWidth, otherPanelWidth));
  };

  const startRef = useRef<{ x: number; width: number } | null>(null);

  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    startRef.current = { x: event.clientX, width: value };
    resizingRef.current = true;
    onResizeStart();
    window.addEventListener('pointermove', handlePointerMove, true);
    window.addEventListener('pointerup', finishPointerResize, true);
    window.addEventListener('pointercancel', finishPointerResize, true);
  };

  const handleKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    const step = event.shiftKey ? KEYBOARD_LARGE_STEP : KEYBOARD_STEP;
    let direction = 0;
    if (event.key === 'ArrowLeft') direction = side === 'left' ? -1 : 1;
    if (event.key === 'ArrowRight') direction = side === 'left' ? 1 : -1;
    if (!direction) return;
    event.preventDefault();
    onChange(
      clampPanelWidth(side, value + direction * step, viewportWidth, otherPanelWidth),
    );
  };

  return (
    <div
      aria-label={`Resize ${side} builder panel`}
      aria-orientation="vertical"
      aria-valuemax={clampPanelWidth(
        side,
        Number.MAX_SAFE_INTEGER,
        viewportWidth,
        otherPanelWidth,
      )}
      aria-valuemin={clampPanelWidth(side, 0, viewportWidth, otherPanelWidth)}
      aria-valuenow={value}
      className="builder-panel-resizer"
      data-panel-resizer={side}
      onKeyDown={handleKeyDown}
      onPointerDown={handlePointerDown}
      role="separator"
      tabIndex={0}
    />
  );
}
