# How to Add a Workflow Capability

Workflow integrations are trusted extension code discovered through the existing contribution and
capability registries. A tenant workflow stores only the contribution type, node configuration and
optional connection id.

1. Define a normalized `trigger`, `condition` or `action` contribution with a stable id, label,
   capability and optional config/output metadata.
2. Declare the capability in the extension manifest and register the trusted provider from the
   extension `register` callback. Use `ContributionRegistry.attachProvider` when the contribution
   metadata was registered from the manifest.
3. Implement the provider against `WorkflowExecutionContext`. Read only the tenant/workspace/page
   identity and upstream step outputs it needs; resolve credentials with the server-side connection
   resolver.
4. Validate input and return a bounded JSON result. Mark temporary failures as retryable with
   `WorkflowActionFailure`; reject invalid configuration without retry.
5. Add the relevant tenant permission to the manifest and enforce it in the contribution/API
   boundary. Do not put secrets, headers, SQL, module paths or executable source in config/output.
6. Add registry, graph, provider, tenant-isolation and execution tests. Confirm the node appears in
   `GET /api/v1/workflows/registry` and can be selected in the CMS palette.

Example action metadata:

```ts
{
  type: 'action',
  id: 'crm.sync-lead',
  label: 'Sync lead to CRM',
  capability: 'crm.leads.write',
  permissions: ['lead.read'],
}
```

The workflow core does not import a CRM, mail, payment or analytics vendor. The extension owns the
provider and the connection contract; the workflow engine only resolves the capability and records
sanitized step state. See [Phase 14](../phases/phase-14.md) for graph semantics, versioning,
retries, idempotency and the current process-worker limitation.
