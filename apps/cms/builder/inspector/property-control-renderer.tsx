'use client';

import {
  isSafePageHref,
  isSafePageImageSource,
  isSafePageStyleValue,
  isSafePageVideoSource,
  isComponentPropertyRequired,
  normalizePageHref,
  type Asset,
  type ComponentPropertyDefinition,
  type Page,
} from '@payload/contracts';
import {
  useEffect,
  useRef,
  useState,
  type FocusEvent as ReactFocusEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from 'react';
import {
  ColorField,
  DateTimeField,
  FieldLabel,
  LayoutField,
  LinkField,
  NumberField,
  SegmentedControl,
  SelectField,
  SpacingControl,
  TextAreaField,
  TextField,
  UnitField,
  type SegmentedOption,
} from '../../app/ui/fields';
import { normalizeHexColor, parseCssDimension } from '../../app/ui/field-utils';
import { AssetPicker } from '../../app/collections/collection-field-controls';
import type { BuilderViewport } from '../builder-adapter';
import {
  createBuilderValidationIssue,
  validationDomId,
  validationIssueTargetId,
  type BuilderValidationIssue,
  type BuilderValidationScope,
  type BuilderValidationTab,
} from '../builder-validation';

export type PropertyControlRendererProps = {
  definition: ComponentPropertyDefinition;
  value: unknown;
  propertyValues?: Readonly<Record<string, unknown>>;
  description?: string | undefined;
  assets?: readonly Asset[];
  navigationPages?: readonly Pick<Page, 'id' | 'name' | 'path' | 'anchors'>[];
  layoutDirection?: string | undefined;
  layoutSupportsDirection?: boolean | undefined;
  workspaceId?: string;
  assetKind?: 'image' | 'video' | undefined;
  onChange: (value: unknown) => void;
  onReset?: (() => void) | undefined;
  nodeId?: string | undefined;
  scope?: BuilderValidationScope | undefined;
  tab?: BuilderValidationTab | undefined;
  section?: string | undefined;
  partName?: string | undefined;
  viewport?: BuilderViewport | undefined;
  issue?: BuilderValidationIssue | undefined;
  onValidationIssue?:
    ((issue: BuilderValidationIssue | null, issueId?: string) => void) | undefined;
};

function textValue(value: unknown): string {
  return typeof value === 'string' ? value : value == null ? '' : String(value);
}

function isEntityId(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
  );
}

function draftValidation(
  definition: ComponentPropertyDefinition,
  raw: string,
  assetKind?: 'image' | 'video',
  propertyValues: Readonly<Record<string, unknown>> = {},
): { code: string; message: string } | null {
  const value = raw.trim();
  if (definition.control === 'url' || definition.control === 'link') {
    const normalized = normalizePageHref(value);
    if (value && !isSafePageHref(normalized)) {
      return { code: 'BUTTON_URL_INVALID', message: 'Enter a valid, safe URL.' };
    }
  }
  if (assetKind === 'image' && value && !isSafePageImageSource(value)) {
    return {
      code: 'IMAGE_SOURCE_INVALID',
      message: 'Use an https URL or a workspace asset.',
    };
  }
  if (assetKind === 'video' && value && !isSafePageVideoSource(value)) {
    return {
      code: 'VIDEO_SOURCE_INVALID',
      message: 'Use an https URL or a workspace asset.',
    };
  }
  if (isComponentPropertyRequired(definition, propertyValues) && !value) {
    return {
      code: 'FIELD_REQUIRED',
      message: `Enter ${definition.label.toLowerCase()}.`,
    };
  }
  if (definition.control === 'number' && value) {
    const number = Number(value);
    if (!Number.isFinite(number)) {
      return {
        code: definition.key === 'opacity' ? 'STYLE_OPACITY_INVALID' : 'NUMBER_INVALID',
        message:
          definition.key === 'opacity'
            ? 'Opacity must be between 0 and 1.'
            : `${definition.label} is outside the allowed range.`,
      };
    }
  }
  if (
    definition.constraints?.minLength !== undefined &&
    value.length < definition.constraints.minLength
  ) {
    return { code: 'FIELD_TOO_SHORT', message: `${definition.label} is too short.` };
  }
  if (
    definition.constraints?.maxLength !== undefined &&
    value.length > definition.constraints.maxLength
  ) {
    return { code: 'FIELD_TOO_LONG', message: `${definition.label} is too long.` };
  }
  if (definition.constraints?.pattern && value) {
    let pattern: RegExp;
    try {
      pattern = new RegExp(definition.constraints.pattern);
    } catch {
      pattern = /.^/;
    }
    if (!pattern.test(value)) {
      return {
        code: 'FIELD_FORMAT_INVALID',
        message: `Check the ${definition.label.toLowerCase()}.`,
      };
    }
  }
  if (definition.control === 'color' && value && !normalizeHexColor(value)) {
    return { code: 'COLOR_INVALID', message: 'Enter a six-digit hex color.' };
  }
  if (definition.control === 'unit' && value && parseCssDimension(value).unsupported) {
    return { code: 'UNIT_INVALID', message: 'Enter a valid CSS dimension.' };
  }
  if (definition.group === 'style' && value && !isSafePageStyleValue(value)) {
    return { code: 'STYLE_UNSAFE_CSS', message: 'Use a safe CSS value.' };
  }
  return null;
}

function normalizedPropertyValue(
  definition: ComponentPropertyDefinition,
  raw: string,
): string | number | undefined {
  const normalizations = definition.normalization
    ? Array.isArray(definition.normalization)
      ? definition.normalization
      : [definition.normalization]
    : [];
  let value = raw;
  if (normalizations.includes('trim') || normalizations.includes('url')) {
    value = value.trim();
  }
  if (normalizations.includes('url')) value = normalizePageHref(value);
  if (normalizations.includes('hex-color')) value = normalizeHexColor(value) ?? value;
  if (normalizations.includes('empty-to-undefined') && value === '') return undefined;
  if (definition.control === 'number') {
    const number = Number(value);
    return Number.isFinite(number)
      ? Math.min(definition.max ?? number, Math.max(definition.min ?? number, number))
      : value;
  }
  return value;
}

function BuilderValidationField({
  children,
  definition,
  issue,
  nodeId,
  partName,
  scope,
  section,
  tab,
  viewport,
}: {
  children: ReactNode;
  definition: ComponentPropertyDefinition;
  issue?: BuilderValidationIssue | undefined;
  nodeId?: string | undefined;
  partName?: string | undefined;
  scope?: BuilderValidationScope | undefined;
  section?: string | undefined;
  tab?: BuilderValidationTab | undefined;
  viewport?: BuilderViewport | undefined;
}) {
  const fieldRef = useRef<HTMLDivElement>(null);
  const errorId = issue ? validationDomId(issue.id) : undefined;

  useEffect(() => {
    const controls = fieldRef.current?.querySelectorAll<HTMLElement>(
      'input, textarea, select, button',
    );
    controls?.forEach((control) => {
      if (issue) {
        control.setAttribute('aria-invalid', 'true');
        if (errorId) control.setAttribute('aria-describedby', errorId);
      } else {
        control.removeAttribute('aria-invalid');
        if (errorId) control.removeAttribute('aria-describedby');
      }
    });
    return () => {
      controls?.forEach((control) => {
        control.removeAttribute('aria-invalid');
        if (errorId) control.removeAttribute('aria-describedby');
      });
    };
  }, [errorId, issue]);

  return (
    <div
      className={`builder-validation-field${issue ? ' builder-validation-field-invalid' : ''}`}
      data-builder-field={definition.key}
      data-builder-node-id={nodeId}
      data-builder-part-name={partName}
      data-builder-scope={scope}
      data-builder-section={section}
      data-builder-tab={tab}
      data-builder-viewport={viewport}
      ref={fieldRef}
    >
      {children}
      {issue ? (
        <p className="builder-validation-field-message" id={errorId} role="alert">
          {issue.message}
        </p>
      ) : null}
    </div>
  );
}

function FieldShell({
  children,
  onReset,
  label,
}: {
  children: ReactNode;
  onReset?: (() => void) | undefined;
  label: string;
}) {
  return (
    <div className="builder-inspector-field-stack">
      {children}
      {onReset ? (
        <button
          aria-label={`Reset ${label} override`}
          className="button button-small button-ghost builder-reset-override"
          onClick={onReset}
          type="button"
        >
          Reset override
        </button>
      ) : null}
    </div>
  );
}

export function PropertyControlRenderer({
  definition,
  value,
  propertyValues = {},
  description,
  assets = [],
  navigationPages = [],
  layoutDirection,
  layoutSupportsDirection = true,
  workspaceId,
  assetKind,
  onChange,
  onReset,
  nodeId,
  scope,
  tab,
  section,
  partName,
  viewport,
  issue,
  onValidationIssue,
}: PropertyControlRendererProps) {
  const string = textValue(value === undefined ? definition.defaultValue : value);
  const [draft, setDraft] = useState<string | undefined>(undefined);
  const issueContext = {
    scope: scope ?? 'page',
    ...(nodeId ? { nodeId } : {}),
    ...(tab ? { tab } : {}),
    ...(section ? { section } : {}),
    ...(definition.key ? { field: definition.key } : {}),
    ...(partName ? { partName } : {}),
    ...(viewport ? { viewport } : {}),
  } as const;
  const issueId = validationIssueTargetId(issueContext);

  useEffect(() => setDraft(undefined), [definition.key, nodeId, partName, string]);

  function issueFor(raw: string): BuilderValidationIssue | null {
    const result = draftValidation(definition, raw, assetKind, propertyValues);
    return result
      ? createBuilderValidationIssue({
          ...issueContext,
          code: result.code,
          message: result.message,
          id: issueId,
        })
      : null;
  }

  function reportDraft(raw: string): boolean {
    const nextIssue = issueFor(raw);
    if (nextIssue || issue) onValidationIssue?.(nextIssue, issueId);
    return nextIssue === null;
  }

  function commitDraft(raw: string): void {
    setDraft(raw);
    if (!reportDraft(raw)) return;
    onChange(normalizedPropertyValue(definition, raw));
    setDraft(undefined);
  }

  function cancelDraft(): void {
    setDraft(undefined);
    onValidationIssue?.(null, issueId);
  }

  function draftHandlers() {
    return {
      onBlur: (event: ReactFocusEvent<HTMLInputElement | HTMLTextAreaElement>) =>
        commitDraft(event.currentTarget.value),
      onKeyDown: (event: ReactKeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        if (event.key === 'Enter' && !event.shiftKey) {
          event.preventDefault();
          const nextValue = event.currentTarget.value;
          window.setTimeout(() => commitDraft(nextValue), 0);
        }
        if (event.key === 'Escape') {
          event.preventDefault();
          cancelDraft();
        }
      },
    };
  }

  function wrap(children: ReactNode) {
    return (
      <BuilderValidationField
        definition={definition}
        issue={issue}
        nodeId={nodeId}
        partName={partName}
        scope={scope}
        section={section}
        tab={tab}
        viewport={viewport}
      >
        {children}
      </BuilderValidationField>
    );
  }

  const common = {
    compact: true,
    description:
      description ??
      definition.help?.text ??
      (definition.help?.example ? `Example: ${definition.help.example}` : undefined),
    label: definition.label,
    recommended: definition.recommended,
    required: isComponentPropertyRequired(definition, propertyValues),
  } as const;
  const required = common.required;

  if (definition.control === 'custom') return null;
  if (definition.control === 'layout') {
    return wrap(
      <LayoutField
        {...common}
        direction={layoutDirection}
        onValueChange={onChange}
        supportsDirection={layoutSupportsDirection}
        value={string}
      />,
    );
  }
  if (definition.control === 'textarea') {
    const constrained = definition.group === 'style';
    const supportsEmptyDraft = required;
    const usesDraft = constrained || draft !== undefined;
    return wrap(
      <TextAreaField
        {...common}
        {...(usesDraft ? draftHandlers() : {})}
        onChange={(event) => {
          if (constrained || (supportsEmptyDraft && !event.target.value.trim())) {
            setDraft(event.target.value);
          } else {
            setDraft(undefined);
            if (issue) onValidationIssue?.(null, issueId);
            onChange(event.target.value);
          }
        }}
        placeholder={definition.placeholder}
        rows={5}
        value={usesDraft ? (draft ?? string) : string}
      />,
    );
  }
  if (definition.control === 'link') {
    return wrap(
      <LinkField
        compact
        description={common.description}
        label={definition.label}
        onCommit={(nextValue) => commitDraft(nextValue)}
        onInvalid={(nextValue) => reportDraft(nextValue)}
        pages={navigationPages}
        allowEmpty={definition.allowEmpty}
        recommended={definition.recommended}
        required={required}
        value={draft ?? string}
      />,
    );
  }
  if (definition.control === 'text' || definition.control === 'url') {
    const constrained = definition.control === 'url' || definition.group === 'style';
    const supportsEmptyDraft = required;
    const usesDraft = constrained || draft !== undefined;
    return wrap(
      <TextField
        {...common}
        {...(usesDraft ? draftHandlers() : {})}
        onChange={(event) => {
          if (constrained || (supportsEmptyDraft && !event.target.value.trim())) {
            setDraft(event.target.value);
          } else {
            setDraft(undefined);
            if (issue) onValidationIssue?.(null, issueId);
            onChange(event.target.value);
          }
        }}
        placeholder={definition.placeholder}
        type={definition.control === 'url' ? 'url' : 'text'}
        value={usesDraft ? (draft ?? string) : string}
      />,
    );
  }
  if (definition.control === 'datetime') {
    return wrap(
      <DateTimeField
        {...common}
        onValueChange={(nextValue) => onChange(nextValue)}
        value={string}
      />,
    );
  }
  if (definition.control === 'number') {
    const number = string === '' ? undefined : Number(string);
    return wrap(
      <NumberField
        {...common}
        draftValue={draft}
        max={definition.max}
        min={definition.min}
        onDraftChange={(raw) => {
          setDraft(raw);
        }}
        onDraftCommit={(raw) => {
          if (raw.trim() === '') {
            onValidationIssue?.(null, issueId);
            onChange(undefined);
            setDraft(undefined);
          } else commitDraft(raw);
        }}
        onValueChange={(next) => {
          onValidationIssue?.(null, issueId);
          setDraft(undefined);
          onChange(next);
        }}
        step={definition.step}
        value={number !== undefined && Number.isFinite(number) ? number : undefined}
      />,
    );
  }
  if (definition.control === 'unit') {
    return wrap(
      <UnitField
        {...common}
        allowAuto={definition.allowAuto}
        onDraftChange={(raw) => {
          setDraft(raw);
        }}
        onDraftCommit={(raw) => commitDraft(raw)}
        onValueChange={onChange as (value: string) => void}
        value={string}
      />,
    );
  }
  if (definition.control === 'spacing') {
    return wrap(
      <SpacingControl
        {...common}
        allowAuto={definition.allowAuto}
        onValueChange={onChange as (value: string) => void}
        value={string}
      />,
    );
  }
  if (definition.control === 'color') {
    return wrap(
      <ColorField
        {...common}
        onDraftChange={(raw) => {
          setDraft(raw);
        }}
        onDraftCommit={(raw) => {
          if (raw.trim() === '') {
            onValidationIssue?.(null, issueId);
            onChange('');
            setDraft(undefined);
          } else if (normalizeHexColor(raw)) {
            onValidationIssue?.(null, issueId);
            onChange(normalizedPropertyValue(definition, raw));
            setDraft(undefined);
          } else {
            reportDraft(raw);
          }
        }}
        onValueChange={(next) => {
          onValidationIssue?.(null, issueId);
          setDraft(undefined);
          onChange(next);
        }}
        value={string}
      />,
    );
  }
  if (definition.control === 'segmented') {
    const options = (definition.options ?? []) as readonly SegmentedOption<string>[];
    return wrap(
      <div className="ui-field ui-field-compact">
        <FieldLabel
          label={definition.label}
          recommended={definition.recommended}
          required={required}
        />
        {description ? <p className="ui-field-description">{description}</p> : null}
        <SegmentedControl
          ariaLabel={definition.label}
          onValueChange={onChange}
          options={options}
          value={string}
        />
      </div>,
    );
  }
  if (definition.control === 'toggle') {
    return wrap(
      <label className="checkbox-field">
        <input
          aria-label={definition.label}
          checked={value === true}
          onChange={(event) => onChange(event.target.checked)}
          type="checkbox"
        />
        <FieldLabel
          label={definition.label}
          recommended={definition.recommended}
          required={required}
        />
        {description ? <span className="ui-field-description">{description}</span> : null}
      </label>,
    );
  }
  if (definition.control === 'asset') {
    const available = assets.filter((asset) =>
      assetKind === 'video'
        ? asset.mimeType.toLowerCase().startsWith('video/')
        : asset.mimeType.toLowerCase().startsWith('image/'),
    );
    return wrap(
      <FieldShell label={definition.label} onReset={onReset}>
        {workspaceId ? (
          <AssetPicker
            allowExternalUrl={assetKind === 'image'}
            initialMediaType={assetKind ?? 'all'}
            onAssetSelected={(asset) => onChange(asset.publicUrl ?? asset.storageKey)}
            onChange={(assetId) => {
              const asset = available.find((candidate) => candidate.id === assetId);
              onChange(asset?.publicUrl ?? asset?.storageKey ?? assetId);
            }}
            onRemove={() => {
              if (definition.allowEmpty) {
                setDraft('');
                onValidationIssue?.(null, issueId);
              } else {
                onChange('');
              }
            }}
            value={
              isEntityId(string)
                ? string
                : (available.find(
                    (asset) => (asset.publicUrl ?? asset.storageKey) === string,
                  )?.id ?? '')
            }
            workspaceId={workspaceId}
          />
        ) : (
          <SelectField
            {...common}
            onChange={(event) => onChange(event.target.value)}
            value={string}
          >
            <option value="">Select a workspace asset</option>
            {available.map((asset) => (
              <option key={asset.id} value={asset.publicUrl ?? asset.storageKey}>
                {asset.filename}
              </option>
            ))}
          </SelectField>
        )}
        <TextField
          compact
          description="Or use a direct http(s) URL."
          label={`${definition.label} URL`}
          onChange={(event) => {
            const next = event.target.value;
            setDraft(next);
          }}
          onBlur={(event) => commitDraft(event.currentTarget.value)}
          type="url"
          value={draft ?? string}
        />
      </FieldShell>,
    );
  }
  return wrap(
    <FieldShell label={definition.label} onReset={onReset}>
      <SelectField
        {...common}
        onChange={(event) => onChange(event.target.value)}
        value={string}
      >
        {definition.options?.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </SelectField>
    </FieldShell>,
  );
}
