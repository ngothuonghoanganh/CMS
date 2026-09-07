'use client';

import {
  conditionOperatorsForFieldType,
  type Collection,
  type CollectionConditionOperator,
  type CollectionEntryResponse,
  type CollectionFieldType,
} from '@payload/contracts';
import { useEffect, useMemo, useState, type FormEvent } from 'react';

import { ApiClientError, api } from '../lib/api';
import { Drawer, Modal, PageHeader } from '../ui/surfaces';
import { Panel, SearchField } from '../ui/primitives';
import { StatusBadge } from '../status-badge';
import {
  CollectionEntryFields,
  parseStructuredValue,
  serializeStructuredValue,
  updateEntryDraft,
  type EntryDraft,
} from './collection-field-controls';

type FieldDraft = Collection['fields'][number];

function collectionKeyFromName(value: string): string {
  return (
    value
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'content'
  );
}

function singularCollectionName(value: string): string {
  const name = value.trim();
  if (!name) return 'Item';
  return name.endsWith('s') ? name.slice(0, -1) : name;
}

function collectionApiPath(
  workspaceId: string,
  siteId: string,
  collectionId?: string,
  child?: string,
): string {
  const base = siteId
    ? `/workspaces/${workspaceId}/sites/${siteId}/collections`
    : `/workspaces/${workspaceId}/collections`;
  return `${base}${collectionId ? `/${collectionId}` : ''}${child ? `/${child}` : ''}`;
}

const fieldTypes: CollectionFieldType[] = [
  'text',
  'long-text',
  'rich-text',
  'number',
  'boolean',
  'date',
  'datetime',
  'asset',
  'image',
  'url',
  'email',
  'slug',
  'select',
  'multi-select',
  'reference',
  'array',
  'group',
];

const newField = (): FieldDraft => ({
  id: crypto.randomUUID(),
  key: '',
  label: '',
  type: 'text',
  required: false,
  indexed: false,
  unique: false,
  status: 'active',
  manualSlugOverride: true,
});

function entryTitle(entry: CollectionEntryResponse, collection: Collection): string {
  const value = collection.titleFieldKey
    ? entry.values[collection.titleFieldKey]
    : undefined;
  return value === undefined || value === null || String(value).trim() === ''
    ? entry.id.slice(0, 8)
    : String(value);
}

function entryPreviewValue(value: unknown): string {
  if (Array.isArray(value)) return value.map(String).join(', ');
  if (value && typeof value === 'object') return 'Structured value';
  return String(value ?? '—');
}

function defaultFieldValue(value: unknown): string {
  if (value === undefined || value === null) return '';
  if (Array.isArray(value)) return value.map(String).join(', ');
  if (typeof value === 'object') return JSON.stringify(value, null, 2);
  return String(value);
}

function structuredDrafts(
  collection: Collection | undefined,
  values: EntryDraft,
): Record<string, string> {
  if (!collection) return {};
  return Object.fromEntries(
    collection.fields
      .filter((field) => field.type === 'array' || field.type === 'group')
      .map((field) => [field.key, serializeStructuredValue(values[field.key])]),
  );
}

function sampleEntryValues(collection: Collection): EntryDraft {
  const sample: EntryDraft = {};
  for (const field of collection.fields) {
    if (field.status === 'archived') continue;
    if (field.valueMode === 'constant') {
      sample[field.key] = field.constantValue;
      continue;
    }
    if (field.defaultValue !== undefined) {
      sample[field.key] = field.defaultValue;
      continue;
    }
    switch (field.type) {
      case 'number':
        sample[field.key] = 100;
        break;
      case 'boolean':
        sample[field.key] = true;
        break;
      case 'date':
        sample[field.key] = '2026-09-06';
        break;
      case 'datetime':
        sample[field.key] = '2026-09-06T00:00:00.000Z';
        break;
      case 'select':
        if (field.options?.[0]) sample[field.key] = field.options[0].value;
        break;
      case 'multi-select':
        sample[field.key] = field.options?.[0] ? [field.options[0].value] : [];
        break;
      case 'url':
        sample[field.key] = 'https://example.com';
        break;
      case 'email':
        sample[field.key] = 'hello@example.com';
        break;
      case 'slug':
        sample[field.key] = 'example-title';
        break;
      case 'array':
        sample[field.key] = [];
        break;
      case 'group':
        sample[field.key] = {};
        break;
      case 'asset':
      case 'image':
      case 'reference':
        // Never invent fake IDs. The picker can add a real workspace reference.
        break;
      default:
        sample[field.key] = `Example ${field.label}`;
        break;
    }
  }
  return sample;
}

const conditionOperatorLabels: Record<CollectionConditionOperator, string> = {
  equals: 'Equals',
  notEquals: 'Does not equal',
  in: 'Is one of',
  notIn: 'Is not one of',
  isSet: 'Is set',
  isEmpty: 'Is empty',
  gt: 'Greater than',
  gte: 'At least',
  lt: 'Less than',
  lte: 'At most',
};

function conditionValueForField(
  field: FieldDraft | undefined,
  operator: CollectionConditionOperator,
): unknown {
  if (operator === 'isSet' || operator === 'isEmpty') return undefined;
  if (operator === 'in' || operator === 'notIn') return [];
  if (!field) return '';
  if (field.type === 'boolean') return false;
  if (field.type === 'number') return 0;
  if (field.type === 'select') return field.options?.[0]?.value ?? '';
  if (field.type === 'multi-select') return [];
  if (field.type === 'array') return [];
  if (field.type === 'group') return {};
  return '';
}

function conditionInputValue(
  field: FieldDraft | undefined,
  operator: CollectionConditionOperator,
  value: unknown,
): string {
  if (operator === 'in' || operator === 'notIn') {
    return Array.isArray(value) ? value.map(String).join(', ') : '';
  }
  if (field?.type === 'boolean') return value === true ? 'true' : 'false';
  return defaultFieldValue(value);
}

function parseConditionInput(
  field: FieldDraft | undefined,
  operator: CollectionConditionOperator,
  raw: string,
): unknown {
  if (operator === 'in' || operator === 'notIn') {
    const values = raw
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean);
    if (field?.type === 'number') return values.map(Number);
    if (field?.type === 'boolean') return values.map((value) => value === 'true');
    return values;
  }
  if (field?.type === 'number') return raw ? Number(raw) : undefined;
  if (field?.type === 'boolean') return raw === 'true';
  if (field?.type === 'array' || field?.type === 'group') {
    try {
      return JSON.parse(raw) as unknown;
    } catch {
      return raw;
    }
  }
  return raw;
}

type ConditionDraft = NonNullable<FieldDraft['condition']>;
type ConditionRuleDraft = ConditionDraft['rules'][number];

export function updateConditionRule(
  condition: ConditionDraft,
  ruleIndex: number,
  patch: Partial<ConditionRuleDraft>,
): ConditionDraft {
  return {
    ...condition,
    rules: condition.rules.map((rule, index) =>
      index === ruleIndex
        ? (() => {
            const next = { ...rule, ...patch };
            // Rebuild target-shape fields on operator changes. Spreading the
            // previous rule would keep a stale value on isSet/isEmpty and
            // make the next contract round-trip invalid.
            if ('operator' in patch || 'fieldKey' in patch) {
              return {
                fieldKey: next.fieldKey,
                operator: next.operator,
                ...(['isSet', 'isEmpty'].includes(next.operator)
                  ? {}
                  : { value: next.value }),
              };
            }
            return next;
          })()
        : rule,
    ),
  };
}

function ConditionRuleValueEditor({
  field,
  operator,
  value,
  onChange,
}: {
  field: FieldDraft | undefined;
  operator: CollectionConditionOperator;
  value: unknown;
  onChange: (value: unknown) => void;
}) {
  if (operator === 'isSet' || operator === 'isEmpty') return null;

  const inputType =
    field?.type === 'number'
      ? 'number'
      : field?.type === 'date'
        ? 'date'
        : field?.type === 'datetime'
          ? 'datetime-local'
          : 'text';

  if (field?.type === 'boolean') {
    return (
      <select
        value={conditionInputValue(field, operator, value)}
        onChange={(event) =>
          onChange(parseConditionInput(field, operator, event.target.value))
        }
      >
        <option value="true">True</option>
        <option value="false">False</option>
      </select>
    );
  }

  if (field?.type === 'select' && operator !== 'in' && operator !== 'notIn') {
    return (
      <select
        value={conditionInputValue(field, operator, value)}
        onChange={(event) => onChange(event.target.value)}
      >
        {(field.options ?? []).map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    );
  }

  if (field?.type === 'multi-select') {
    const selectedValues = Array.isArray(value) ? value.map(String) : [];
    return (
      <select
        multiple
        value={selectedValues}
        onChange={(event) =>
          onChange(Array.from(event.target.selectedOptions, (option) => option.value))
        }
      >
        {(field.options ?? []).map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    );
  }

  return (
    <input
      type={inputType}
      value={conditionInputValue(field, operator, value)}
      onChange={(event) =>
        onChange(parseConditionInput(field, operator, event.target.value))
      }
    />
  );
}

function CollectionConditionRulesEditor({
  condition,
  fields,
  onChange,
}: {
  condition: ConditionDraft;
  fields: FieldDraft[];
  onChange: (condition: ConditionDraft | undefined) => void;
}) {
  const addRule = () => {
    const sourceField = fields[0];
    if (!sourceField || condition.rules.length >= 20) return;
    const operator = conditionOperatorsForFieldType(sourceField.type)[0] ?? 'equals';
    onChange({
      ...condition,
      rules: [
        ...condition.rules,
        {
          fieldKey: sourceField.key,
          operator,
          ...(operator === 'isSet' || operator === 'isEmpty'
            ? {}
            : { value: conditionValueForField(sourceField, operator) }),
        },
      ],
    });
  };

  return (
    <div className="collection-condition-rules">
      {condition.rules.map((rule, ruleIndex) => {
        const sourceField = fields.find((field) => field.key === rule.fieldKey);
        const operators = sourceField
          ? conditionOperatorsForFieldType(sourceField.type)
          : [];

        return (
          <div
            className="collection-condition-rule"
            key={`${rule.fieldKey}-${ruleIndex}`}
          >
            <label>
              Condition field
              <select
                value={rule.fieldKey}
                onChange={(event) => {
                  const nextSource = fields.find(
                    (field) => field.key === event.target.value,
                  );
                  const nextOperator = nextSource
                    ? (conditionOperatorsForFieldType(nextSource.type)[0] ?? 'equals')
                    : 'equals';
                  onChange(
                    updateConditionRule(condition, ruleIndex, {
                      fieldKey: event.target.value,
                      operator: nextOperator,
                      ...(nextOperator === 'isSet' || nextOperator === 'isEmpty'
                        ? {}
                        : { value: conditionValueForField(nextSource, nextOperator) }),
                    }),
                  );
                }}
              >
                {sourceField ? null : (
                  <option value={rule.fieldKey}>{rule.fieldKey}</option>
                )}
                {fields.map((field) => (
                  <option key={field.id} value={field.key}>
                    {field.label || field.key}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Condition operator
              <select
                value={rule.operator}
                onChange={(event) => {
                  const operator = event.target.value as CollectionConditionOperator;
                  onChange(
                    updateConditionRule(condition, ruleIndex, {
                      operator,
                      ...(operator === 'isSet' || operator === 'isEmpty'
                        ? {}
                        : { value: conditionValueForField(sourceField, operator) }),
                    }),
                  );
                }}
              >
                {operators.map((operator) => (
                  <option key={operator} value={operator}>
                    {conditionOperatorLabels[operator]}
                  </option>
                ))}
              </select>
            </label>
            {!['isSet', 'isEmpty'].includes(rule.operator) ? (
              <label>
                Condition value
                <ConditionRuleValueEditor
                  field={sourceField}
                  operator={rule.operator}
                  value={rule.value}
                  onChange={(value) =>
                    onChange(updateConditionRule(condition, ruleIndex, { value }))
                  }
                />
                <small className="muted">
                  {rule.operator === 'in' || rule.operator === 'notIn'
                    ? 'Select multiple values or separate scalar values with commas.'
                    : sourceField?.type === 'array' || sourceField?.type === 'group'
                      ? 'Enter a JSON value.'
                      : 'Only values compatible with the source field are allowed.'}
                </small>
              </label>
            ) : null}
            <button
              className="button button-ghost collection-condition-remove"
              type="button"
              onClick={() =>
                onChange(
                  condition.rules.length === 1
                    ? undefined
                    : {
                        ...condition,
                        rules: condition.rules.filter((_, index) => index !== ruleIndex),
                      },
                )
              }
            >
              Remove rule
            </button>
          </div>
        );
      })}
      <button
        className="button button-ghost"
        disabled={condition.rules.length >= 20 || fields.length === 0}
        type="button"
        onClick={addRule}
      >
        + Add condition rule
      </button>
    </div>
  );
}

function collectionErrorMessage(error: unknown, fallback: string): string {
  if (!(error instanceof ApiClientError)) return fallback;
  const references = error.details?.references;
  if (Array.isArray(references)) {
    const labels = references
      .map((reference) =>
        reference && typeof reference === 'object' && 'label' in reference
          ? String(reference.label)
          : '',
      )
      .filter(Boolean);
    if (labels.length > 0) return `${error.message} Used by: ${labels.join(', ')}.`;
  }
  return error.message;
}

export function CollectionsView({
  canCreateCollection,
  canCreateEntry,
  canDelete,
  canPublish,
  canUpdateCollection,
  canUpdateEntry,
  onCloseCollectionEditor,
  onCloseEntry,
  onCreateCollection,
  onCreateEntry,
  onEditEntry,
  onEditSchema,
  onSelectCollection,
  routeCollectionAction,
  routeEntryAction,
  routeEntryId,
  routeCollectionId,
  siteId,
  workspaceId,
}: {
  canCreateCollection: boolean;
  canCreateEntry: boolean;
  canDelete: boolean;
  canPublish: boolean;
  canUpdateCollection: boolean;
  canUpdateEntry: boolean;
  onCloseCollectionEditor?: () => void;
  onCloseEntry?: (entryId?: string) => void;
  onCreateCollection?: () => void;
  onCreateEntry?: (collectionId?: string) => void;
  onEditEntry?: (entryId: string, collectionId?: string) => void;
  onEditSchema?: (collectionId: string) => void;
  onSelectCollection?: (collectionId: string) => void;
  routeCollectionAction?: 'create' | 'schema';
  routeCollectionId?: string;
  routeEntryAction?: 'create' | 'edit';
  routeEntryId?: string;
  workspaceId: string;
  siteId?: string;
}) {
  const siteScopeId = siteId ?? '';
  const [collections, setCollections] = useState<Collection[]>([]);
  const [entries, setEntries] = useState<CollectionEntryResponse[]>([]);
  const [entryRecord, setEntryRecord] = useState<CollectionEntryResponse | null>(null);
  const [entrySearch, setEntrySearch] = useState('');
  const [entryStatus, setEntryStatus] = useState<'' | 'draft' | 'published' | 'archived'>(
    '',
  );
  const [entrySortField, setEntrySortField] = useState('');
  const [entrySortDirection, setEntrySortDirection] = useState<'asc' | 'desc'>('desc');
  const [entryOffset, setEntryOffset] = useState(0);
  const [entryPagination, setEntryPagination] = useState({
    limit: 20,
    offset: 0,
    total: 0,
    hasNextPage: false,
  });
  const [collectionDrawerOpen, setCollectionDrawerOpen] = useState(
    routeCollectionAction === 'create' || routeCollectionAction === 'schema',
  );
  const [entryDrawerOpen, setEntryDrawerOpen] = useState(
    Boolean(routeEntryId || routeEntryAction === 'create'),
  );
  const [archiveDialogOpen, setArchiveDialogOpen] = useState(false);
  const [collectionForm, setCollectionForm] = useState({
    key: '',
    name: '',
    singularName: '',
    titleFieldKey: '',
  });
  const [fieldDrafts, setFieldDrafts] = useState<FieldDraft[]>([newField()]);
  const [titleFieldKey, setTitleFieldKey] = useState('');
  const [entryDraft, setEntryDraft] = useState<EntryDraft>({});
  const [entryEditorMode, setEntryEditorMode] = useState<'form' | 'json'>('form');
  const [entryJsonDraft, setEntryJsonDraft] = useState('{}');
  const [entryJsonError, setEntryJsonError] = useState<string | null>(null);
  const [advancedJsonDrafts, setAdvancedJsonDrafts] = useState<Record<string, string>>(
    {},
  );
  const [advancedJsonErrors, setAdvancedJsonErrors] = useState<
    Record<string, string | undefined>
  >({});
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const selectedCollection = useMemo(
    () => collections.find((collection) => collection.id === routeCollectionId),
    [routeCollectionId, collections],
  );
  const collectionId = routeCollectionId ?? '';
  const selectedEntry = routeEntryId
    ? (entryRecord ?? entries.find((entry) => entry.id === routeEntryId) ?? null)
    : null;
  const editingCollectionId =
    routeCollectionAction === 'schema' ? routeCollectionId : null;
  const entryReadOnly = Boolean(routeEntryId && routeEntryAction !== 'edit');
  const publishedEntryCount = entries.filter(
    (entry) => entry.status === 'published',
  ).length;
  const draftEntryCount = entries.filter((entry) => entry.status !== 'published').length;
  const isSchemaPage = routeCollectionAction === 'schema';

  useEffect(() => {
    if (routeCollectionAction === 'create') {
      setCollectionForm({ key: '', name: '', singularName: '', titleFieldKey: '' });
      setFieldDrafts([newField()]);
      setTitleFieldKey('');
      setCollectionDrawerOpen(true);
    } else if (routeCollectionAction === 'schema' && selectedCollection) {
      setFieldDrafts(selectedCollection.fields.map((field) => ({ ...field })));
      setTitleFieldKey(selectedCollection.titleFieldKey ?? '');
      setCollectionDrawerOpen(true);
    } else if (!routeCollectionAction) {
      setCollectionDrawerOpen(false);
    }
  }, [routeCollectionAction, selectedCollection]);

  useEffect(() => {
    if (routeEntryAction === 'create') {
      setEntryRecord(null);
      setEntryDraft({});
      setAdvancedJsonDrafts(structuredDrafts(selectedCollection, {}));
      setAdvancedJsonErrors({});
      setEntryEditorMode('form');
      setEntryJsonDraft('{}');
      setEntryJsonError(null);
      setEntryDrawerOpen(true);
      return;
    }
    if (!routeEntryId || !collectionId) {
      setEntryRecord(null);
      setEntryDrawerOpen(false);
      return;
    }
    setEntryDrawerOpen(true);
    setEntryRecord(null);
    let active = true;
    void api
      .get<CollectionEntryResponse>(
        collectionApiPath(
          workspaceId,
          siteScopeId,
          collectionId,
          `entries/${routeEntryId}`,
        ),
      )
      .then((entry) => {
        if (!active) return;
        setEntryRecord(entry);
        setEntryDraft(entry.values);
        setEntryJsonDraft(JSON.stringify(entry.values, null, 2));
        setEntryJsonError(null);
        setAdvancedJsonDrafts(structuredDrafts(selectedCollection, entry.values));
        setAdvancedJsonErrors({});
      })
      .catch((caughtError: unknown) => {
        if (active)
          setError(collectionErrorMessage(caughtError, 'Unable to load this entry.'));
      });
    return () => {
      active = false;
    };
  }, [collectionId, routeEntryAction, routeEntryId, siteScopeId, workspaceId]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    void api
      .get<Collection[]>(collectionApiPath(workspaceId, siteScopeId))
      .then((next) => {
        if (!active) return;
        setCollections(next);
      })
      .catch((caughtError: unknown) => {
        if (active)
          setError(collectionErrorMessage(caughtError, 'Unable to load collections.'));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [routeCollectionId, siteScopeId, workspaceId]);

  useEffect(() => {
    if (!collectionId) {
      setEntries([]);
      return;
    }
    let active = true;
    const params = new URLSearchParams({
      limit: '20',
      offset: String(entryOffset),
      ...(entrySearch.trim() ? { search: entrySearch.trim() } : {}),
      ...(entryStatus ? { status: entryStatus } : {}),
      ...(entrySortField
        ? { sortField: entrySortField, sortDirection: entrySortDirection }
        : {}),
    });
    void api
      .get<{
        items: CollectionEntryResponse[];
        pagination: typeof entryPagination;
      }>(
        `${collectionApiPath(workspaceId, siteScopeId, collectionId, 'entries')}?${params.toString()}`,
      )
      .then((result) => {
        if (!active) return;
        setEntries(result.items);
        setEntryPagination(result.pagination);
      })
      .catch((caughtError: unknown) => {
        if (active)
          setError(
            collectionErrorMessage(caughtError, 'Unable to load collection entries.'),
          );
      });
    return () => {
      active = false;
    };
  }, [
    collectionId,
    entryOffset,
    entrySearch,
    entrySortDirection,
    entrySortField,
    entryStatus,
    siteScopeId,
    workspaceId,
  ]);

  async function createCollection(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const fields = fieldDrafts
      .filter((field) => field.key.trim() && field.label.trim())
      .map(({ id: _id, ...field }) => ({
        ...field,
        key: field.key.trim(),
        label: field.label.trim(),
      }));
    const created = await api.post<Collection>(
      collectionApiPath(workspaceId, siteScopeId),
      {
        ...collectionForm,
        key: collectionForm.key.trim() || collectionKeyFromName(collectionForm.name),
        singularName:
          collectionForm.singularName.trim() ||
          singularCollectionName(collectionForm.name),
        titleFieldKey: collectionForm.titleFieldKey || undefined,
        fields,
      },
    );
    setCollections((current) => [...current, created]);
    onSelectCollection?.(created.id);
    setCollectionDrawerOpen(false);
    setCollectionForm({ key: '', name: '', singularName: '', titleFieldKey: '' });
    setFieldDrafts([newField()]);
    setMessage(`Created ${created.name}.`);
  }

  async function updateCollection(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedCollection || !canUpdateCollection) return;
    setError(null);
    const fields = fieldDrafts
      .filter((field) => field.key.trim() && field.label.trim())
      .map((field) => ({ ...field, key: field.key.trim(), label: field.label.trim() }));
    const updated = await api.patch<Collection>(
      collectionApiPath(workspaceId, siteScopeId, selectedCollection.id),
      {
        fields,
        titleFieldKey: titleFieldKey || null,
        expectedSchemaVersion: selectedCollection.schemaVersion,
      },
    );
    setCollections((current) =>
      current.map((item) => (item.id === updated.id ? updated : item)),
    );
    setCollectionDrawerOpen(false);
    setMessage('Collection schema updated.');
    onCloseCollectionEditor?.();
  }

  async function saveEntry(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedCollection || (selectedEntry ? !canUpdateEntry : !canCreateEntry))
      return;
    if (routeEntryId && !selectedEntry) {
      setError('This entry is still loading. Try again in a moment.');
      return;
    }
    setError(null);
    let values: EntryDraft = { ...entryDraft };
    if (entryEditorMode === 'json') {
      try {
        const parsed = JSON.parse(entryJsonDraft) as unknown;
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))
          throw new Error();
        values = parsed as EntryDraft;
        setEntryJsonError(null);
      } catch {
        setEntryJsonError('Enter a JSON object containing the entry values.');
        setError('The entry JSON is malformed.');
        return;
      }
    }
    for (const field of entryEditorMode === 'json' ? [] : selectedCollection.fields) {
      if (field.type !== 'array' && field.type !== 'group') continue;
      const raw = advancedJsonDrafts[field.key] ?? '';
      if (!raw.trim()) {
        values = updateEntryDraft(values, field, undefined);
        continue;
      }
      const parsed = parseStructuredValue(raw);
      if (!parsed.success) {
        setAdvancedJsonErrors((current) => ({
          ...current,
          [field.key]: 'Enter valid JSON for this field before saving.',
        }));
        setError(`The ${field.label} field contains malformed JSON.`);
        return;
      }
      values = updateEntryDraft(values, field, parsed.value);
    }
    const path = collectionApiPath(
      workspaceId,
      siteScopeId,
      selectedCollection.id,
      'entries',
    );
    const saved = selectedEntry
      ? await api.patch<CollectionEntryResponse>(`${path}/${selectedEntry.id}`, {
          values,
          expectedVersionNumber: selectedEntry.versionNumber,
        })
      : await api.post<CollectionEntryResponse>(path, { values });
    setEntries((current) =>
      selectedEntry
        ? current.map((entry) => (entry.id === saved.id ? saved : entry))
        : [saved, ...current],
    );
    setEntryRecord(saved);
    setEntryDraft(saved.values);
    setEntryJsonDraft(JSON.stringify(saved.values, null, 2));
    setAdvancedJsonDrafts(structuredDrafts(selectedCollection, saved.values));
    setAdvancedJsonErrors({});
    setEntryDrawerOpen(false);
    onCloseEntry?.(saved.id);
    setMessage(selectedEntry ? 'Entry draft saved.' : 'Entry created as draft.');
  }

  async function publishEntry(entry: CollectionEntryResponse) {
    if (!canPublish || !selectedCollection) return;
    setError(null);
    const saved = await api.post<CollectionEntryResponse>(
      collectionApiPath(
        workspaceId,
        siteScopeId,
        selectedCollection.id,
        `entries/${entry.id}/publish`,
      ),
    );
    setEntries((current) => current.map((item) => (item.id === saved.id ? saved : item)));
    setMessage('Entry published.');
  }

  async function archiveCollection() {
    if (!canDelete || !selectedCollection) return;
    setError(null);
    await api.delete(collectionApiPath(workspaceId, siteScopeId, selectedCollection.id));
    setCollections((current) =>
      current.filter((item) => item.id !== selectedCollection.id),
    );
    setArchiveDialogOpen(false);
    onCloseCollectionEditor?.();
    setMessage('Collection archived.');
  }

  function editEntry(entry: CollectionEntryResponse) {
    if (onEditEntry) {
      onEditEntry(entry.id, selectedCollection?.id);
      return;
    }
    setEntryRecord(entry);
    setEntryDraft(entry.values);
    setEntryEditorMode('form');
    setEntryJsonDraft(JSON.stringify(entry.values, null, 2));
    setEntryJsonError(null);
    setAdvancedJsonDrafts(structuredDrafts(selectedCollection, entry.values));
    setAdvancedJsonErrors({});
    setEntryDrawerOpen(true);
  }

  function startNewEntry() {
    if (onCreateEntry) {
      onCreateEntry(selectedCollection?.id);
      return;
    }
    setEntryRecord(null);
    setEntryDraft({});
    setEntryEditorMode('form');
    setEntryJsonDraft('{}');
    setEntryJsonError(null);
    setAdvancedJsonDrafts(structuredDrafts(selectedCollection, {}));
    setAdvancedJsonErrors({});
    setEntryDrawerOpen(true);
  }

  function updateAdvancedJson(fieldKey: string, rawValue: string): void {
    setAdvancedJsonDrafts((current) => ({ ...current, [fieldKey]: rawValue }));
    const field = selectedCollection?.fields.find(
      (candidate) => candidate.key === fieldKey,
    );
    if (!field) return;
    const parsed = parseStructuredValue(rawValue);
    if (!parsed.success) {
      setAdvancedJsonErrors((current) => ({
        ...current,
        [fieldKey]: 'Enter valid JSON for this field before saving.',
      }));
      return;
    }
    setAdvancedJsonErrors((current) => ({ ...current, [fieldKey]: undefined }));
    setEntryDraft((current) => updateEntryDraft(current, field, parsed.value));
  }

  function editSchema() {
    if (!selectedCollection) return;
    setFieldDrafts(selectedCollection.fields.map((field) => ({ ...field })));
  }

  function updateFieldConstant(index: number, value: unknown): void {
    setFieldDrafts((current) =>
      current.map((item, itemIndex) =>
        itemIndex === index ? { ...item, constantValue: value } : item,
      ),
    );
  }

  return (
    <>
      <PageHeader
        eyebrow="Content"
        title={
          isSchemaPage
            ? `${selectedCollection?.name ?? 'Collection'} schema`
            : 'Collections'
        }
        description={
          isSchemaPage
            ? 'Shape the fields and validation rules used by every entry in this collection.'
            : 'Define structured content once, then use published entries in pages and repeaters.'
        }
        actions={
          isSchemaPage ? (
            <button
              className="button button-secondary"
              onClick={() => onCloseCollectionEditor?.()}
              type="button"
            >
              Back to collections
            </button>
          ) : (
            <div className="form-actions">
              <button
                className="button button-primary"
                disabled={!canCreateCollection}
                onClick={onCreateCollection}
                type="button"
              >
                New collection
              </button>
            </div>
          )
        }
      />
      {message ? (
        <div aria-live="polite" className="alert alert-success" role="status">
          {message}
        </div>
      ) : null}
      {error ? (
        <div aria-live="assertive" className="alert alert-error" role="alert">
          {error}
        </div>
      ) : null}
      {!isSchemaPage ? (
        <>
          <section className="collection-summary-grid" aria-label="Collection summary">
            <article className="collection-summary-card collection-summary-card-primary">
              <span className="collection-summary-icon" aria-hidden="true">
                ▥
              </span>
              <span>
                <small>Content models</small>
                <strong>{collections.length}</strong>
              </span>
              <span className="collection-summary-note">Reusable schemas</span>
            </article>
            <article className="collection-summary-card">
              <span className="collection-summary-icon" aria-hidden="true">
                ◈
              </span>
              <span>
                <small>Entries in view</small>
                <strong>{entries.length}</strong>
              </span>
              <span className="collection-summary-note">
                {selectedCollection?.name ?? 'Select a model'}
              </span>
            </article>
            <article className="collection-summary-card">
              <span className="collection-summary-icon" aria-hidden="true">
                ✓
              </span>
              <span>
                <small>Published</small>
                <strong>{publishedEntryCount}</strong>
              </span>
              <span className="collection-summary-note">Ready for delivery</span>
            </article>
            <article className="collection-summary-card">
              <span className="collection-summary-icon" aria-hidden="true">
                ◌
              </span>
              <span>
                <small>Drafts</small>
                <strong>{draftEntryCount}</strong>
              </span>
              <span className="collection-summary-note">Need review</span>
            </article>
          </section>
          <div className="collection-workspace">
            <Panel as="section" className="collection-library-panel">
              <div className="collection-section-heading">
                <div>
                  <span className="eyebrow">Content models</span>
                  <h2>Collections</h2>
                </div>
                <span className="collection-count-pill">{collections.length}</span>
              </div>
              <p className="collection-panel-intro">
                Choose a schema to manage its content and publishing state.
              </p>
              {loading ? (
                <div className="collection-loading" role="status">
                  <span className="skeleton" />
                  <span className="skeleton" />
                  <span className="skeleton" />
                </div>
              ) : collections.length === 0 ? (
                <div className="collection-empty-state">
                  <span className="collection-empty-icon" aria-hidden="true">
                    ＋
                  </span>
                  <strong>No collections yet</strong>
                  <p className="muted">Create your first structured content model.</p>
                  <button
                    className="button button-small button-secondary"
                    disabled={!canCreateCollection}
                    onClick={onCreateCollection}
                    type="button"
                  >
                    Create collection
                  </button>
                </div>
              ) : (
                <div className="collection-library-list">
                  {collections.map((collection) => (
                    <button
                      aria-current={collection.id === collectionId ? 'page' : undefined}
                      className={
                        collection.id === collectionId
                          ? 'collection-library-item is-active'
                          : 'collection-library-item'
                      }
                      key={collection.id}
                      onClick={() => {
                        setEntrySearch('');
                        setEntryOffset(0);
                        onSelectCollection?.(collection.id);
                      }}
                      type="button"
                    >
                      <span className="collection-library-mark" aria-hidden="true">
                        ◈
                      </span>
                      <span className="collection-library-copy">
                        <strong>{collection.name}</strong>
                        <small>{collection.key}</small>
                        <span>
                          {collection.fields.length} fields
                          <span aria-hidden="true"> · </span>
                          {collection.id === collectionId
                            ? `${entries.length} entries`
                            : 'Schema ready'}
                        </span>
                      </span>
                      <span className="collection-library-arrow" aria-hidden="true">
                        →
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </Panel>
            <Panel as="section" className="collection-detail-panel">
              {selectedCollection ? (
                <>
                  <div className="collection-detail-header">
                    <div className="collection-detail-title">
                      <span className="collection-detail-mark" aria-hidden="true">
                        ◈
                      </span>
                      <div>
                        <span className="eyebrow">{selectedCollection.key}</span>
                        <h2>{selectedCollection.name}</h2>
                        <p className="muted">
                          Manage the records powering your pages and dynamic routes.
                        </p>
                      </div>
                    </div>
                    <div className="form-actions collection-detail-actions">
                      <button
                        className="button button-small button-ghost"
                        disabled={!canUpdateCollection}
                        onClick={() => {
                          if (onEditSchema) onEditSchema(selectedCollection.id);
                          else {
                            editSchema();
                            setCollectionDrawerOpen(true);
                          }
                        }}
                        type="button"
                      >
                        Edit schema
                      </button>
                      <button
                        className="button button-small button-danger"
                        disabled={!canDelete}
                        onClick={() => setArchiveDialogOpen(true)}
                        type="button"
                      >
                        Archive
                      </button>
                    </div>
                  </div>
                  <div className="collection-detail-stats">
                    <span>
                      <strong>{selectedCollection.fields.length}</strong> schema fields
                    </span>
                    <span>
                      <strong>{entries.length}</strong> total entries
                    </span>
                    <span>
                      <strong>{publishedEntryCount}</strong> published
                    </span>
                  </div>
                  <div className="collection-schema-preview">
                    <div className="collection-subsection-heading">
                      <div>
                        <span className="eyebrow">Schema preview</span>
                        <h3>Fields available to pages</h3>
                      </div>
                      <button
                        className="button button-small button-ghost"
                        disabled={!canUpdateCollection}
                        onClick={() => {
                          if (onEditSchema) onEditSchema(selectedCollection.id);
                          else {
                            editSchema();
                            setCollectionDrawerOpen(true);
                          }
                        }}
                        type="button"
                      >
                        Manage fields
                      </button>
                    </div>
                    <div className="collection-field-chips">
                      {selectedCollection.fields.map((field) => (
                        <span className="collection-field-chip" key={field.id}>
                          <strong>{field.label}</strong>
                          <small>
                            {field.type}
                            {field.required ? ' · required' : ''}
                          </small>
                          {field.unique ? (
                            <span aria-label="Unique field">Unique</span>
                          ) : null}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div className="collection-entries-section">
                    <div className="collection-subsection-heading collection-entries-heading">
                      <div>
                        <span className="eyebrow">Content</span>
                        <h3>{selectedCollection.singularName} entries</h3>
                        <p className="muted">
                          Open a record to review or edit its fields.
                        </p>
                      </div>
                      <button
                        className="button button-primary"
                        disabled={!canCreateEntry}
                        onClick={startNewEntry}
                        type="button"
                      >
                        New entry
                      </button>
                    </div>
                    <div className="collection-entry-toolbar">
                      <SearchField
                        className="collection-search-field"
                        label="Search entries"
                        onChange={(event) => {
                          setEntrySearch(event.target.value);
                          setEntryOffset(0);
                        }}
                        placeholder={`Search ${selectedCollection.singularName.toLowerCase()} entries`}
                        value={entrySearch}
                      />
                      <label className="inline-field">
                        Status
                        <select
                          aria-label="Filter entries by status"
                          onChange={(event) => {
                            setEntryStatus(event.target.value as typeof entryStatus);
                            setEntryOffset(0);
                          }}
                          value={entryStatus}
                        >
                          <option value="">All</option>
                          <option value="draft">Draft</option>
                          <option value="published">Published</option>
                          <option value="archived">Archived</option>
                        </select>
                      </label>
                      <label className="inline-field">
                        Sort
                        <select
                          aria-label="Sort entries"
                          onChange={(event) => {
                            setEntrySortField(event.target.value);
                            setEntryOffset(0);
                          }}
                          value={entrySortField}
                        >
                          <option value="">Newest</option>
                          {selectedCollection.fields
                            .filter(
                              (field) =>
                                !['array', 'group', 'multi-select'].includes(field.type),
                            )
                            .map((field) => (
                              <option key={field.key} value={field.key}>
                                {field.label}
                              </option>
                            ))}
                        </select>
                      </label>
                      {entrySortField ? (
                        <button
                          className="button button-small button-ghost"
                          onClick={() => {
                            setEntrySortDirection((current) =>
                              current === 'asc' ? 'desc' : 'asc',
                            );
                            setEntryOffset(0);
                          }}
                          type="button"
                        >
                          {entrySortDirection === 'asc' ? 'Ascending ↑' : 'Descending ↓'}
                        </button>
                      ) : null}
                      <span className="muted small">
                        {entryPagination.total} entries · page{' '}
                        {Math.floor(entryOffset / 20) + 1}
                      </span>
                    </div>
                    {entries.length === 0 && entryPagination.total === 0 ? (
                      <div className="collection-empty-state collection-empty-state-wide">
                        <span className="collection-empty-icon" aria-hidden="true">
                          ◈
                        </span>
                        <strong>No entries yet</strong>
                        <p className="muted">
                          Create the first record for this collection.
                        </p>
                        <button
                          className="button button-small button-secondary"
                          disabled={!canCreateEntry}
                          onClick={startNewEntry}
                          type="button"
                        >
                          Add entry
                        </button>
                      </div>
                    ) : entries.length === 0 ? (
                      <div className="collection-no-results">
                        <strong>No matching entries</strong>
                        <span className="muted">Try another search term.</span>
                      </div>
                    ) : (
                      <div className="collection-entry-list">
                        {entries.map((entry) => {
                          const previewFields = selectedCollection.fields
                            .filter(
                              (field) => field.key !== selectedCollection.titleFieldKey,
                            )
                            .slice(0, 2);
                          return (
                            <article className="collection-entry-row" key={entry.id}>
                              <button
                                className="collection-entry-main"
                                onClick={() => editEntry(entry)}
                                type="button"
                              >
                                <span
                                  className="collection-entry-avatar"
                                  aria-hidden="true"
                                >
                                  {entryTitle(entry, selectedCollection)
                                    .slice(0, 1)
                                    .toUpperCase()}
                                </span>
                                <span className="collection-entry-copy">
                                  <strong>{entryTitle(entry, selectedCollection)}</strong>
                                  <small>
                                    {previewFields
                                      .map(
                                        (field) =>
                                          `${field.label}: ${entryPreviewValue(entry.values[field.key])}`,
                                      )
                                      .join(' · ')}
                                  </small>
                                </span>
                              </button>
                              <span className="collection-entry-version">
                                v{entry.versionNumber}
                              </span>
                              <StatusBadge status={entry.status} />
                              <div className="collection-entry-actions">
                                {entry.status !== 'published' ? (
                                  <button
                                    className="button button-small button-primary"
                                    disabled={!canPublish}
                                    onClick={() =>
                                      void publishEntry(entry).catch(
                                        (caughtError: unknown) =>
                                          setError(
                                            collectionErrorMessage(
                                              caughtError,
                                              'Unable to publish this entry.',
                                            ),
                                          ),
                                      )
                                    }
                                    type="button"
                                  >
                                    Publish
                                  </button>
                                ) : null}
                                <button
                                  aria-label={`Edit ${entryTitle(entry, selectedCollection)}`}
                                  className="button button-small button-ghost"
                                  onClick={() => editEntry(entry)}
                                  type="button"
                                >
                                  Edit
                                </button>
                              </div>
                            </article>
                          );
                        })}
                      </div>
                    )}
                    {entryPagination.total > 0 ? (
                      <div className="form-actions collection-pagination-actions">
                        <button
                          className="button button-small button-ghost"
                          disabled={entryOffset === 0}
                          onClick={() =>
                            setEntryOffset((current) => Math.max(0, current - 20))
                          }
                          type="button"
                        >
                          Previous
                        </button>
                        <span className="muted small">
                          {entryOffset + 1}–
                          {Math.min(entryOffset + entries.length, entryPagination.total)}{' '}
                          of {entryPagination.total}
                        </span>
                        <button
                          className="button button-small button-ghost"
                          disabled={!entryPagination.hasNextPage}
                          onClick={() => setEntryOffset((current) => current + 20)}
                          type="button"
                        >
                          Next
                        </button>
                      </div>
                    ) : null}
                  </div>
                </>
              ) : (
                <div className="collection-detail-empty">
                  <span className="collection-detail-empty-mark" aria-hidden="true">
                    ◈
                  </span>
                  <span className="eyebrow">Content model</span>
                  <h2>Select a collection</h2>
                  <p className="muted">
                    Choose a model from the library to view its schema and entries.
                  </p>
                </div>
              )}
            </Panel>
          </div>
        </>
      ) : null}
      <Drawer
        eyebrow={editingCollectionId ? 'Content fields' : 'Reusable content'}
        description="Create content once and reuse it across your website. You can add fields now or later."
        footer={
          <div className="form-actions">
            <button
              className="button button-primary"
              form="collection-form"
              type="submit"
            >
              Save collection
            </button>
            <button
              className="button button-ghost"
              onClick={() => {
                setCollectionDrawerOpen(false);
                onCloseCollectionEditor?.();
              }}
              type="button"
            >
              Cancel
            </button>
          </div>
        }
        inline={isSchemaPage}
        onClose={() => {
          setCollectionDrawerOpen(false);
          onCloseCollectionEditor?.();
        }}
        open={collectionDrawerOpen}
        size="lg"
        title={
          editingCollectionId && selectedCollection
            ? `Edit ${selectedCollection.name}`
            : 'New collection'
        }
      >
        <form
          className="stack"
          id="collection-form"
          onSubmit={(event) =>
            void (
              editingCollectionId ? updateCollection(event) : createCollection(event)
            ).catch((caughtError: unknown) =>
              setError(
                collectionErrorMessage(caughtError, 'Unable to save the collection.'),
              ),
            )
          }
        >
          {!editingCollectionId ? (
            <label>
              Content type name
              <input
                aria-label="Name"
                required
                placeholder="e.g. Blog posts or Team members"
                value={collectionForm.name}
                onChange={(event) =>
                  setCollectionForm({ ...collectionForm, name: event.target.value })
                }
              />
              <span className="muted small">
                We’ll set up the internal names automatically.
              </span>
            </label>
          ) : null}
          {!editingCollectionId ? (
            <details className="form-advanced">
              <summary>Advanced naming</summary>
              <label>
                Internal key
                <input
                  pattern="[a-z][a-z0-9-]*"
                  value={collectionForm.key}
                  onChange={(event) =>
                    setCollectionForm({ ...collectionForm, key: event.target.value })
                  }
                />
              </label>
              <label>
                Singular name
                <input
                  value={collectionForm.singularName}
                  onChange={(event) =>
                    setCollectionForm({
                      ...collectionForm,
                      singularName: event.target.value,
                    })
                  }
                />
              </label>
            </details>
          ) : null}
          <label>
            Title field
            <select
              value={editingCollectionId ? titleFieldKey : collectionForm.titleFieldKey}
              onChange={(event) => {
                if (editingCollectionId) setTitleFieldKey(event.target.value);
                else
                  setCollectionForm({
                    ...collectionForm,
                    titleFieldKey: event.target.value,
                  });
              }}
            >
              <option value="">Use entry ID when no title is set</option>
              {fieldDrafts
                .filter((field) => field.key.trim())
                .map((field) => (
                  <option key={field.id} value={field.key}>
                    {field.label || field.key}
                  </option>
                ))}
            </select>
            <small className="muted">
              This field labels entries in the CMS and reference pickers.
            </small>
          </label>
          <div className="collection-drawer-section-heading">
            <div>
              <span className="eyebrow">Content fields</span>
              <h3>What should each item include?</h3>
              <p className="muted small">Add fields only when you need them.</p>
            </div>
            <span className="collection-count-pill">{fieldDrafts.length}</span>
          </div>
          <div className="collection-drawer-field-actions">
            <button
              className="button button-small button-secondary"
              onClick={() => setFieldDrafts((current) => [...current, newField()])}
              type="button"
            >
              + Add field
            </button>
          </div>
          {fieldDrafts.map((field, index) => (
            <div className="collection-drawer-field-card" key={`${field.key}-${index}`}>
              <div className="collection-drawer-field-card-header">
                <span className="collection-field-index">
                  {String(index + 1).padStart(2, '0')}
                </span>
                <strong>{field.label || 'Untitled field'}</strong>
                {field.key ? <code>{field.key}</code> : null}
                <span className="collection-field-reorder-actions">
                  <button
                    aria-label={`Move field ${index + 1} up`}
                    className="button button-small button-ghost"
                    disabled={index === 0}
                    onClick={() =>
                      setFieldDrafts((current) => {
                        if (index === 0) return current;
                        const next = [...current];
                        const previous = next[index - 1];
                        const currentField = next[index];
                        if (!previous || !currentField) return current;
                        next.splice(index - 1, 2, currentField, previous);
                        return next;
                      })
                    }
                    type="button"
                  >
                    ↑
                  </button>
                  <button
                    aria-label={`Move field ${index + 1} down`}
                    className="button button-small button-ghost"
                    disabled={index === fieldDrafts.length - 1}
                    onClick={() =>
                      setFieldDrafts((current) => {
                        if (index === current.length - 1) return current;
                        const next = [...current];
                        const currentField = next[index];
                        const following = next[index + 1];
                        if (!currentField || !following) return current;
                        next.splice(index, 2, following, currentField);
                        return next;
                      })
                    }
                    type="button"
                  >
                    ↓
                  </button>
                </span>
                {fieldDrafts.length > 1 ? (
                  <button
                    aria-label={`Remove field ${index + 1}`}
                    className="button button-small button-ghost"
                    onClick={() =>
                      setFieldDrafts((current) =>
                        current.filter((_, itemIndex) => itemIndex !== index),
                      )
                    }
                    type="button"
                  >
                    Remove
                  </button>
                ) : null}
              </div>
              <details className="collection-field-settings">
                <summary>Configure field</summary>
                <div className="collection-drawer-field-grid">
                  <label>
                    Key
                    <input
                      pattern="[a-z][a-z0-9_]*"
                      value={field.key}
                      onChange={(event) =>
                        setFieldDrafts((current) =>
                          current.map((item, itemIndex) =>
                            itemIndex === index
                              ? { ...item, key: event.target.value }
                              : item,
                          ),
                        )
                      }
                    />
                  </label>
                  <label>
                    Label
                    <input
                      value={field.label}
                      onChange={(event) =>
                        setFieldDrafts((current) =>
                          current.map((item, itemIndex) =>
                            itemIndex === index
                              ? { ...item, label: event.target.value }
                              : item,
                          ),
                        )
                      }
                    />
                  </label>
                  <label>
                    Type
                    <select
                      value={field.type}
                      onChange={(event) =>
                        setFieldDrafts((current) =>
                          current.map((item, itemIndex) =>
                            itemIndex === index
                              ? {
                                  ...item,
                                  type: event.target.value as CollectionFieldType,
                                  ...(event.target.value === 'select' ||
                                  event.target.value === 'multi-select'
                                    ? { options: item.options ?? [] }
                                    : { options: undefined }),
                                  ...(event.target.value === 'reference'
                                    ? { cardinality: item.cardinality ?? 'one' }
                                    : {
                                        targetCollectionId: undefined,
                                        cardinality: undefined,
                                      }),
                                }
                              : item,
                          ),
                        )
                      }
                    >
                      {[...new Set([...fieldTypes, field.type])].map((type) => (
                        <option key={type} value={type}>
                          {type}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="collection-required-toggle">
                    <span>Validation</span>
                    <span>
                      <input
                        checked={field.required}
                        onChange={(event) =>
                          setFieldDrafts((current) =>
                            current.map((item, itemIndex) =>
                              itemIndex === index
                                ? { ...item, required: event.target.checked }
                                : item,
                            ),
                          )
                        }
                        type="checkbox"
                      />
                      Required field
                    </span>
                  </label>
                </div>
                <div className="collection-drawer-field-grid">
                  <label>
                    Value ownership
                    <select
                      value={field.valueMode ?? 'editable'}
                      onChange={(event) =>
                        setFieldDrafts((current) =>
                          current.map((item, itemIndex) =>
                            itemIndex === index
                              ? {
                                  ...item,
                                  valueMode: event.target.value as
                                    'editable' | 'constant',
                                  ...(event.target.value === 'editable'
                                    ? { constantValue: undefined }
                                    : {}),
                                }
                              : item,
                          ),
                        )
                      }
                    >
                      <option value="editable">Editable per entry</option>
                      <option value="constant">Constant schema value</option>
                    </select>
                  </label>
                  {field.valueMode === 'constant' ? (
                    <label>
                      Constant value
                      {field.type === 'boolean' ? (
                        <select
                          value={
                            field.constantValue === undefined
                              ? ''
                              : String(field.constantValue)
                          }
                          onChange={(event) =>
                            updateFieldConstant(
                              index,
                              event.target.value === ''
                                ? undefined
                                : event.target.value === 'true',
                            )
                          }
                        >
                          <option value="">Choose a value</option>
                          <option value="true">True</option>
                          <option value="false">False</option>
                        </select>
                      ) : field.type === 'select' ? (
                        <select
                          value={defaultFieldValue(field.constantValue)}
                          onChange={(event) =>
                            updateFieldConstant(index, event.target.value || undefined)
                          }
                        >
                          <option value="">Choose a value</option>
                          {(field.options ?? []).map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      ) : field.type === 'multi-select' ? (
                        <span className="collection-option-list">
                          {(field.options ?? []).map((option) => {
                            const selected = Array.isArray(field.constantValue)
                              ? field.constantValue.includes(option.value)
                              : false;
                            return (
                              <span className="checkbox-field" key={option.value}>
                                <input
                                  checked={selected}
                                  onChange={(event) => {
                                    const current = Array.isArray(field.constantValue)
                                      ? field.constantValue.map(String)
                                      : [];
                                    const next = event.target.checked
                                      ? [...current, option.value]
                                      : current.filter((value) => value !== option.value);
                                    updateFieldConstant(index, next);
                                  }}
                                  type="checkbox"
                                />
                                {option.label}
                              </span>
                            );
                          })}
                        </span>
                      ) : field.type === 'array' || field.type === 'group' ? (
                        <textarea
                          placeholder={field.type === 'array' ? '[]' : '{}'}
                          rows={3}
                          value={defaultFieldValue(field.constantValue)}
                          onChange={(event) => {
                            const raw = event.target.value.trim();
                            if (!raw) {
                              updateFieldConstant(index, undefined);
                              return;
                            }
                            try {
                              updateFieldConstant(index, JSON.parse(raw));
                            } catch {
                              updateFieldConstant(index, raw);
                            }
                          }}
                        />
                      ) : (
                        <input
                          type={field.type === 'number' ? 'number' : 'text'}
                          value={defaultFieldValue(field.constantValue)}
                          onChange={(event) => {
                            const raw = event.target.value;
                            updateFieldConstant(
                              index,
                              raw === ''
                                ? undefined
                                : field.type === 'number'
                                  ? Number(raw)
                                  : raw,
                            );
                          }}
                        />
                      )}
                    </label>
                  ) : null}
                </div>
                {field.condition ? (
                  <>
                    <div className="collection-drawer-field-grid">
                      <label>
                        Match rules
                        <select
                          value={field.condition.logic}
                          onChange={(event) =>
                            setFieldDrafts((current) =>
                              current.map((item, itemIndex) =>
                                itemIndex === index && item.condition
                                  ? {
                                      ...item,
                                      condition: {
                                        ...item.condition,
                                        logic: event.target.value as 'all' | 'any',
                                      },
                                    }
                                  : item,
                              ),
                            )
                          }
                        >
                          <option value="all">All rules</option>
                          <option value="any">Any rule</option>
                        </select>
                      </label>
                    </div>
                    <CollectionConditionRulesEditor
                      condition={field.condition}
                      fields={fieldDrafts.filter(
                        (candidate) => candidate.id !== field.id && candidate.key,
                      )}
                      onChange={(condition) =>
                        setFieldDrafts((current) =>
                          current.map((item, itemIndex) =>
                            itemIndex === index ? { ...item, condition } : item,
                          ),
                        )
                      }
                    />
                  </>
                ) : null}
                {field.type !== 'reference' ? (
                  <label>
                    Default value
                    <small className="muted">
                      Applied to new entries when the field is left empty.
                    </small>
                    {field.type === 'boolean' ? (
                      <span className="collection-required-toggle">
                        <span>
                          <input
                            checked={field.defaultValue === true}
                            onChange={(event) =>
                              setFieldDrafts((current) =>
                                current.map((item, itemIndex) =>
                                  itemIndex === index
                                    ? {
                                        ...item,
                                        defaultValue: event.target.checked
                                          ? true
                                          : undefined,
                                      }
                                    : item,
                                ),
                              )
                            }
                            type="checkbox"
                          />
                          Default to true
                        </span>
                      </span>
                    ) : field.type === 'select' ? (
                      <select
                        value={defaultFieldValue(field.defaultValue)}
                        onChange={(event) =>
                          setFieldDrafts((current) =>
                            current.map((item, itemIndex) =>
                              itemIndex === index
                                ? {
                                    ...item,
                                    defaultValue: event.target.value || undefined,
                                  }
                                : item,
                            ),
                          )
                        }
                      >
                        <option value="">No default</option>
                        {(field.options ?? []).map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    ) : field.type === 'multi-select' ? (
                      <div className="collection-option-list">
                        {(field.options ?? []).map((option) => {
                          const selected = Array.isArray(field.defaultValue)
                            ? field.defaultValue.includes(option.value)
                            : false;
                          return (
                            <label className="checkbox-field" key={option.value}>
                              <input
                                checked={selected}
                                onChange={(event) => {
                                  const current = Array.isArray(field.defaultValue)
                                    ? field.defaultValue.map(String)
                                    : [];
                                  const next = event.target.checked
                                    ? [...current, option.value]
                                    : current.filter((value) => value !== option.value);
                                  setFieldDrafts((currentFields) =>
                                    currentFields.map((item, itemIndex) =>
                                      itemIndex === index
                                        ? {
                                            ...item,
                                            defaultValue: next.length ? next : undefined,
                                          }
                                        : item,
                                    ),
                                  );
                                }}
                                type="checkbox"
                              />
                              {option.label}
                            </label>
                          );
                        })}
                      </div>
                    ) : field.type === 'array' || field.type === 'group' ? (
                      <textarea
                        placeholder={field.type === 'array' ? '[]' : '{}'}
                        rows={3}
                        value={defaultFieldValue(field.defaultValue)}
                        onChange={(event) => {
                          const raw = event.target.value.trim();
                          let next: unknown = undefined;
                          if (raw) {
                            try {
                              next = JSON.parse(raw);
                            } catch {
                              next = raw;
                            }
                          }
                          setFieldDrafts((current) =>
                            current.map((item, itemIndex) =>
                              itemIndex === index
                                ? { ...item, defaultValue: next }
                                : item,
                            ),
                          );
                        }}
                      />
                    ) : (
                      <input
                        type={field.type === 'number' ? 'number' : 'text'}
                        value={defaultFieldValue(field.defaultValue)}
                        onChange={(event) => {
                          const raw = event.target.value;
                          const next =
                            raw === ''
                              ? undefined
                              : field.type === 'number'
                                ? Number(raw)
                                : raw;
                          setFieldDrafts((current) =>
                            current.map((item, itemIndex) =>
                              itemIndex === index
                                ? { ...item, defaultValue: next }
                                : item,
                            ),
                          );
                        }}
                      />
                    )}
                  </label>
                ) : null}
                {field.type === 'asset' || field.type === 'image' ? (
                  <div className="collection-drawer-field-grid">
                    <label>
                      Allowed MIME types
                      <small className="muted">
                        Comma-separated, for example image/png, image/jpeg.
                      </small>
                      <input
                        value={field.validation?.allowedMimeTypes?.join(', ') ?? ''}
                        onChange={(event) => {
                          const allowedMimeTypes = event.target.value
                            .split(',')
                            .map((value) => value.trim())
                            .filter(Boolean);
                          setFieldDrafts((current) =>
                            current.map((item, itemIndex) =>
                              itemIndex === index
                                ? {
                                    ...item,
                                    validation: {
                                      ...item.validation,
                                      allowedMimeTypes: allowedMimeTypes.length
                                        ? allowedMimeTypes
                                        : undefined,
                                    },
                                  }
                                : item,
                            ),
                          );
                        }}
                      />
                    </label>
                    <label>
                      Maximum file size (bytes)
                      <input
                        min={1}
                        type="number"
                        value={field.validation?.maxFileSize ?? ''}
                        onChange={(event) => {
                          const raw = event.target.value;
                          setFieldDrafts((current) =>
                            current.map((item, itemIndex) =>
                              itemIndex === index
                                ? {
                                    ...item,
                                    validation: {
                                      ...item.validation,
                                      maxFileSize: raw === '' ? undefined : Number(raw),
                                    },
                                  }
                                : item,
                            ),
                          );
                        }}
                      />
                    </label>
                  </div>
                ) : null}
                {field.type === 'number' ||
                field.type === 'text' ||
                field.type === 'long-text' ||
                field.type === 'rich-text' ? (
                  <div className="collection-drawer-field-grid">
                    <label>
                      {field.type === 'number' ? 'Minimum' : 'Minimum length'}
                      <input
                        min={0}
                        type="number"
                        value={
                          field.type === 'number'
                            ? (field.validation?.min ?? '')
                            : (field.validation?.minLength ?? '')
                        }
                        onChange={(event) => {
                          const raw = event.target.value;
                          const patch =
                            field.type === 'number'
                              ? { min: raw === '' ? undefined : Number(raw) }
                              : { minLength: raw === '' ? undefined : Number(raw) };
                          setFieldDrafts((current) =>
                            current.map((item, itemIndex) =>
                              itemIndex === index
                                ? {
                                    ...item,
                                    validation: { ...item.validation, ...patch },
                                  }
                                : item,
                            ),
                          );
                        }}
                      />
                    </label>
                    <label>
                      {field.type === 'number' ? 'Maximum' : 'Maximum length'}
                      <input
                        min={0}
                        type="number"
                        value={
                          field.type === 'number'
                            ? (field.validation?.max ?? '')
                            : (field.validation?.maxLength ?? '')
                        }
                        onChange={(event) => {
                          const raw = event.target.value;
                          const patch =
                            field.type === 'number'
                              ? { max: raw === '' ? undefined : Number(raw) }
                              : { maxLength: raw === '' ? undefined : Number(raw) };
                          setFieldDrafts((current) =>
                            current.map((item, itemIndex) =>
                              itemIndex === index
                                ? {
                                    ...item,
                                    validation: { ...item.validation, ...patch },
                                  }
                                : item,
                            ),
                          );
                        }}
                      />
                    </label>
                  </div>
                ) : null}
                <div className="collection-drawer-field-grid">
                  <label>
                    Description
                    <input
                      value={field.description ?? ''}
                      onChange={(event) =>
                        setFieldDrafts((current) =>
                          current.map((item, itemIndex) =>
                            itemIndex === index
                              ? { ...item, description: event.target.value || undefined }
                              : item,
                          ),
                        )
                      }
                    />
                  </label>
                  <label>
                    Placeholder
                    <input
                      value={field.ui?.placeholder ?? ''}
                      onChange={(event) =>
                        setFieldDrafts((current) =>
                          current.map((item, itemIndex) =>
                            itemIndex === index
                              ? {
                                  ...item,
                                  ui: {
                                    ...item.ui,
                                    placeholder: event.target.value || undefined,
                                  },
                                }
                              : item,
                          ),
                        )
                      }
                    />
                  </label>
                  <label className="collection-required-toggle">
                    <span>Database behavior</span>
                    <span>
                      <input
                        checked={field.indexed}
                        onChange={(event) =>
                          setFieldDrafts((current) =>
                            current.map((item, itemIndex) =>
                              itemIndex === index
                                ? { ...item, indexed: event.target.checked }
                                : item,
                            ),
                          )
                        }
                        type="checkbox"
                      />
                      Indexed
                    </span>
                    <span>
                      <input
                        checked={field.unique}
                        onChange={(event) =>
                          setFieldDrafts((current) =>
                            current.map((item, itemIndex) =>
                              itemIndex === index
                                ? { ...item, unique: event.target.checked }
                                : item,
                            ),
                          )
                        }
                        type="checkbox"
                      />
                      Unique
                    </span>
                  </label>
                </div>
                {field.type === 'select' || field.type === 'multi-select' ? (
                  <label>
                    Options
                    <span className="muted small">
                      One option per line: value | Label
                    </span>
                    <textarea
                      rows={4}
                      value={(field.options ?? [])
                        .map((option) => `${option.value} | ${option.label}`)
                        .join('\n')}
                      onChange={(event) => {
                        const options = event.target.value
                          .split('\n')
                          .map((line) => line.trim())
                          .filter(Boolean)
                          .map((line) => {
                            const [value, ...labelParts] = line.split('|');
                            return {
                              value: value?.trim() ?? '',
                              label: labelParts.join('|').trim() || value?.trim() || '',
                            };
                          })
                          .filter((option) => option.value && option.label);
                        setFieldDrafts((current) =>
                          current.map((item, itemIndex) =>
                            itemIndex === index ? { ...item, options } : item,
                          ),
                        );
                      }}
                    />
                  </label>
                ) : null}
                {field.type === 'slug' ? (
                  <div className="collection-drawer-field-grid">
                    <label>
                      Auto slug source
                      <select
                        value={field.slugFromFieldKey ?? ''}
                        onChange={(event) =>
                          setFieldDrafts((current) =>
                            current.map((item, itemIndex) =>
                              itemIndex === index
                                ? {
                                    ...item,
                                    slugFromFieldKey: event.target.value || undefined,
                                  }
                                : item,
                            ),
                          )
                        }
                      >
                        <option value="">Manual slug</option>
                        {fieldDrafts
                          .filter((candidate) => candidate.id !== field.id)
                          .map((candidate) => (
                            <option key={candidate.id} value={candidate.key}>
                              {candidate.label || candidate.key}
                            </option>
                          ))}
                      </select>
                    </label>
                    <label className="collection-required-toggle">
                      <span>Slug behavior</span>
                      <span>
                        <input
                          checked={field.manualSlugOverride}
                          onChange={(event) =>
                            setFieldDrafts((current) =>
                              current.map((item, itemIndex) =>
                                itemIndex === index
                                  ? { ...item, manualSlugOverride: event.target.checked }
                                  : item,
                              ),
                            )
                          }
                          type="checkbox"
                        />
                        Allow manual override
                      </span>
                    </label>
                  </div>
                ) : null}
                {field.type === 'reference' ? (
                  <div className="collection-drawer-field-grid">
                    <label>
                      Target collection
                      <select
                        required
                        value={field.targetCollectionId ?? ''}
                        onChange={(event) =>
                          setFieldDrafts((current) =>
                            current.map((item, itemIndex) =>
                              itemIndex === index
                                ? { ...item, targetCollectionId: event.target.value }
                                : item,
                            ),
                          )
                        }
                      >
                        <option value="">Choose a collection</option>
                        {collections
                          .filter((candidate) => candidate.id !== selectedCollection?.id)
                          .map((candidate) => (
                            <option key={candidate.id} value={candidate.id}>
                              {candidate.name}
                            </option>
                          ))}
                      </select>
                    </label>
                    <label>
                      Cardinality
                      <select
                        value={field.cardinality ?? 'one'}
                        onChange={(event) =>
                          setFieldDrafts((current) =>
                            current.map((item, itemIndex) =>
                              itemIndex === index
                                ? {
                                    ...item,
                                    cardinality: event.target.value as 'one' | 'many',
                                  }
                                : item,
                            ),
                          )
                        }
                      >
                        <option value="one">One entry</option>
                        <option value="many">Many entries</option>
                      </select>
                    </label>
                  </div>
                ) : null}
              </details>
            </div>
          ))}
        </form>
      </Drawer>
      <Drawer
        eyebrow={selectedCollection?.name ?? 'Collection'}
        description="Entry drafts are immutable versions. Publish promotes one version atomically to public delivery."
        footer={
          <div className="form-actions">
            {entryReadOnly ? (
              <button
                className="button button-primary"
                disabled={!routeEntryId || !canUpdateEntry}
                onClick={() =>
                  routeEntryId && onEditEntry?.(routeEntryId, selectedCollection?.id)
                }
                type="button"
              >
                Edit entry
              </button>
            ) : (
              <button
                className="button button-primary"
                disabled={
                  !selectedCollection ||
                  (selectedEntry ? !canUpdateEntry : !canCreateEntry) ||
                  Boolean(routeEntryId && !selectedEntry)
                }
                form="entry-form"
                type="submit"
              >
                Save draft
              </button>
            )}
            <button
              className="button button-ghost"
              onClick={() => {
                setEntryDrawerOpen(false);
                onCloseEntry?.(routeEntryAction === 'edit' ? routeEntryId : undefined);
              }}
              type="button"
            >
              Cancel
            </button>
          </div>
        }
        onClose={() => {
          setEntryDrawerOpen(false);
          onCloseEntry?.(routeEntryAction === 'edit' ? routeEntryId : undefined);
        }}
        open={entryDrawerOpen}
        size="lg"
        title={
          selectedEntry
            ? 'Edit entry'
            : `New ${selectedCollection?.singularName ?? 'entry'}`
        }
      >
        <form
          className="collection-entry-form"
          id="entry-form"
          onSubmit={(event) => {
            void saveEntry(event).catch((caughtError: unknown) =>
              setError(
                collectionErrorMessage(caughtError, 'Entry values failed validation.'),
              ),
            );
          }}
        >
          {selectedCollection ? (
            <>
              <div className="collection-entry-form-intro">
                <div>
                  <span className="eyebrow">
                    {selectedEntry ? 'Edit record' : 'New record'}
                  </span>
                  <h3>
                    {selectedEntry
                      ? entryTitle(selectedEntry, selectedCollection)
                      : 'Untitled entry'}
                  </h3>
                </div>
                {selectedEntry ? <StatusBadge status={selectedEntry.status} /> : null}
              </div>
              {entryEditorMode === 'form' ? (
                <CollectionEntryFields
                  key={routeEntryId ?? 'new-entry'}
                  collection={selectedCollection}
                  collections={collections}
                  disabled={entryReadOnly}
                  advancedJsonDrafts={advancedJsonDrafts}
                  advancedJsonErrors={advancedJsonErrors}
                  entryDraft={entryDraft}
                  onAdvancedJsonChange={updateAdvancedJson}
                  onChange={setEntryDraft}
                  siteId={siteScopeId}
                  workspaceId={workspaceId}
                />
              ) : null}
              {!entryReadOnly ? (
                <div className="collection-entry-editor-mode">
                  <span className="muted small">Editor mode</span>
                  <button
                    className={
                      entryEditorMode === 'form'
                        ? 'button button-small button-primary'
                        : 'button button-small button-ghost'
                    }
                    onClick={() => setEntryEditorMode('form')}
                    type="button"
                  >
                    Form
                  </button>
                  <button
                    className={
                      entryEditorMode === 'json'
                        ? 'button button-small button-primary'
                        : 'button button-small button-ghost'
                    }
                    onClick={() => {
                      setEntryJsonDraft(JSON.stringify(entryDraft, null, 2));
                      setEntryEditorMode('json');
                    }}
                    type="button"
                  >
                    JSON
                  </button>
                </div>
              ) : null}
              {entryEditorMode === 'json' ? (
                <label>
                  Entry values (JSON)
                  <textarea
                    aria-describedby={entryJsonError ? 'entry-json-error' : undefined}
                    aria-label="Entry values JSON"
                    disabled={entryReadOnly}
                    onChange={(event) => {
                      const nextDraft = event.target.value;
                      setEntryJsonDraft(nextDraft);
                      const parsed = parseStructuredValue(nextDraft);
                      if (
                        parsed.success &&
                        parsed.value &&
                        typeof parsed.value === 'object' &&
                        !Array.isArray(parsed.value)
                      ) {
                        setEntryDraft(parsed.value as EntryDraft);
                        setAdvancedJsonDrafts(
                          structuredDrafts(
                            selectedCollection,
                            parsed.value as EntryDraft,
                          ),
                        );
                        setEntryJsonError(null);
                      } else {
                        setEntryJsonError(
                          'Enter a JSON object containing the entry values.',
                        );
                      }
                    }}
                    rows={14}
                    value={entryJsonDraft}
                  />
                  {entryJsonError ? (
                    <small id="entry-json-error" className="muted">
                      {entryJsonError}
                    </small>
                  ) : null}
                  {!selectedEntry ? (
                    <button
                      className="button button-small button-ghost"
                      onClick={() => {
                        const sample = sampleEntryValues(selectedCollection);
                        setEntryDraft(sample);
                        setEntryJsonDraft(JSON.stringify(sample, null, 2));
                        setAdvancedJsonDrafts(
                          structuredDrafts(selectedCollection, sample),
                        );
                        setEntryJsonError(null);
                      }}
                      type="button"
                    >
                      Load sample
                    </button>
                  ) : null}
                </label>
              ) : null}
            </>
          ) : null}
        </form>
      </Drawer>
      <Modal
        eyebrow="Destructive action"
        description="Archiving removes this collection from the active workspace. Existing page bindings may no longer resolve its data."
        footer={
          <div className="form-actions">
            <button
              className="button button-danger"
              onClick={() =>
                void archiveCollection().catch((caughtError: unknown) =>
                  setError(
                    collectionErrorMessage(
                      caughtError,
                      'Unable to archive this collection.',
                    ),
                  ),
                )
              }
              type="button"
            >
              Archive collection
            </button>
            <button
              className="button button-ghost"
              onClick={() => setArchiveDialogOpen(false)}
              type="button"
            >
              Cancel
            </button>
          </div>
        }
        onClose={() => setArchiveDialogOpen(false)}
        open={archiveDialogOpen}
        size="sm"
        title={`Archive ${selectedCollection?.name ?? 'collection'}?`}
      >
        <div className="collection-archive-warning">
          <span className="collection-archive-icon" aria-hidden="true">
            !
          </span>
          <div>
            <strong>This action cannot be undone from this screen.</strong>
            <p className="muted">
              Make sure no published page still depends on{' '}
              <strong>{selectedCollection?.name ?? 'this collection'}</strong>.
            </p>
          </div>
        </div>
      </Modal>
    </>
  );
}
