import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import {
  IntegrationDeliveryListQuerySchema,
  IntegrationDeliveryListResponseSchema,
  IntegrationDeliverySchema,
  PagePayloadV2Schema,
  PaginationSchema,
  type FormNode,
  type PageNodeV2,
  type IntegrationDelivery,
  type IntegrationDeliveryListQuery,
  type IntegrationDeliveryListResponse,
} from '@payload/contracts';

import { env } from '../config/env';
import { platformLogger } from '../common/logging/platform-logger';
import { IntegrationSecretVault } from './integration-secret-vault';
import { FormSubmissionRecord } from '../persistence/schemas/form-submission.schema';
import {
  IntegrationDeliveryRecord,
  type IntegrationDeliveryDocument,
} from '../persistence/schemas/integration-delivery.schema';
import { IntegrationRecord } from '../persistence/schemas/integration.schema';
import { LandingPageRecord } from '../persistence/schemas/landing-page.schema';
import { PageVersionRecord } from '../persistence/schemas/page-version.schema';
import { FormIntegrationBindingRecord } from '../persistence/schemas/form-integration-binding.schema';
import type {
  DeliveryOutcome,
  DeliverySubmissionContext,
  IntegrationAdapter,
} from './integrations/integration.types';

export const INTEGRATION_ADAPTERS = Symbol('INTEGRATION_ADAPTERS');
export const DELIVERY_MAX_ATTEMPTS = 4;
const DELIVERY_BATCH_SIZE = 20;
const DELIVERY_LEASE_MS = 60_000;
const PROCESS_INTERVAL_MS = 1_000;
const RETRY_DELAYS_MS = [0, 30_000, 120_000, 600_000] as const;

@Injectable()
export class IntegrationDispatcher implements OnModuleInit, OnModuleDestroy {
  private readonly adaptersByType: Map<IntegrationRecord['type'], IntegrationAdapter>;
  private processing = false;
  private timer?: ReturnType<typeof setInterval>;

  constructor(
    @InjectModel(IntegrationDeliveryRecord.name)
    private readonly deliveryModel: Model<IntegrationDeliveryRecord>,
    @InjectModel(FormIntegrationBindingRecord.name)
    private readonly bindingModel: Model<FormIntegrationBindingRecord>,
    @InjectModel(IntegrationRecord.name)
    private readonly integrationModel: Model<IntegrationRecord>,
    @InjectModel(FormSubmissionRecord.name)
    private readonly submissionModel: Model<FormSubmissionRecord>,
    @InjectModel(LandingPageRecord.name)
    private readonly pageModel: Model<LandingPageRecord>,
    @InjectModel(PageVersionRecord.name)
    private readonly versionModel: Model<PageVersionRecord>,
    @Inject(INTEGRATION_ADAPTERS) adapters: IntegrationAdapter[],
  ) {
    this.adaptersByType = new Map(adapters.map((adapter) => [adapter.type, adapter]));
  }

  onModuleInit(): void {
    void this.processPending();
    this.timer = setInterval(() => void this.processPending(), PROCESS_INTERVAL_MS);
    this.timer.unref?.();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  async enqueueForSubmission(submissionId: string, workspaceId: string): Promise<void> {
    const submission = await this.submissionModel
      .findOne({ _id: submissionId, workspaceId })
      .exec();
    if (!submission) return;
    const binding = await this.bindingModel
      .findOne({
        workspaceId,
        landingPageId: submission.landingPageId,
        formNodeId: submission.formNodeId,
      })
      .exec();
    if (!binding || binding.integrationIds.length === 0) return;

    const integrations = await this.integrationModel
      .find({
        _id: { $in: binding.integrationIds },
        workspaceId,
        enabled: true,
      })
      .exec();
    await Promise.all(
      integrations.map(async (integration) => {
        await this.deliveryModel
          .updateOne(
            { submissionId, integrationId: integration._id.toString() },
            {
              $setOnInsert: {
                _id: cryptoRandomId(),
                workspaceId,
                submissionId,
                integrationId: integration._id.toString(),
                integrationName: integration.name,
                integrationType: integration.type,
                status: 'pending',
                attemptCount: 0,
                nextAttemptAt: new Date(),
              },
            },
            { upsert: true },
          )
          .exec();
      }),
    );

    // External I/O is intentionally detached from the visitor request. The
    // durable records remain recoverable by the interval worker after a crash.
    void this.processPending();
  }

  async list(
    workspaceId: string,
    input: IntegrationDeliveryListQuery,
  ): Promise<IntegrationDeliveryListResponse> {
    const query = IntegrationDeliveryListQuerySchema.parse(input);
    const filter: Record<string, unknown> = { workspaceId };
    if (query.status) filter.status = query.status;
    if (query.integrationId) filter.integrationId = query.integrationId;
    if (query.submissionId) filter.submissionId = query.submissionId;
    const [records, total] = await Promise.all([
      this.deliveryModel
        .find(filter)
        .sort({ createdAt: -1, _id: -1 })
        .skip(query.offset)
        .limit(query.limit)
        .exec(),
      this.deliveryModel.countDocuments(filter).exec(),
    ]);
    return IntegrationDeliveryListResponseSchema.parse({
      items: records.map((record) => this.toContract(record)),
      pagination: PaginationSchema.parse({
        limit: query.limit,
        offset: query.offset,
        total,
        hasNextPage: query.offset + records.length < total,
      }),
    });
  }

  async retry(deliveryId: string, workspaceId: string): Promise<IntegrationDelivery> {
    const delivery = await this.deliveryModel
      .findOne({ _id: deliveryId, workspaceId })
      .exec();
    if (!delivery) {
      throw new NotFoundException({
        code: 'INTEGRATION_DELIVERY_NOT_FOUND',
        message: `Integration delivery ${deliveryId} was not found`,
      });
    }
    if (delivery.status !== 'failed') {
      throw new BadRequestException({
        code: 'INTEGRATION_DELIVERY_NOT_FAILED',
        message: 'Only failed deliveries can be retried',
      });
    }
    const integration = await this.integrationModel
      .findOne({ _id: delivery.integrationId, workspaceId, enabled: true })
      .exec();
    if (!integration) {
      throw new BadRequestException({
        code: 'INTEGRATION_DISABLED',
        message: 'The integration must exist and be enabled before retrying',
      });
    }
    delivery.status = 'pending';
    delivery.attemptCount = 0;
    delivery.set('lastError', undefined);
    delivery.set('deliveredAt', undefined);
    delivery.set('processingLeaseUntil', undefined);
    delivery.nextAttemptAt = new Date();
    await delivery.save();
    void this.processPending();
    return this.toContract(delivery);
  }

  async processPending(): Promise<void> {
    if (this.processing) return;
    this.processing = true;
    try {
      await this.reclaimExpiredLeases();
      for (let index = 0; index < DELIVERY_BATCH_SIZE; index += 1) {
        const delivery = await this.claimNext();
        if (!delivery) break;
        await this.processClaimed(delivery);
      }
    } finally {
      this.processing = false;
    }
  }

  private async claimNext(): Promise<IntegrationDeliveryDocument | null> {
    const now = new Date();
    return this.deliveryModel
      .findOneAndUpdate(
        {
          status: 'pending',
          $or: [{ nextAttemptAt: { $lte: now } }, { nextAttemptAt: { $exists: false } }],
        },
        {
          $set: {
            status: 'processing',
            lastAttemptAt: now,
            processingLeaseUntil: new Date(now.getTime() + DELIVERY_LEASE_MS),
          },
          $inc: { attemptCount: 1 },
        },
        { new: true, sort: { createdAt: 1, _id: 1 } },
      )
      .exec();
  }

  private async processClaimed(delivery: IntegrationDeliveryDocument): Promise<void> {
    const integration = await this.integrationModel
      .findOne({ _id: delivery.integrationId, workspaceId: delivery.workspaceId })
      .select('+secretCiphertext')
      .exec();
    if (!integration) {
      await this.finish(delivery, {
        kind: 'permanent',
        error: 'Integration no longer exists',
      });
      return;
    }
    if (!integration.enabled) {
      await this.finish(delivery, {
        kind: 'permanent',
        error: 'Integration is disabled',
      });
      return;
    }
    const adapter = this.adaptersByType.get(integration.type);
    if (!adapter) {
      await this.finish(delivery, {
        kind: 'permanent',
        error: 'Integration adapter is unavailable',
      });
      return;
    }

    try {
      const submission = await this.loadSubmissionContext(
        delivery.workspaceId,
        delivery.submissionId,
      );
      const secret = integration.secretCiphertext
        ? this.decryptSecret(integration.secretCiphertext)
        : undefined;
      if (integration.secretCiphertext && !secret) {
        await this.finish(delivery, {
          kind: 'permanent',
          error: 'Integration secret is unavailable',
        });
        return;
      }
      const outcome = await adapter.deliver({
        integration,
        submission,
        ...(secret ? { secret } : {}),
      });
      await this.finish(delivery, outcome);
    } catch {
      platformLogger.warn(
        {
          deliveryId: delivery._id.toString(),
          integrationType: delivery.integrationType,
        },
        'integration delivery processing failed',
      );
      await this.finish(delivery, {
        kind: 'retryable',
        error: 'Delivery processing failed',
      });
    }
  }

  private async finish(
    delivery: IntegrationDeliveryDocument,
    outcome: DeliveryOutcome,
  ): Promise<void> {
    if (outcome.kind === 'delivered') {
      delivery.status = 'delivered';
      delivery.deliveredAt = new Date();
      delivery.set('lastError', undefined);
      delivery.set('processingLeaseUntil', undefined);
      delivery.set('nextAttemptAt', undefined);
    } else if (
      outcome.kind === 'retryable' &&
      delivery.attemptCount < DELIVERY_MAX_ATTEMPTS
    ) {
      delivery.status = 'pending';
      delivery.nextAttemptAt = new Date(
        Date.now() + (RETRY_DELAYS_MS[delivery.attemptCount] ?? RETRY_DELAYS_MS.at(-1)!),
      );
      delivery.lastError = sanitizeError(outcome.error);
      delivery.set('processingLeaseUntil', undefined);
    } else {
      delivery.status = 'failed';
      delivery.lastError = sanitizeError(outcome.error);
      delivery.set('processingLeaseUntil', undefined);
      delivery.set('nextAttemptAt', undefined);
    }
    await delivery.save();
  }

  private async reclaimExpiredLeases(): Promise<void> {
    await this.deliveryModel
      .updateMany(
        { status: 'processing', processingLeaseUntil: { $lt: new Date() } },
        {
          $set: { status: 'pending', nextAttemptAt: new Date() },
          $unset: { processingLeaseUntil: 1 },
        },
      )
      .exec();
  }

  private async loadSubmissionContext(
    workspaceId: string,
    submissionId: string,
  ): Promise<DeliverySubmissionContext> {
    const submission = await this.submissionModel
      .findOne({ _id: submissionId, workspaceId })
      .exec();
    if (!submission) throw new Error('Submission no longer exists');
    const [page, version] = await Promise.all([
      this.pageModel.findOne({ _id: submission.landingPageId, workspaceId }).exec(),
      this.versionModel
        .findOne({
          _id: submission.pageVersionId,
          workspaceId,
          landingPageId: submission.landingPageId,
        })
        .exec(),
    ]);
    if (!page || !version) throw new Error('Submission context no longer exists');
    const payload = PagePayloadV2Schema.safeParse(version.payload);
    const form = payload.success
      ? findForm(payload.data.root, submission.formNodeId)
      : undefined;
    if (!form) throw new Error('Submission form context is invalid');
    const fieldsById = new Map(form.props.fields.map((field) => [field.id, field]));
    return {
      submissionId,
      landingPageId: submission.landingPageId,
      pageName: page.name,
      ...(page.slug ? { pageSlug: page.slug } : {}),
      formNodeId: submission.formNodeId,
      submittedAt: submission.submittedAt,
      fields: submission.values.map((entry) => {
        const field = fieldsById.get(entry.fieldId);
        return {
          fieldId: entry.fieldId,
          label: field?.label ?? entry.fieldId,
          name: field?.name ?? entry.fieldId,
          type: field?.type ?? 'text',
          value: entry.value,
        };
      }),
    };
  }

  private decryptSecret(ciphertext: string): string | undefined {
    try {
      return new IntegrationSecretVault(env.INTEGRATION_SECRET_ENCRYPTION_KEY).decrypt(
        ciphertext,
      );
    } catch {
      return undefined;
    }
  }

  private toContract(record: IntegrationDeliveryDocument): IntegrationDelivery {
    return IntegrationDeliverySchema.parse({
      id: record._id.toString(),
      workspaceId: record.workspaceId,
      submissionId: record.submissionId,
      integrationId: record.integrationId,
      integrationName: record.integrationName,
      integrationType: record.integrationType,
      status: record.status,
      attemptCount: record.attemptCount,
      ...(record.lastAttemptAt
        ? { lastAttemptAt: record.lastAttemptAt.toISOString() }
        : {}),
      ...(record.lastError ? { lastError: record.lastError } : {}),
      ...(record.deliveredAt ? { deliveredAt: record.deliveredAt.toISOString() } : {}),
      createdAt: record.createdAt.toISOString(),
      updatedAt: record.updatedAt.toISOString(),
    });
  }
}

function findForm(node: PageNodeV2, formNodeId: string): FormNode | undefined {
  if (node.type === 'form') return node.id === formNodeId ? node : undefined;
  for (const child of node.children) {
    const form = findForm(child, formNodeId);
    if (form) return form;
  }
  return undefined;
}

function sanitizeError(value: string): string {
  return value
    .replace(/[\r\n\t]/g, ' ')
    .replace(/https?:\/\/\S+/gi, '[url]')
    .slice(0, 500);
}

function cryptoRandomId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
}
