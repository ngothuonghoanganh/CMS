# 01 — Product and Domain Context

## 1. Product vision

The product is a platform where a company can build and operate landing pages without editing application source code. A user should be able to open the CMS, create a page, compose content visually, configure forms/integrations, preview responsive behavior, publish, and later update content safely.

The target experience is closer to a visual publishing product than a traditional admin panel.

## 2. Primary user groups

### Platform operator

Responsible for platform health, tenant provisioning, global capabilities, deployment, observability, and tenant-database management.

### Company administrator

Responsible for company users, landing pages, forms, leads, integrations, domains/settings, publishing, and permissions within one tenant.

### Designer / advanced editor

Uses the full visual builder, layout controls, styling, responsive overrides, reusable components, and advanced page settings.

### Content editor

Changes copy, media, links, SEO/content fields, and publishes approved changes without being able to break page layout. This should eventually become a deliberately simplified mode.

## 3. Core domain concepts

### Tenant / Company

A tenant is a company boundary. Tenant identity affects authentication context, database resolution, authorization, cache keys, background work, integrations, logs, and all business data.

### User

A user is authenticated and operates within an authorized company context. Role/permission checks must be server-enforced, not only hidden in the UI.

### Page

A page is a managed landing-page entity. It should contain metadata and a versioned document/payload representing editable content and structure.

Suggested conceptual fields:

- id;
- tenant/company id;
- name;
- slug/path;
- status;
- document version;
- draft document;
- published snapshot/version;
- SEO metadata;
- created/updated metadata;
- revision number.

### PageDocument

The canonical editable representation of a landing page. It should be serializable, versioned, deterministic, and independent from temporary React component state.

### Component / Element

A typed node in the PageDocument such as section, container, text, image, button, form, grid, column, spacer, map, embed, etc.

Each component type should have a registered contract describing defaults, properties, style capabilities, allowed parent/child relationships, renderer behavior, and migrations.

### Form

A page component/configuration that captures visitor input. A form definition and its rendered component must stay compatible.

### Submission / Lead

A submission is the captured result of a form interaction. A lead may be a higher-level business object derived from or associated with submissions depending on current domain design. The implementation must make the distinction explicit.

### Integration

An external service configuration, for example mail, webhook, social/contact channel, CRM, or notification provider. Integrations should be modular and tenant-scoped.

### Renderer

The public runtime that converts a published PageDocument into the visitor-facing page. It must not invent a separate interpretation of component contracts.

## 4. Product workflows that define success

Feature completion should be evaluated using workflows such as:

1. Create page → add content → save → reload → content remains.
2. Add nested components → reorder → reparent → save → reload → structure remains.
3. Change styling → preview desktop/tablet/mobile → save → published renderer matches preview.
4. Add form → configure fields → preview → publish → submit → lead/submission stored correctly.
5. Edit existing content as a content editor → publish without breaking layout.
6. Tenant A user → cannot access any Tenant B page, lead, user, integration, asset, or API response.

## 5. Product quality bar

The target is not merely functional correctness. The platform should feel predictable:

- no unexpected API storms;
- no disappearing changes;
- no ambiguous drag/drop target;
- no unexplained properties;
- no editor/renderer mismatch;
- no excessive screen length for ordinary CRUD tasks;
- no layout overflow on supported CMS breakpoints;
- no tenant ambiguity.

## 6. Extensibility principle

New component types, integrations, and capabilities should be added through registries/contracts/modules rather than modifying unrelated core code.

A feature is considered extensible when adding a new implementation requires touching the smallest expected set of files and does not require changing every switch statement across CMS, API, and renderer.
