import {
  ExtensionCapabilities,
  ExtensionIds,
  ExtensionPermissionKeys,
  type ExtensionManifest,
  type PlatformEventMap,
} from '@payload/contracts';

import type {
  ExtensionRegistrationContext,
  PlatformExtension,
} from './extension-registry';

const demoConfiguration = {
  fields: [
    {
      key: 'endpoint',
      label: 'Mock endpoint',
      type: 'url' as const,
      required: false,
      description: 'Stored as tenant configuration; no request is sent in the demo.',
    },
    {
      key: 'secret',
      label: 'Signing secret',
      type: 'secret' as const,
      required: false,
    },
  ],
};

export const demoBuilderExtension: PlatformExtension = {
  manifest: {
    id: ExtensionIds.DemoBuilder,
    name: 'Countdown Builder Element',
    version: '1.0.0',
    apiVersion: '1',
    description: 'Adds a safe, compile-time Countdown element to the visual builder.',
    capabilities: [
      ExtensionCapabilities.BuilderElement,
      ExtensionCapabilities.BuilderCountdown,
    ],
    dependencies: [],
    permissions: [ExtensionPermissionKeys.Read, ExtensionPermissionKeys.Manage],
    contributions: {
      builder: {
        elements: [
          {
            id: 'countdown',
            label: 'Countdown',
            nodeType: 'countdown',
            capability: ExtensionCapabilities.BuilderCountdown,
            propertyKeys: ['label', 'targetAt'],
          },
        ],
        blocks: [],
        actions: [],
        dataBindings: [],
      },
      page: {
        settings: [],
        hooks: ['page.beforePublish', 'page.published'],
        slots: ['PAGE_BODY_END'],
      },
      renderer: {
        runtimeIds: ['countdown.runtime'],
        styleAssetIds: [],
        slots: ['PAGE_BODY_END'],
      },
      publishing: {
        validations: ['countdown.publish'],
        beforePublish: true,
        afterPublish: true,
      },
    },
  },
};

export class DemoAnalyticsExtension implements PlatformExtension {
  readonly manifest: ExtensionManifest = {
    id: ExtensionIds.DemoAnalytics,
    name: 'Demo Analytics Subscriber',
    version: '1.0.0',
    apiVersion: '1' as const,
    description: 'Subscribes to page publication and form submission events.',
    capabilities: [ExtensionCapabilities.AnalyticsEvents],
    dependencies: [],
    permissions: [ExtensionPermissionKeys.Read],
    contributions: {
      page: {
        settings: [],
        hooks: ['page.published', 'form.submitted'],
        slots: [],
      },
      analytics: { events: ['page-view', 'form-submit'], metrics: [], trackers: [] },
    },
  };

  private readonly received: Array<{
    eventName: 'page.published' | 'form.submitted';
    tenantId: string;
  }> = [];
  private unsubscribe: Array<() => void> = [];

  register(context: ExtensionRegistrationContext): void {
    this.unsubscribe = [
      context.events.subscribe(
        'page.published',
        (event) => this.record('page.published', event),
        { extensionId: this.manifest.id },
      ),
      context.events.subscribe(
        'form.submitted',
        (event) => this.record('form.submitted', event),
        { extensionId: this.manifest.id },
      ),
    ];
  }

  dispose(): void {
    this.unsubscribe.forEach((unsubscribe) => unsubscribe());
    this.unsubscribe = [];
  }

  health(): 'healthy' {
    return 'healthy';
  }

  getReceivedEvents(): readonly { eventName: string; tenantId: string }[] {
    return [...this.received];
  }

  private record(
    eventName: 'page.published' | 'form.submitted',
    event: PlatformEventMap['page.published'] | PlatformEventMap['form.submitted'],
  ): void {
    this.received.push({ eventName, tenantId: event.tenantId });
  }
}

export class DemoWebhookExtension implements PlatformExtension {
  readonly manifest: ExtensionManifest = {
    id: ExtensionIds.DemoWebhook,
    name: 'Demo Webhook Integration',
    version: '1.0.0',
    apiVersion: '1' as const,
    description: 'Registers a tenant-aware mock webhook provider without external calls.',
    capabilities: [ExtensionCapabilities.IntegrationWebhook],
    dependencies: [],
    permissions: [ExtensionPermissionKeys.Read, ExtensionPermissionKeys.Manage],
    configuration: demoConfiguration,
    contributions: {
      forms: {
        fields: [],
        validators: [],
        processors: ['demo-webhook.processor'],
        destinations: ['demo-webhook.destination'],
      },
      automation: {
        triggers: ['form.submitted'],
        conditions: [],
        actions: ['demo-webhook.send'],
      },
    },
  };

  private readonly deliveries: string[] = [];
  private unsubscribe: (() => void) | undefined;

  register(context: ExtensionRegistrationContext): void {
    context.contributions.attachProvider(
      'action',
      'demo-webhook.send',
      this.manifest.id,
      {
        execute: async (_workflowContext: unknown, input: Record<string, unknown>) => ({
          accepted: true,
          provider: this.manifest.id,
          input,
        }),
      },
    );
    context.capabilities.register(
      ExtensionCapabilities.IntegrationWebhook,
      this.manifest.id,
      {
        execute: (event: PlatformEventMap['form.submitted']) => this.deliver(event),
      },
    );
    this.unsubscribe = context.events.subscribe(
      'form.submitted',
      (event) => {
        this.deliver(event);
      },
      { extensionId: this.manifest.id },
    );
  }

  dispose(): void {
    this.unsubscribe?.();
    this.unsubscribe = undefined;
  }

  health(): 'healthy' {
    return 'healthy';
  }

  getDeliveries(): readonly string[] {
    return [...this.deliveries];
  }

  private deliver(event: PlatformEventMap['form.submitted']): void {
    this.deliveries.push(`${event.tenantId}:${event.submissionId}`);
  }
}
