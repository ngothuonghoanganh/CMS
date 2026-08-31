'use client';

import type { ComponentBuilderPreview } from '@payload/contracts';
import type { MouseEvent, ReactElement } from 'react';

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
};

function previewVariantClass(variant: string): string {
  return variant.replace(/[^A-Za-z0-9_-]/g, '-');
}

/** Registry metadata drives this lightweight, local-only visual preview. */
export function BuilderBlockPreview({
  label,
  preview,
}: BuilderBlockPreviewProps): ReactElement {
  const variant = previewVariantClass(preview.variant);
  return (
    <div
      aria-label={`${label} preview`}
      className={`builder-block-preview builder-block-preview-${preview.kind} builder-block-preview-${variant}`}
      data-preview-kind={preview.kind}
      data-preview-variant={preview.variant}
      role="img"
    >
      <span className="builder-block-preview-bar" />
      <span className="builder-block-preview-line" />
      <span className="builder-block-preview-line is-short" />
      <span className="builder-block-preview-control" />
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
}: BuilderBlockCardProps): ReactElement {
  return (
    <div
      className="builder-block-row builder-block-card"
      data-block-category={category}
      data-block-type={dataBlockType}
    >
      <BuilderBlockPreview label={label} preview={preview} />
      <div className="builder-block-card-content">
        <div className="builder-block-card-heading">
          <strong>{label}</strong>
          <span>{category}</span>
        </div>
        <p title={description ?? 'Add this block to the canvas.'}>
          {description ?? 'Add this block to the canvas.'}
        </p>
        <button
          aria-label={dragLabel}
          className="builder-block-drag"
          onClick={onAdd}
          onMouseDown={onDragStart}
          type="button"
        >
          <span aria-hidden="true">⠿</span>
          <span>Drag to canvas</span>
        </button>
      </div>
      <button
        aria-label={addLabel}
        className="builder-block-add"
        onClick={onAdd}
        type="button"
      >
        ＋
      </button>
    </div>
  );
}
