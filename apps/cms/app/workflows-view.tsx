'use client';

import {
  type Workflow,
  type WorkflowExecution,
  type WorkflowNode,
  type WorkflowRegistryEntry,
  type WorkflowStepExecution,
  type WorkflowVersion,
} from '@payload/contracts';
import { useEffect, useMemo, useState, type FormEvent } from 'react';

import { api } from './lib/api';

type Registry = {
  triggers: WorkflowRegistryEntry[];
  conditions: WorkflowRegistryEntry[];
  actions: WorkflowRegistryEntry[];
};

type WorkflowDetail = { execution: WorkflowExecution; steps: WorkflowStepExecution[] };

export function WorkflowsView({
  pageId,
  canManage,
  canPublish,
  canEnable,
  canReadExecutions,
  canRetry,
}: {
  workspaceId: string;
  pageId?: string;
  canManage: boolean;
  canPublish: boolean;
  canEnable: boolean;
  canReadExecutions: boolean;
  canRetry: boolean;
}) {
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [registry, setRegistry] = useState<Registry>({
    triggers: [],
    conditions: [],
    actions: [],
  });
  const [selectedId, setSelectedId] = useState('');
  const [version, setVersion] = useState<WorkflowVersion | null>(null);
  const [executions, setExecutions] = useState<WorkflowExecution[]>([]);
  const [selectedExecution, setSelectedExecution] = useState<WorkflowDetail | null>(null);
  const [name, setName] = useState('');
  const [scope, setScope] = useState<'workspace' | 'tenant' | 'page'>('workspace');
  const [selectedNodeId, setSelectedNodeId] = useState('');
  const [configText, setConfigText] = useState('{}');
  const [runPayload, setRunPayload] = useState('{}');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const selectedWorkflow = workflows.find((workflow) => workflow.id === selectedId);
  const definition = version?.definition;
  const selectedNode = definition?.nodes.find((node) => node.id === selectedNodeId);

  useEffect(() => {
    void load();
  }, [pageId]);

  useEffect(() => {
    if (pageId) setScope('page');
  }, [pageId]);

  useEffect(() => {
    if (!selectedWorkflow?.draftVersionId) {
      setVersion(null);
      return;
    }
    void loadVersion(selectedWorkflow.id, selectedWorkflow.draftVersionId);
  }, [selectedWorkflow?.draftVersionId, selectedWorkflow?.id]);

  useEffect(() => {
    if (!selectedNode) return;
    setConfigText(JSON.stringify(selectedNode.config, null, 2));
  }, [selectedNode]);

  async function load() {
    setError(null);
    try {
      const [list, nextRegistry] = await Promise.all([
        api.get<{ items: Workflow[] }>(
          `/workflows?limit=100${pageId ? `&pageId=${encodeURIComponent(pageId)}` : ''}`,
        ),
        api.get<Registry>('/workflows/registry'),
      ]);
      setWorkflows(list.items);
      setRegistry(nextRegistry);
      if (list.items[0]) setSelectedId((current) => current || list.items[0]!.id);
    } catch (caughtError) {
      setError(
        caughtError instanceof Error ? caughtError.message : 'Could not load workflows',
      );
    }
  }

  async function loadVersion(workflowId: string, versionId: string) {
    try {
      setVersion(
        await api.get<WorkflowVersion>(`/workflows/${workflowId}/versions/${versionId}`),
      );
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : 'Could not load workflow draft',
      );
    }
  }

  async function refreshExecutions() {
    if (!selectedId || !canReadExecutions) return;
    const response = await api.get<{ items: WorkflowExecution[] }>(
      `/workflow-executions?workflowId=${selectedId}&limit=50`,
    );
    setExecutions(response.items);
  }

  async function createWorkflow(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!name.trim()) return;
    await perform(async () => {
      const endpoint =
        scope === 'page' && pageId ? `/pages/${pageId}/workflows` : '/workflows';
      const created = await api.post<Workflow>(endpoint, {
        name: name.trim(),
        scope: scope === 'page' && pageId ? 'page' : scope,
        ...(scope === 'page' && pageId ? { pageId } : {}),
      });
      setWorkflows((current) => [created, ...current]);
      setSelectedId(created.id);
      setName('');
      setNotice('Workflow draft created.');
    });
  }

  async function saveDraft() {
    if (!selectedWorkflow || !definition || !canManage) return;
    await perform(async () => {
      const updated = await api.patch<Workflow>(`/workflows/${selectedWorkflow.id}`, {
        definition,
      });
      setWorkflows((current) =>
        current.map((item) => (item.id === updated.id ? updated : item)),
      );
      setNotice('Draft saved.');
    });
  }

  async function publish() {
    if (!selectedWorkflow || !canPublish) return;
    await perform(async () => {
      const updated = await api.post<Workflow>(
        `/workflows/${selectedWorkflow.id}/publish`,
      );
      setWorkflows((current) =>
        current.map((item) => (item.id === updated.id ? updated : item)),
      );
      setNotice('Workflow published.');
    });
  }

  async function toggleEnabled() {
    if (!selectedWorkflow || !canEnable) return;
    await perform(async () => {
      const updated = await api.post<Workflow>(
        `/workflows/${selectedWorkflow.id}/${selectedWorkflow.enabled ? 'disable' : 'enable'}`,
      );
      setWorkflows((current) =>
        current.map((item) => (item.id === updated.id ? updated : item)),
      );
      setNotice(updated.enabled ? 'Workflow enabled.' : 'Workflow disabled.');
    });
  }

  async function runWorkflow() {
    if (!selectedWorkflow || !selectedWorkflow.enabled) return;
    let payload: unknown;
    try {
      payload = JSON.parse(runPayload);
    } catch {
      setError('Run payload must be valid JSON.');
      return;
    }
    await perform(async () => {
      await api.post(`/workflows/${selectedWorkflow.id}/run`, payload);
      await refreshExecutions();
      setNotice('Workflow execution queued.');
    });
  }

  function addNode(entry: WorkflowRegistryEntry) {
    if (!definition || !canManage) return;
    const id = `${entry.type.replace(/[^a-zA-Z0-9]+/g, '-')}-${Date.now()}`;
    const category =
      entry.category === 'trigger'
        ? 'trigger'
        : entry.category === 'condition'
          ? 'condition'
          : 'action';
    if (category === 'trigger') {
      const triggerNode = definition.nodes.find((node) => node.category === 'trigger');
      if (!triggerNode) return;
      setVersion({
        ...version!,
        definition: {
          ...definition,
          trigger: { type: entry.type, config: {} },
          nodes: definition.nodes.map((node) =>
            node.id === triggerNode.id ? { ...node, type: entry.type, config: {} } : node,
          ),
        },
      });
      setSelectedNodeId(triggerNode.id);
      return;
    }
    const node: WorkflowNode = {
      id,
      type: entry.type,
      category,
      config: {},
      disabled: false,
    };
    const previous = definition.nodes.at(-1);
    setVersion({
      ...version!,
      definition: {
        ...definition,
        nodes: [...definition.nodes, node],
        edges: previous
          ? [
              ...definition.edges,
              {
                id: `edge-${Date.now()}`,
                source: previous.id,
                target: id,
                branch: 'always',
              },
            ]
          : definition.edges,
      },
    });
    setSelectedNodeId(id);
  }

  function updateSelectedConfig() {
    if (!version || !selectedNode) return;
    try {
      const config = JSON.parse(configText) as Record<string, unknown>;
      setVersion({
        ...version,
        definition: {
          ...version.definition,
          nodes: version.definition.nodes.map((node) =>
            node.id === selectedNode.id ? { ...node, config } : node,
          ),
        },
      });
      setNotice('Node configuration updated in draft.');
      setError(null);
    } catch {
      setError('Node configuration must be valid JSON.');
    }
  }

  function insertBinding(path: string) {
    if (!selectedNode) return;
    try {
      const config = JSON.parse(configText) as Record<string, unknown>;
      const key =
        selectedNode.category === 'condition'
          ? 'left'
          : selectedNode.type === 'mail.send'
            ? 'to'
            : 'value';
      setConfigText(
        JSON.stringify({ ...config, [key]: { kind: 'binding', path } }, null, 2),
      );
      setNotice(`Binding ${path} added to ${key}. Apply the node config to save it.`);
      setError(null);
    } catch {
      setError('Apply or reset the node JSON before using the variable picker.');
    }
  }

  async function openExecution(executionId: string) {
    setSelectedExecution(
      await api.get<WorkflowDetail>(`/workflow-executions/${executionId}`),
    );
  }

  async function retryExecution(executionId: string) {
    await perform(async () => {
      await api.post(`/workflow-executions/${executionId}/retry`, {});
      await refreshExecutions();
      await openExecution(executionId);
    });
  }

  async function perform(action: () => Promise<void>) {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await action();
    } catch (caughtError) {
      setError(
        caughtError instanceof Error ? caughtError.message : 'Workflow request failed',
      );
    } finally {
      setBusy(false);
    }
  }

  const configured = useMemo(
    () => (selectedNode ? Object.keys(selectedNode.config).length > 0 : false),
    [selectedNode],
  );

  return (
    <div className="workflow-page">
      <div className="page-heading">
        <div>
          <span className="eyebrow">Automation</span>
          <h1>Workflows</h1>
          <p className="muted">
            Connect {pageId ? 'this page’s events' : 'page events'}, conditions and
            capabilities without provider-specific logic.
          </p>
        </div>
        <button className="button button-ghost" onClick={() => void load()} type="button">
          Refresh
        </button>
      </div>
      {error ? (
        <div className="alert alert-error" role="alert">
          {error}
        </div>
      ) : null}
      {notice ? (
        <div className="alert alert-success" role="status">
          {notice}
        </div>
      ) : null}
      <div className="workflow-layout">
        <aside className="panel workflow-list-panel">
          <h2>Workflows</h2>
          {canManage ? (
            <form className="stack workflow-create-form" onSubmit={createWorkflow}>
              <input
                aria-label="Workflow name"
                onChange={(event) => setName(event.target.value)}
                placeholder="Workflow name"
                value={name}
              />
              <select
                aria-label="Workflow scope"
                onChange={(event) =>
                  setScope(event.target.value as 'workspace' | 'tenant' | 'page')
                }
                value={scope}
              >
                <option value="workspace">Workspace</option>
                <option value="tenant">Tenant</option>
                {pageId ? <option value="page">This page</option> : null}
              </select>
              <button
                className="button button-primary"
                disabled={busy || !name.trim()}
                type="submit"
              >
                New workflow
              </button>
            </form>
          ) : null}
          <div className="workflow-list">
            {workflows.map((workflow) => (
              <button
                className={
                  workflow.id === selectedId
                    ? 'workflow-list-item active'
                    : 'workflow-list-item'
                }
                key={workflow.id}
                onClick={() => setSelectedId(workflow.id)}
                type="button"
              >
                <span>
                  <strong>{workflow.name}</strong>
                  <small>
                    {workflow.scope} ·{' '}
                    {workflow.enabled
                      ? 'enabled'
                      : workflow.publishedVersionId
                        ? 'published'
                        : 'draft'}
                  </small>
                </span>
                <span aria-hidden="true">{workflow.enabled ? '●' : '○'}</span>
              </button>
            ))}
          </div>
        </aside>
        <section className="workflow-editor">
          {!selectedWorkflow || !definition ? (
            <div className="panel empty-state">
              <h2>Select a workflow</h2>
              <p className="muted">Create a workflow to open the graph editor.</p>
            </div>
          ) : (
            <>
              <div className="panel workflow-header">
                <div>
                  <span className="eyebrow">{selectedWorkflow.scope} workflow</span>
                  <h2>{selectedWorkflow.name}</h2>
                </div>
                <div className="button-row">
                  <button
                    className="button button-secondary"
                    disabled={busy || !canManage}
                    onClick={() => void saveDraft()}
                    type="button"
                  >
                    Save draft
                  </button>
                  <button
                    className="button button-secondary"
                    disabled={busy || !canPublish}
                    onClick={() => void publish()}
                    type="button"
                  >
                    Publish
                  </button>
                  <button
                    className="button button-primary"
                    disabled={busy || !canEnable || !selectedWorkflow.publishedVersionId}
                    onClick={() => void toggleEnabled()}
                    type="button"
                  >
                    {selectedWorkflow.enabled ? 'Disable' : 'Enable'}
                  </button>
                </div>
              </div>
              <div className="workflow-builder-grid">
                <aside className="panel workflow-palette">
                  <h3>Node palette</h3>
                  <Palette title="Triggers" entries={registry.triggers} onAdd={addNode} />
                  <Palette
                    title="Conditions"
                    entries={registry.conditions}
                    onAdd={addNode}
                  />
                  <Palette title="Actions" entries={registry.actions} onAdd={addNode} />
                </aside>
                <div aria-label="Workflow canvas" className="panel workflow-canvas">
                  <div className="workflow-canvas-toolbar">
                    <span className="muted small">
                      Canvas · {definition.nodes.length} nodes · {definition.edges.length}{' '}
                      edges
                    </span>
                    <span className="muted small">Pan/zoom-ready graph model</span>
                  </div>
                  <div className="workflow-node-stack">
                    {definition.nodes.map((node) => (
                      <button
                        className={
                          node.id === selectedNodeId
                            ? 'workflow-node selected'
                            : 'workflow-node'
                        }
                        key={node.id}
                        onClick={() => setSelectedNodeId(node.id)}
                        type="button"
                      >
                        <span className="workflow-node-kind">{node.category}</span>
                        <strong>{node.type}</strong>
                        <span
                          className={
                            Object.keys(node.config).length
                              ? 'workflow-node-state configured'
                              : 'workflow-node-state'
                          }
                        >
                          {Object.keys(node.config).length ? 'Configured' : 'Incomplete'}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
                <aside className="panel workflow-properties">
                  <h3>Properties</h3>
                  {selectedNode ? (
                    <div className="stack">
                      <div>
                        <span className="eyebrow">{selectedNode.category}</span>
                        <h4>{selectedNode.type}</h4>
                      </div>
                      <label>
                        Config JSON
                        <textarea
                          aria-label="Node configuration"
                          onChange={(event) => setConfigText(event.target.value)}
                          rows={10}
                          value={configText}
                        />
                      </label>
                      <button
                        className="button button-secondary"
                        disabled={!canManage}
                        onClick={updateSelectedConfig}
                        type="button"
                      >
                        Apply node config
                      </button>
                      <span className="muted small">
                        {configured ? 'Configured' : 'Incomplete'} · bindings use{' '}
                        <code>{'{{ trigger.field }}'}</code>
                      </span>
                      <div className="workflow-variable-picker">
                        <span className="eyebrow">Variable picker</span>
                        <span className="muted small">
                          Insert a typed binding into the selected node.
                        </span>
                        <div className="workflow-variable-list">
                          {[
                            'trigger.email',
                            'trigger.utm.source',
                            'trigger.pageId',
                            'steps.create-lead.lead.id',
                            'page.id',
                          ].map((path) => (
                            <button
                              className="workflow-variable-item"
                              key={path}
                              onClick={() => insertBinding(path)}
                              type="button"
                            >
                              {path}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  ) : (
                    <p className="muted">Select a node to configure it.</p>
                  )}
                </aside>
              </div>
              {canReadExecutions ? (
                <section className="panel workflow-executions-panel">
                  <div className="section-heading">
                    <div>
                      <span className="eyebrow">Observability</span>
                      <h3>Execution history</h3>
                    </div>
                    <div className="button-row">
                      <button
                        className="button button-ghost"
                        onClick={() => void refreshExecutions()}
                        type="button"
                      >
                        Load executions
                      </button>
                      <button
                        className="button button-secondary"
                        disabled={!selectedWorkflow.enabled}
                        onClick={() => void runWorkflow()}
                        type="button"
                      >
                        Run manual
                      </button>
                    </div>
                  </div>
                  <textarea
                    aria-label="Manual run payload"
                    className="workflow-run-payload"
                    onChange={(event) => setRunPayload(event.target.value)}
                    rows={2}
                    value={runPayload}
                  />
                  {executions.length ? (
                    <div className="workflow-execution-list">
                      {executions.map((execution) => (
                        <button
                          className="workflow-execution-row"
                          key={execution.id}
                          onClick={() => void openExecution(execution.id)}
                          type="button"
                        >
                          <span>
                            <strong>{execution.triggerType}</strong>
                            <small>
                              {new Date(execution.createdAt).toLocaleString()}
                            </small>
                          </span>
                          <span className={`status-${execution.status}`}>
                            {execution.status}
                          </span>
                        </button>
                      ))}
                    </div>
                  ) : (
                    <p className="muted">No executions loaded.</p>
                  )}
                  {selectedExecution ? (
                    <ExecutionDetail
                      detail={selectedExecution}
                      canRetry={canRetry}
                      onRetry={() => void retryExecution(selectedExecution.execution.id)}
                    />
                  ) : null}
                </section>
              ) : null}
            </>
          )}
        </section>
      </div>
    </div>
  );
}

function Palette({
  title,
  entries,
  onAdd,
}: {
  title: string;
  entries: WorkflowRegistryEntry[];
  onAdd: (entry: WorkflowRegistryEntry) => void;
}) {
  return (
    <div className="workflow-palette-group">
      <h4>{title}</h4>
      {entries.slice(0, 12).map((entry) => (
        <button
          className="workflow-palette-item"
          key={`${entry.category}:${entry.type}`}
          onClick={() => onAdd(entry)}
          type="button"
        >
          <span>{entry.label}</span>
          <small>{entry.type}</small>
        </button>
      ))}
    </div>
  );
}

function ExecutionDetail({
  detail,
  canRetry,
  onRetry,
}: {
  detail: WorkflowDetail;
  canRetry: boolean;
  onRetry: () => void;
}) {
  return (
    <div className="workflow-execution-detail">
      <div className="section-heading">
        <h4>Execution detail</h4>
        {detail.execution.status === 'failed' && canRetry ? (
          <button
            className="button button-small button-secondary"
            onClick={onRetry}
            type="button"
          >
            Retry failed execution
          </button>
        ) : null}
      </div>
      {detail.steps.map((step) => (
        <div className="workflow-step-row" key={step.id}>
          <span>{step.nodeId}</span>
          <span className={`status-${step.status}`}>{step.status}</span>
          <small>attempt {step.attempt}</small>
          {step.error ? (
            <small className="text-danger">{step.error.message}</small>
          ) : null}
        </div>
      ))}
    </div>
  );
}
