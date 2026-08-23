'use client';

import type { BuilderNodeType } from './builder-adapter';
import {
  useRef,
  type CSSProperties,
  type KeyboardEvent,
  type MouseEvent,
  type PointerEvent,
} from 'react';

export type BuilderCanvasNode = {
  id: string;
  type: BuilderNodeType;
  label: string;
  parentId?: string;
  depth: number;
  x: number;
  y: number;
  width: number;
  height: number;
};

export type BuilderCanvasState = {
  page: {
    width: number;
    height: number;
  };
  viewport: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  zoom: number;
  nodes: BuilderCanvasNode[];
};

type PageMinimapProps = {
  state: BuilderCanvasState | null;
  selectedId: string | undefined;
  onSelectNode: (id: string) => void;
  onNavigate: (x: number, y: number) => void;
  onZoomChange: (zoom: number) => void;
  onFitPage: () => void;
};

const MIN_ZOOM = 25;
const MAX_ZOOM = 200;
const ZOOM_STEP = 10;

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function percent(value: number, total: number): string {
  return `${(value / Math.max(total, 1)) * 100}%`;
}

function nodeLabel(node: BuilderCanvasNode): string {
  return `${node.label} (${node.id})`;
}

export function PageMinimap({
  state,
  selectedId,
  onSelectNode,
  onNavigate,
  onZoomChange,
  onFitPage,
}: PageMinimapProps) {
  const surfaceRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{
    pointerId: number;
    offsetX: number;
    offsetY: number;
  } | null>(null);

  if (!state) {
    return (
      <aside aria-label="Page minimap" className="builder-minimap">
        <div className="builder-minimap-heading">
          <span className="eyebrow">Navigator</span>
          <strong>Minimap</strong>
        </div>
        <p className="muted small">Building page map…</p>
      </aside>
    );
  }

  const pageWidth = Math.max(state.page.width, 1);
  const pageHeight = Math.max(state.page.height, 1);
  const viewportWidth = clamp(state.viewport.width, 0, pageWidth);
  const viewportHeight = clamp(state.viewport.height, 0, pageHeight);
  const viewportX = clamp(state.viewport.x, 0, Math.max(pageWidth - viewportWidth, 0));
  const viewportY = clamp(state.viewport.y, 0, Math.max(pageHeight - viewportHeight, 0));
  const minimapHeight = Math.max(
    260,
    Math.min(520, Math.round((180 * pageHeight) / pageWidth)),
  );

  function pagePoint(event: PointerEvent<HTMLDivElement> | MouseEvent<HTMLDivElement>) {
    const surface = surfaceRef.current;
    if (!surface) return null;
    const rect = surface.getBoundingClientRect();
    return {
      x: clamp(
        ((event.clientX - rect.left) / Math.max(rect.width, 1)) * pageWidth,
        0,
        pageWidth,
      ),
      y: clamp(
        ((event.clientY - rect.top) / Math.max(rect.height, 1)) * pageHeight,
        0,
        pageHeight,
      ),
    };
  }

  function handleSurfaceClick(event: MouseEvent<HTMLDivElement>) {
    const target = event.target as Element;
    if (target.closest('.builder-minimap-node, .builder-minimap-viewport')) return;
    const point = pagePoint(event);
    if (!point) return;
    onNavigate(point.x - viewportWidth / 2, point.y - viewportHeight / 2);
  }

  function handleViewportPointerDown(event: PointerEvent<HTMLButtonElement>) {
    const point = pagePoint(event as unknown as PointerEvent<HTMLDivElement>);
    if (!point) return;
    dragRef.current = {
      pointerId: event.pointerId,
      offsetX: point.x - viewportX,
      offsetY: point.y - viewportY,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
    event.preventDefault();
    event.stopPropagation();
  }

  function handleViewportPointerMove(event: PointerEvent<HTMLButtonElement>) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const point = pagePoint(event as unknown as PointerEvent<HTMLDivElement>);
    if (!point) return;
    onNavigate(point.x - drag.offsetX, point.y - drag.offsetY);
  }

  function stopViewportDrag(event: PointerEvent<HTMLButtonElement>) {
    if (dragRef.current?.pointerId === event.pointerId) {
      dragRef.current = null;
    }
  }

  function handleViewportKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    const distance = Math.max(viewportHeight * 0.2, 24);
    if (event.key === 'ArrowUp') onNavigate(viewportX, viewportY - distance);
    if (event.key === 'ArrowDown') onNavigate(viewportX, viewportY + distance);
    if (event.key === 'ArrowLeft') onNavigate(viewportX - distance, viewportY);
    if (event.key === 'ArrowRight') onNavigate(viewportX + distance, viewportY);
    if (event.key.startsWith('Arrow')) event.preventDefault();
  }

  const viewportStyle: CSSProperties = {
    left: percent(viewportX, pageWidth),
    top: percent(viewportY, pageHeight),
    width: percent(viewportWidth, pageWidth),
    height: percent(viewportHeight, pageHeight),
  };

  return (
    <aside aria-label="Page minimap" className="builder-minimap">
      <div className="builder-minimap-heading">
        <div>
          <span className="eyebrow">Navigator</span>
          <strong>Minimap</strong>
        </div>
        <span className="builder-minimap-zoom-label">{Math.round(state.zoom)}%</span>
      </div>
      <div
        aria-label="Page minimap surface"
        className="builder-minimap-surface"
        onClick={handleSurfaceClick}
        ref={surfaceRef}
        style={{ height: minimapHeight }}
      >
        <div className="builder-minimap-page">
          {state.nodes.map((node) => {
            const style: CSSProperties = {
              left: percent(node.x, pageWidth),
              top: percent(node.y, pageHeight),
              width: percent(Math.max(node.width, 2), pageWidth),
              height: percent(Math.max(node.height, 2), pageHeight),
              zIndex: node.id === selectedId ? 100 : node.depth + 1,
            };
            return (
              <button
                aria-label={`Select ${nodeLabel(node)}`}
                className={`builder-minimap-node builder-minimap-node-${node.type}${
                  node.id === selectedId ? ' selected' : ''
                }`}
                key={node.id}
                onClick={(event) => {
                  event.stopPropagation();
                  onSelectNode(node.id);
                }}
                style={style}
                title={nodeLabel(node)}
                type="button"
              />
            );
          })}
          <button
            aria-label="Current canvas viewport; drag to navigate"
            className="builder-minimap-viewport"
            onKeyDown={handleViewportKeyDown}
            onPointerCancel={stopViewportDrag}
            onPointerDown={handleViewportPointerDown}
            onPointerMove={handleViewportPointerMove}
            onPointerUp={stopViewportDrag}
            style={viewportStyle}
            type="button"
          />
        </div>
      </div>
      <div className="builder-minimap-controls">
        <button
          aria-label="Zoom out canvas"
          className="button button-small button-ghost"
          disabled={state.zoom <= MIN_ZOOM}
          onClick={() => onZoomChange(clamp(state.zoom - ZOOM_STEP, MIN_ZOOM, MAX_ZOOM))}
          type="button"
        >
          −
        </button>
        <button
          aria-label="Fit page in canvas"
          className="button button-small button-ghost"
          onClick={onFitPage}
          type="button"
        >
          Fit
        </button>
        <button
          aria-label="Zoom in canvas"
          className="button button-small button-ghost"
          disabled={state.zoom >= MAX_ZOOM}
          onClick={() => onZoomChange(clamp(state.zoom + ZOOM_STEP, MIN_ZOOM, MAX_ZOOM))}
          type="button"
        >
          +
        </button>
      </div>
    </aside>
  );
}
