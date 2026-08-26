import { describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';

import {
  AuthPrincipalSchema,
  AnalyticsEventV1Schema,
  DEFAULT_PAGE_LIMIT,
  ErrorResponseSchema,
  HealthResponseSchema,
  MAX_PAGE_LIMIT,
  PAGE_PAYLOAD_MAX_NODES,
  PAGE_PAYLOAD_MAX_SERIALIZED_BYTES,
  PAGE_PAYLOAD_MAX_TREE_DEPTH,
  PagePayloadV1Schema,
  PagePayloadV2Schema,
  PagePayloadV3Schema,
  CreateIntegrationRequestSchema,
  CreateCustomDomainRequestSchema,
  FormSubmittedWebhookV1Schema,
  IntegrationSchema,
  UpdatePageSeoSettingsRequestSchema,
  apiVersion,
  deserializePagePayload,
  serializePagePayload,
  normalizeHostname,
  OrganizationSchema,
  OrganizationMembershipSchema,
  CreateOrganizationRequestSchema,
  SwitchAuthContextRequestSchema,
  type PageNode,
  PageExtensionInstanceSchema,
  PageCapabilityGraphSchema,
  PublishedPageBundleSchema,
} from './index';

function createPayload(children: PageNode[] = []) {
  return {
    version: 1 as const,
    metadata: {
      documentTitle: 'Launch your next idea',
      documentDescription: 'A focused landing page.',
    },
    root: {
      id: 'root',
      type: 'root' as const,
      props: {},
      children,
    },
  };
}

describe('foundation contracts', () => {
  it('accepts versioned browser analytics events and rejects PII-shaped fields', () => {
    const event = AnalyticsEventV1Schema.parse({
      version: 1,
      event: 'page.viewed',
      siteSlug: 'demo-site',
      pageSlug: 'launch-page',
      sessionId: randomUUID(),
      context: {
        referrer: 'https://example.com/path?token=redacted',
        utmSource: 'newsletter',
        deviceType: 'desktop',
      },
    });
    expect(event.event).toBe('page.viewed');
    expect(
      AnalyticsEventV1Schema.safeParse({
        ...event,
        email: 'visitor@example.com',
      }).success,
    ).toBe(false);
  });

  it('requires a stable published node target for click events', () => {
    expect(
      AnalyticsEventV1Schema.safeParse({
        version: 1,
        event: 'element.clicked',
        siteSlug: 'demo-site',
        pageSlug: 'launch-page',
        nodeId: 'cta-button',
        sessionId: randomUUID(),
      }).success,
    ).toBe(true);
    expect(
      AnalyticsEventV1Schema.safeParse({
        version: 1,
        event: 'element.clicked',
        siteSlug: 'demo-site',
        pageSlug: 'launch-page',
        nodeId: 'bad node',
        sessionId: randomUUID(),
      }).success,
    ).toBe(false);
  });

  it('keeps integration credentials outside response contracts', () => {
    const request = CreateIntegrationRequestSchema.parse({
      type: 'webhook',
      name: 'CRM',
      enabled: true,
      config: { url: 'https://example.com/hook', eventType: 'form.submitted' },
      secret: 'secret-value',
    });
    expect(request.secret).toBe('secret-value');
    expect(() =>
      IntegrationSchema.parse({
        id: randomUUID(),
        workspaceId: randomUUID(),
        name: 'CRM',
        type: 'webhook',
        enabled: true,
        config: {
          type: 'webhook',
          url: 'https://example.com/hook',
          eventType: 'form.submitted',
          secret: 'secret-value',
          secretConfigured: true,
        },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }),
    ).toThrow();
  });

  it('validates the versioned form.submitted webhook payload', () => {
    expect(
      FormSubmittedWebhookV1Schema.parse({
        event: 'form.submitted',
        version: 1,
        submissionId: randomUUID(),
        landingPageId: randomUUID(),
        formId: 'contact-form',
        submittedAt: new Date().toISOString(),
        data: { name: 'Jane', consent: true },
      }),
    ).toMatchObject({ event: 'form.submitted', version: 1 });
  });
  it('accepts an authenticated principal without coupling to a provider', () => {
    expect(
      AuthPrincipalSchema.parse({ subject: 'user-123', sessionId: 'session-456' }),
    ).toEqual({ subject: 'user-123', sessionId: 'session-456' });
  });

  it('validates the organization and membership foundation without payload coupling', () => {
    const organizationId = randomUUID();
    const organization = OrganizationSchema.parse({
      id: organizationId,
      name: 'Acme Corporation',
      slug: 'acme-corporation',
      status: 'active',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    expect(organization.status).toBe('active');
    expect(
      OrganizationMembershipSchema.parse({
        id: randomUUID(),
        organizationId,
        userId: 'admin@example.com',
        role: 'owner',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }).role,
    ).toBe('owner');
    expect(CreateOrganizationRequestSchema.parse({ name: 'Acme Corporation' })).toEqual({
      name: 'Acme Corporation',
    });
    expect(() =>
      SwitchAuthContextRequestSchema.parse({ organizationId, workspaceId: 'foreign' }),
    ).toThrow();
  });

  it('accepts a versioned health response', () => {
    const response = {
      service: 'api',
      status: 'ok' as const,
      timestamp: new Date().toISOString(),
      version: apiVersion,
    };

    expect(HealthResponseSchema.parse(response)).toEqual(response);
  });

  it('rejects an error envelope without a stable code', () => {
    expect(() => ErrorResponseSchema.parse({ error: { message: 'broken' } })).toThrow();
  });

  it('accepts a realistic nested PagePayload V1 with direct node discrimination', () => {
    const payload = createPayload([
      {
        id: 'hero',
        type: 'section' as const,
        props: {},
        style: { base: { padding: '64px 24px', backgroundColor: '#111827' } },
        children: [
          {
            id: 'hero-content',
            type: 'container' as const,
            props: {},
            children: [
              {
                id: 'hero-title',
                type: 'text' as const,
                props: { text: 'Launch your next idea' },
                children: [],
              },
              {
                id: 'hero-cta',
                type: 'button' as const,
                props: {
                  label: 'Get started',
                  href: 'https://example.com/start',
                  target: '_self' as const,
                },
                children: [],
              },
            ],
          },
        ],
      },
    ]);

    expect(PagePayloadV1Schema.parse(payload)).toEqual(payload);
  });

  it('rejects the removed props.kind discriminator and duplicate ids', () => {
    const invalidPayload = {
      version: 1,
      metadata: { documentTitle: 'Invalid' },
      root: {
        id: 'root',
        type: 'root',
        props: {},
        children: [
          {
            id: 'copy',
            type: 'text',
            props: { text: 'One', kind: 'text' },
            children: [],
          },
          {
            id: 'copy',
            type: 'text',
            props: { text: 'Two' },
            children: [],
          },
        ],
      },
    };

    expect(PagePayloadV1Schema.safeParse(invalidPayload).success).toBe(false);
  });

  it('allows the documented safe URL policy and rejects unsafe schemes', () => {
    const validHrefs = [
      'https://example.com',
      'http://example.com',
      '/pricing',
      '#contact',
      'mailto:hello@example.com',
      'tel:+84901234567',
    ];

    validHrefs.forEach((href, index) => {
      const result = PagePayloadV1Schema.safeParse(
        createPayload([
          {
            id: `section-${index}`,
            type: 'section',
            props: {},
            children: [
              {
                id: `button-${index}`,
                type: 'button',
                props: { label: 'Open', href, target: '_self' },
                children: [],
              },
            ],
          },
        ]),
      );
      expect(result.success, href).toBe(true);
    });

    expect(
      PagePayloadV1Schema.safeParse(
        createPayload([
          {
            id: 'unsafe',
            type: 'section',
            props: {},
            children: [
              {
                id: 'unsafe-button',
                type: 'button',
                props: { label: 'Unsafe', href: 'javascript:alert(1)', target: '_self' },
                children: [],
              },
            ],
          },
        ]),
      ).success,
    ).toBe(false);
    ['ftp://example.com', '//external.example.com', 'https://'].forEach((href) => {
      const result = PagePayloadV1Schema.safeParse(
        createPayload([
          {
            id: `invalid-${href.length}`,
            type: 'section',
            props: {},
            children: [
              {
                id: `invalid-button-${href.length}`,
                type: 'button',
                props: { label: 'Invalid', href, target: '_self' },
                children: [],
              },
            ],
          },
        ]),
      );
      expect(result.success, href).toBe(false);
    });
    expect(
      PagePayloadV1Schema.safeParse(
        createPayload([
          {
            id: 'image-section',
            type: 'section',
            props: {},
            children: [
              {
                id: 'image',
                type: 'image',
                props: { src: 'data:image/png;base64,abc', alt: 'Unsafe' },
                children: [],
              },
            ],
          },
        ]),
      ).success,
    ).toBe(false);
  });

  it('rejects oversized nodes, deep trees, long URLs and large payloads', () => {
    const tooManyNodes = createPayload(
      Array.from({ length: PAGE_PAYLOAD_MAX_NODES }, (_, index) => ({
        id: `section-${index}`,
        type: 'section' as const,
        props: {},
        children: [],
      })),
    );
    expect(PagePayloadV1Schema.safeParse(tooManyNodes).success).toBe(false);

    const deepPayload = createPayload();
    let current: PageNode = deepPayload.root;
    for (let depth = 2; depth <= PAGE_PAYLOAD_MAX_TREE_DEPTH + 1; depth += 1) {
      const type: 'section' | 'container' =
        current.type === 'root' || current.type === 'container' ? 'section' : 'container';
      const child: PageNode = { id: `depth-${depth}`, type, props: {}, children: [] };
      current.children.push(child);
      current = child;
    }
    expect(PagePayloadV1Schema.safeParse(deepPayload).success).toBe(false);

    const tooLongUrl = createPayload([
      {
        id: 'long-url',
        type: 'button',
        props: { label: 'Open', href: `/${'a'.repeat(2_048)}`, target: '_self' },
        children: [],
      },
    ]);
    expect(PagePayloadV1Schema.safeParse(tooLongUrl).success).toBe(false);

    const largePayload = createPayload(
      Array.from({ length: 30 }, (_, index) => ({
        id: `large-section-${index}`,
        type: 'section' as const,
        props: {},
        children: [
          {
            id: `large-text-${index}`,
            type: 'text' as const,
            props: { text: 'x'.repeat(10_000) },
            children: [],
          },
        ],
      })),
    );
    const largeResult = PagePayloadV1Schema.safeParse(largePayload);
    expect(largeResult.success).toBe(false);
    expect(JSON.stringify(largePayload).length).toBeGreaterThan(
      PAGE_PAYLOAD_MAX_SERIALIZED_BYTES,
    );
  });

  it('round-trips through JSON serialization and exposes bounded pagination defaults', () => {
    const payload = PagePayloadV1Schema.parse({
      version: 1,
      metadata: { documentTitle: 'Simple page' },
      root: { id: 'root', type: 'root', props: {}, children: [] },
    });

    const serialized = serializePagePayload(payload);

    expect(deserializePagePayload(serialized)).toEqual(payload);
    expect(serialized).not.toContain('GrapesJS');
    expect(DEFAULT_PAGE_LIMIT).toBe(20);
    expect(MAX_PAGE_LIMIT).toBe(100);
  });

  it('accepts a V2 form node while keeping the V1 schema closed', () => {
    const formPayload = {
      version: 2 as const,
      metadata: { documentTitle: 'Form page' },
      root: {
        id: 'root',
        type: 'root' as const,
        props: {},
        children: [
          {
            id: 'section',
            type: 'section' as const,
            props: {},
            children: [
              {
                id: 'contact-form',
                type: 'form' as const,
                props: {
                  fields: [
                    {
                      id: 'name',
                      type: 'text' as const,
                      label: 'Name',
                      name: 'name',
                      required: true,
                    },
                    {
                      id: 'email',
                      type: 'email' as const,
                      label: 'Email',
                      name: 'email',
                      required: true,
                    },
                  ],
                  submitLabel: 'Send',
                  successMessage: 'Thanks',
                },
                children: [],
              },
            ],
          },
        ],
      },
    };

    expect(PagePayloadV2Schema.parse(formPayload)).toEqual(formPayload);
    expect(PagePayloadV1Schema.safeParse(formPayload).success).toBe(false);
  });

  it('rejects duplicate form identities and invalid option values', () => {
    const invalid = {
      version: 2,
      metadata: { documentTitle: 'Invalid form' },
      root: {
        id: 'root',
        type: 'root',
        props: {},
        children: [
          {
            id: 'section',
            type: 'section',
            props: {},
            children: [
              {
                id: 'form',
                type: 'form',
                props: {
                  fields: [
                    {
                      id: 'choice',
                      type: 'select',
                      label: 'Choice',
                      name: 'choice',
                      required: false,
                      options: [
                        { value: 'same', label: 'One' },
                        { value: 'same', label: 'Two' },
                      ],
                    },
                    {
                      id: 'choice',
                      type: 'text',
                      label: 'Duplicate',
                      name: 'choice',
                      required: false,
                    },
                  ],
                  submitLabel: 'Send',
                  successMessage: 'Thanks',
                },
                children: [],
              },
            ],
          },
        ],
      },
    };

    expect(PagePayloadV2Schema.safeParse(invalid).success).toBe(false);
  });

  it('keeps V1/V2 closed and round-trips the extension-capable V3 countdown node', () => {
    const payload = {
      version: 3 as const,
      metadata: { documentTitle: 'Countdown page' },
      root: {
        id: 'root',
        type: 'root' as const,
        props: {},
        children: [
          {
            id: 'hero',
            type: 'section' as const,
            props: {},
            children: [
              {
                id: 'launch',
                type: 'countdown' as const,
                props: {
                  label: 'Launches soon',
                  targetAt: '2030-01-01T00:00:00.000Z',
                },
                children: [],
              },
            ],
          },
        ],
      },
    };
    expect(PagePayloadV3Schema.parse(payload)).toEqual(payload);
    expect(PagePayloadV1Schema.safeParse(payload).success).toBe(false);
    expect(PagePayloadV2Schema.safeParse(payload).success).toBe(false);
    expect(JSON.parse(serializePagePayload(payload))).toEqual(payload);
  });

  it('normalizes public hostnames and rejects URL-shaped input', () => {
    expect(normalizeHostname(' Example.COM. ')).toBe('example.com');
    expect(normalizeHostname('https://example.com/path')).toBeNull();
    expect(normalizeHostname('example.com:443')).toBeNull();
    expect(normalizeHostname('localhost')).toBeNull();
    expect(normalizeHostname('promo.example.com')).toBe('promo.example.com');
    expect(
      CreateCustomDomainRequestSchema.safeParse({ hostname: 'example.com' }).success,
    ).toBe(true);
    expect(
      UpdatePageSeoSettingsRequestSchema.safeParse({
        title: 'Safe title',
        canonicalUrl: 'javascript:alert(1)',
      }).success,
    ).toBe(false);
  });

  it('models page extension instances and rejects executable runtime descriptors', () => {
    const instance = PageExtensionInstanceSchema.parse({
      id: randomUUID(),
      pageId: randomUUID(),
      extensionId: 'demo-builder-countdown',
      enabled: true,
      configuration: {},
      capabilities: ['builder.element.countdown'],
      runtimeIds: ['countdown.runtime'],
      createdAt: '2026-08-25T00:00:00.000Z',
      updatedAt: '2026-08-25T00:00:00.000Z',
    });
    expect(instance.runtimeIds).toEqual(['countdown.runtime']);
    expect(
      PageCapabilityGraphSchema.safeParse({
        pageId: instance.pageId,
        extensionIds: [instance.extensionId],
        capabilities: instance.capabilities,
        runtimeIds: instance.runtimeIds,
        dataBindings: [],
        slots: ['PAGE_BODY_END'],
      }).success,
    ).toBe(true);
    expect(
      PageCapabilityGraphSchema.safeParse({
        pageId: instance.pageId,
        extensionIds: ['<script>'],
        capabilities: [],
        runtimeIds: [],
        dataBindings: [],
        slots: [],
      }).success,
    ).toBe(false);
  });

  it('models a published composition bundle without allowing secrets or code', () => {
    const pageId = randomUUID();
    const bundle = PublishedPageBundleSchema.parse({
      bundleVersion: 1,
      pageId,
      versionNumber: 3,
      payload: createPayload(),
      attachments: [],
      bindings: [],
      actions: [],
      resources: [],
      extensions: [],
      extensionVersions: {},
      capabilities: [],
      runtimeIds: [],
      styleAssetIds: [],
      compiledAt: '2026-08-25T00:00:00.000Z',
    });
    expect(bundle.pageId).toBe(pageId);
    expect(
      PublishedPageBundleSchema.safeParse({ ...bundle, stripeSecret: 'secret' }).success,
    ).toBe(false);
  });
});
