import type { WorkflowDefinitionVersion } from '@payload/contracts';

/**
 * Safe, provider-neutral examples used by the builder documentation and
 * contract tests. They are templates, not tenant data and are never seeded
 * into customer workspaces automatically.
 */
export const referenceWorkflowDefinitions: Array<{
  name: string;
  description: string;
  definition: WorkflowDefinitionVersion;
}> = [
  {
    name: 'Lead capture and qualification',
    description: 'Create a lead when a submitted form contains an email address.',
    definition: {
      trigger: { type: 'form.submitted', config: {} },
      nodes: [
        {
          id: 'trigger',
          type: 'form.submitted',
          category: 'trigger',
          config: {},
          disabled: false,
        },
        {
          id: 'has-email',
          type: 'exists',
          category: 'condition',
          config: {
            expression: {
              operator: 'exists',
              left: { kind: 'binding', path: 'trigger.email' },
            },
          },
          disabled: false,
        },
        {
          id: 'create-lead',
          type: 'lead.create',
          category: 'action',
          config: {
            email: { kind: 'binding', path: 'trigger.email' },
            source: { kind: 'literal', value: 'workflow' },
          },
          disabled: false,
        },
        {
          id: 'track-missing-email',
          type: 'analytics.track',
          category: 'action',
          config: { event: { kind: 'literal', value: 'lead_missing_email' } },
          disabled: false,
        },
      ],
      edges: [
        {
          id: 'edge-trigger-condition',
          source: 'trigger',
          target: 'has-email',
          branch: 'always',
        },
        {
          id: 'edge-email-yes',
          source: 'has-email',
          target: 'create-lead',
          branch: 'true',
        },
        {
          id: 'edge-email-no',
          source: 'has-email',
          target: 'track-missing-email',
          branch: 'false',
        },
      ],
      retryPolicy: { maxAttempts: 3, initialDelayMs: 500, backoffMultiplier: 2 },
    },
  },
  {
    name: 'Delayed lead follow-up',
    description: 'Wait before handing a lead payload to the mail capability.',
    definition: {
      trigger: { type: 'form.submitted', config: {} },
      nodes: [
        {
          id: 'trigger',
          type: 'form.submitted',
          category: 'trigger',
          config: {},
          disabled: false,
        },
        {
          id: 'delay',
          type: 'delay',
          category: 'action',
          config: { amount: 1, unit: 'days' },
          disabled: false,
        },
        {
          id: 'send-follow-up',
          type: 'mail.send',
          category: 'action',
          config: {
            template: { kind: 'literal', value: 'lead-follow-up' },
            to: { kind: 'binding', path: 'trigger.email' },
          },
          disabled: false,
        },
      ],
      edges: [
        {
          id: 'edge-trigger-delay',
          source: 'trigger',
          target: 'delay',
          branch: 'always',
        },
        {
          id: 'edge-delay-mail',
          source: 'delay',
          target: 'send-follow-up',
          branch: 'always',
        },
      ],
      retryPolicy: { maxAttempts: 3, initialDelayMs: 1_000, backoffMultiplier: 2 },
    },
  },
  {
    name: 'CTA analytics',
    description: 'Track a button interaction through the analytics capability.',
    definition: {
      trigger: { type: 'button.clicked', config: {} },
      nodes: [
        {
          id: 'trigger',
          type: 'button.clicked',
          category: 'trigger',
          config: {},
          disabled: false,
        },
        {
          id: 'track-cta',
          type: 'analytics.track',
          category: 'action',
          config: {
            event: { kind: 'literal', value: 'cta_clicked' },
            nodeId: { kind: 'binding', path: 'trigger.nodeId' },
          },
          disabled: false,
        },
      ],
      edges: [
        {
          id: 'edge-trigger-track',
          source: 'trigger',
          target: 'track-cta',
          branch: 'always',
        },
      ],
      retryPolicy: { maxAttempts: 2, initialDelayMs: 250, backoffMultiplier: 2 },
    },
  },
  {
    name: 'Payment order handoff',
    description:
      'Create an order and notify commerce capabilities after payment completion.',
    definition: {
      trigger: { type: 'payment.completed', config: {} },
      nodes: [
        {
          id: 'trigger',
          type: 'payment.completed',
          category: 'trigger',
          config: {},
          disabled: false,
        },
        {
          id: 'create-order',
          type: 'order.create',
          category: 'action',
          config: { paymentId: { kind: 'binding', path: 'trigger.paymentId' } },
          disabled: false,
        },
        {
          id: 'notify',
          type: 'webhook.send',
          category: 'action',
          config: { event: { kind: 'literal', value: 'order_created' } },
          disabled: false,
        },
      ],
      edges: [
        {
          id: 'edge-payment-order',
          source: 'trigger',
          target: 'create-order',
          branch: 'always',
        },
        {
          id: 'edge-order-notify',
          source: 'create-order',
          target: 'notify',
          branch: 'always',
        },
      ],
      retryPolicy: { maxAttempts: 3, initialDelayMs: 1_000, backoffMultiplier: 2 },
    },
  },
];
