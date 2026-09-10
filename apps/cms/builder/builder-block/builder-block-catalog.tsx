'use client';

import type { BuilderPreviewNode, ComponentBuilderPreview } from '@payload/contracts';
import { createPortal } from 'react-dom';
import {
  useEffect,
  useId,
  useRef,
  useState,
  type MouseEvent,
  type ReactElement,
} from 'react';

type BuilderBlockPreviewProps = {
  label: string;
  description?: string;
  preview: ComponentBuilderPreview;
};

type BuilderBlockCardProps = BuilderBlockPreviewProps & {
  category: string;
  dataBlockType: string | undefined;
  dragLabel: string;
  addLabel: string;
  onAdd: () => void;
  onDragStart: ((event: MouseEvent<HTMLButtonElement>) => void) | undefined;
  secondaryActions?: readonly { label: string; onClick: () => void }[] | undefined;
};

function PreviewNode({ node }: { node: BuilderPreviewNode }): ReactElement {
  const className = `builder-preview-node builder-preview-node-${node.kind}`;
  const children = 'children' in node ? node.children : undefined;
  const renderChildren = children?.map((child, index) => (
    <PreviewNode key={`${child.kind}-${index}`} node={child} />
  ));

  switch (node.kind) {
    case 'row':
      return (
        <span
          className={className}
          data-preview-node-kind={node.kind}
          style={
            node.ratios
              ? {
                  gridTemplateColumns: node.ratios.map((ratio) => `${ratio}fr`).join(' '),
                }
              : undefined
          }
        >
          {renderChildren}
        </span>
      );
    case 'column':
      return (
        <span
          className={`${className}${node.align ? ` is-align-${node.align}` : ''}${node.gap ? ` is-gap-${node.gap}` : ''}`}
          data-preview-node-kind={node.kind}
        >
          {children && children.length > 0 ? (
            renderChildren
          ) : (
            <>
              <span className="builder-preview-stack-placeholder" />
              <span className="builder-preview-stack-placeholder" />
              <span className="builder-preview-stack-placeholder" />
            </>
          )}
        </span>
      );
    case 'box':
      return (
        <span
          className={`${className}${node.tone ? ` is-tone-${node.tone}` : ''}${node.align ? ` is-align-${node.align}` : ''}`}
          data-preview-node-kind={node.kind}
          data-preview-node-role={node.role}
        >
          {renderChildren ?? <span className="builder-preview-box-empty" />}
        </span>
      );
    case 'text':
      return (
        <span
          className={`${className} is-size-${node.size ?? 'md'}`}
          data-preview-node-kind={node.kind}
        >
          {Array.from({ length: node.lines ?? 1 }, (_, index) => (
            <span
              className={`builder-preview-text-line${index === (node.lines ?? 1) - 1 ? ' is-short' : ''}`}
              key={index}
            />
          ))}
        </span>
      );
    case 'button':
      return (
        <span className={className} data-preview-node-kind={node.kind}>
          <span className="builder-preview-button-label" />
        </span>
      );
    case 'image':
      return (
        <span className={className} data-preview-node-kind={node.kind}>
          <span className="builder-preview-image-mark" />
        </span>
      );
    case 'divider':
      return <span className={className} data-preview-node-kind={node.kind} />;
    case 'navigation':
      return (
        <span className={className} data-preview-node-kind={node.kind}>
          {Array.from({ length: node.itemCount ?? 3 }, (_, index) => (
            <span className="builder-preview-navigation-item" key={index} />
          ))}
        </span>
      );
    case 'brand':
      return (
        <span className={className} data-preview-node-kind={node.kind}>
          <span className="builder-preview-brand-mark" />
          <span className="builder-preview-brand-line" />
        </span>
      );
    case 'link':
      return (
        <span className={className} data-preview-node-kind={node.kind}>
          <span className="builder-preview-link-line" />
        </span>
      );
    case 'list':
      return (
        <span className={className} data-preview-node-kind={node.kind}>
          {Array.from({ length: node.itemCount ?? 3 }, (_, index) => (
            <span className="builder-preview-list-item" key={index} />
          ))}
        </span>
      );
    case 'quote':
      return (
        <span className={className} data-preview-node-kind={node.kind}>
          <span className="builder-preview-quote-mark">“</span>
          <span className="builder-preview-quote-lines" />
        </span>
      );
    case 'video':
      return (
        <span className={className} data-preview-node-kind={node.kind}>
          <span className="builder-preview-video-play">▶</span>
        </span>
      );
    case 'form':
      return (
        <span className={className} data-preview-node-kind={node.kind}>
          <span className="builder-preview-form-field" />
          <span className="builder-preview-form-field" />
          <span className="builder-preview-form-submit" />
        </span>
      );
    case 'countdown':
      return (
        <span className={className} data-preview-node-kind={node.kind}>
          <span>00</span>
          <span>:</span>
          <span>00</span>
          <span>:</span>
          <span>00</span>
        </span>
      );
    case 'accordion':
      return (
        <span className={className} data-preview-node-kind={node.kind}>
          {Array.from({ length: node.itemCount ?? 2 }, (_, index) => (
            <span className="builder-preview-accordion-item" key={index}>
              <span className="builder-preview-accordion-label" />
              {index === 0 ? <span className="builder-preview-accordion-panel" /> : null}
            </span>
          ))}
        </span>
      );
    case 'tabs':
      return (
        <span className={className} data-preview-node-kind={node.kind}>
          <span className="builder-preview-tab-bar">
            {Array.from({ length: node.tabCount ?? 2 }, (_, index) => (
              <span className={index === 0 ? 'is-active' : undefined} key={index} />
            ))}
          </span>
          <span className="builder-preview-tab-panel" />
        </span>
      );
    case 'gallery':
      return (
        <span
          className={className}
          data-preview-node-kind={node.kind}
          style={{ gridTemplateColumns: `repeat(${node.columns ?? 3}, minmax(0, 1fr))` }}
        >
          {Array.from({ length: (node.columns ?? 3) * 2 }, (_, index) => (
            <span className="builder-preview-gallery-image" key={index} />
          ))}
        </span>
      );
  }

  return <span className={className} />;
}

function previewFingerprint(preview: ComponentBuilderPreview): string {
  return JSON.stringify({ variant: preview.variant, tree: preview.tree });
}

export function BuilderBlockPreview({
  label,
  preview,
}: BuilderBlockPreviewProps): ReactElement {
  return (
    <div
      aria-label={`${label} preview`}
      className="builder-block-preview builder-block-preview-composition"
      data-preview-fingerprint={previewFingerprint(preview)}
      data-preview-kind={preview.kind}
      data-preview-variant={preview.variant}
      role="img"
    >
      <span className="builder-block-preview-stage">
        <PreviewNode node={preview.tree} />
      </span>
    </div>
  );
}

export function BuilderBlockCard({
  label,
  description,
  preview,
  category,
  dataBlockType,
  dragLabel,
  addLabel,
  onAdd,
  onDragStart,
  secondaryActions,
}: BuilderBlockCardProps): ReactElement {
  const cardRef = useRef<HTMLDivElement>(null);
  const tooltipId = `builder-block-tooltip-${useId().replace(/:/g, '')}`;
  const [tooltipVisible, setTooltipVisible] = useState(false);
  const [tooltipPosition, setTooltipPosition] = useState({ left: 0, top: 0 });

  const updateTooltipPosition = () => {
    const rect = cardRef.current?.getBoundingClientRect();
    if (!rect) return;
    setTooltipPosition({ left: rect.left + rect.width / 2, top: rect.top - 8 });
  };

  useEffect(() => {
    if (!tooltipVisible) return;
    updateTooltipPosition();
    const handleViewportChange = () => updateTooltipPosition();
    window.addEventListener('resize', handleViewportChange);
    window.addEventListener('scroll', handleViewportChange, true);
    return () => {
      window.removeEventListener('resize', handleViewportChange);
      window.removeEventListener('scroll', handleViewportChange, true);
    };
  }, [tooltipVisible]);

  const tooltip =
    tooltipVisible && typeof document !== 'undefined'
      ? createPortal(
          <span
            className="builder-block-card-tooltip"
            id={tooltipId}
            role="tooltip"
            style={{ left: tooltipPosition.left, top: tooltipPosition.top }}
          >
            {label}
          </span>,
          document.body,
        )
      : null;

  return (
    <div
      className="builder-block-row builder-block-card"
      data-block-category={category}
      data-block-label={label}
      data-block-type={dataBlockType}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
          setTooltipVisible(false);
        }
      }}
      onFocusCapture={() => {
        updateTooltipPosition();
        setTooltipVisible(true);
      }}
      onMouseEnter={() => {
        updateTooltipPosition();
        setTooltipVisible(true);
      }}
      onMouseLeave={() => setTooltipVisible(false)}
      ref={cardRef}
    >
      <BuilderBlockPreview label={label} preview={preview} />
      <div className="builder-block-card-content">
        <div className="builder-block-card-heading">
          <strong title={label}>{label}</strong>
          <span>{category}</span>
        </div>
        <p title={description ?? 'Add this block to the canvas.'}>
          {description ?? 'Add this block to the canvas.'}
        </p>
        <button
          aria-describedby={tooltipVisible ? tooltipId : undefined}
          aria-label={dragLabel}
          className="builder-block-drag"
          onClick={onAdd}
          onMouseDown={onDragStart}
          type="button"
        >
          <span aria-hidden="true">⠿</span>
          <span>Drag to canvas</span>
        </button>
        {secondaryActions?.length ? (
          <div className="builder-block-secondary-actions">
            {secondaryActions.map((action) => (
              <button
                className="button button-small button-ghost builder-block-secondary-action"
                key={action.label}
                onClick={action.onClick}
                type="button"
              >
                {action.label}
              </button>
            ))}
          </div>
        ) : null}
      </div>
      <button
        aria-describedby={tooltipVisible ? tooltipId : undefined}
        aria-label={addLabel}
        className="builder-block-add"
        onClick={onAdd}
        type="button"
      >
        ＋
      </button>
      {tooltip}
    </div>
  );
}
