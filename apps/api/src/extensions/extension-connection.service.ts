import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import {
  CreateExtensionConnectionRequestSchema,
  ExtensionConnectionListResponseSchema,
  ExtensionConnectionSchema,
  UpdateExtensionConnectionRequestSchema,
  type ExtensionConnection,
  type ExtensionConnectionListResponse,
} from '@payload/contracts';
import { randomUUID } from 'node:crypto';

import { env } from '../config/env';
import { IntegrationSecretVault } from '../domain/integration-secret-vault';
import { ExtensionConnectionRecord } from '../persistence/schemas/extension-connection.schema';
import { PageExtensionInstanceRecord } from '../persistence/schemas/page-extension-instance.schema';
import { TenantExtensionRecord } from '../persistence/schemas/tenant-extension.schema';
import { ExtensionRegistry } from './extension-registry';

@Injectable()
export class ExtensionConnectionService {
  constructor(
    @InjectModel(ExtensionConnectionRecord.name)
    private readonly connectionModel: Model<ExtensionConnectionRecord>,
    @InjectModel(TenantExtensionRecord.name)
    private readonly extensionModel: Model<TenantExtensionRecord>,
    @Inject(ExtensionRegistry) private readonly registry: ExtensionRegistry,
    @InjectModel(PageExtensionInstanceRecord.name)
    private readonly pageInstances: Model<PageExtensionInstanceRecord>,
  ) {}

  async list(extensionId: string): Promise<ExtensionConnectionListResponse> {
    await this.requireEnabledExtension(extensionId);
    const records = await this.connectionModel
      .find({ extensionId })
      .sort({ name: 1 })
      .exec();
    return ExtensionConnectionListResponseSchema.parse({
      items: records.map((record) => this.toContract(record)),
    });
  }

  async create(extensionId: string, input: unknown): Promise<ExtensionConnection> {
    await this.requireEnabledExtension(extensionId);
    const parsed = CreateExtensionConnectionRequestSchema.parse(input);
    const hasSecret = Boolean(parsed.secret);
    const record = await this.connectionModel.create({
      _id: randomUUID(),
      extensionId,
      name: parsed.name,
      status: hasSecret ? 'connected' : 'disconnected',
      configuration: parsed.configuration,
      ...(hasSecret ? { secretCiphertext: this.encryptSecret(parsed.secret!) } : {}),
    });
    await this.extensionModel
      .updateOne({ extensionId }, { $addToSet: { connectionIds: record._id.toString() } })
      .exec();
    return this.toContract(record);
  }

  async update(
    extensionId: string,
    connectionId: string,
    input: unknown,
  ): Promise<ExtensionConnection> {
    await this.requireEnabledExtension(extensionId);
    const parsed = UpdateExtensionConnectionRequestSchema.parse(input);
    const record = await this.connectionModel
      .findOne({ _id: connectionId, extensionId })
      .select('+secretCiphertext')
      .exec();
    if (!record) throw this.connectionNotFound(connectionId);

    if (parsed.name !== undefined) record.name = parsed.name;
    if (parsed.configuration !== undefined) record.configuration = parsed.configuration;
    if (parsed.secret !== undefined) {
      if (parsed.secret === null || parsed.secret === '') {
        record.set('secretCiphertext', undefined);
      } else {
        record.set('secretCiphertext', this.encryptSecret(parsed.secret));
      }
    }
    const hasSecret = Boolean(record.secretCiphertext);
    record.status = hasSecret ? 'connected' : 'disconnected';
    await record.save();
    return this.toContract(record);
  }

  async remove(extensionId: string, connectionId: string): Promise<void> {
    await this.requireEnabledExtension(extensionId);
    const record = await this.connectionModel
      .findOne({ _id: connectionId, extensionId })
      .exec();
    if (!record) throw this.connectionNotFound(connectionId);
    if (await this.pageInstances.exists({ connectionId })) {
      throw new ConflictException({
        code: 'EXTENSION_CONNECTION_IN_USE',
        message: 'Remove this connection from pages before deleting it',
      });
    }
    await this.connectionModel.deleteOne({ _id: connectionId, extensionId }).exec();
    await this.extensionModel
      .updateOne({ extensionId }, { $pull: { connectionIds: connectionId } })
      .exec();
  }

  private async requireEnabledExtension(extensionId: string): Promise<void> {
    if (!this.registry.has(extensionId)) {
      const custom = await this.extensionModel
        .findOne({ extensionId, enabled: true })
        .exec();
      if (!custom?.definition) throw this.extensionNotFound(extensionId);
      return;
    }
    const installation = await this.extensionModel.findOne({ extensionId }).exec();
    if (!installation?.enabled) {
      throw new ConflictException({
        code: 'TENANT_EXTENSION_DISABLED',
        message: `Extension ${extensionId} is not enabled for this tenant`,
      });
    }
  }

  private encryptSecret(value: string): string {
    try {
      return new IntegrationSecretVault(env.INTEGRATION_SECRET_ENCRYPTION_KEY).encrypt(
        value,
      );
    } catch (error) {
      throw new BadRequestException({
        code: 'EXTENSION_CONNECTION_SECRET_UNAVAILABLE',
        message: error instanceof Error ? error.message : 'Connection secret unavailable',
      });
    }
  }

  private toContract(record: ExtensionConnectionRecord): ExtensionConnection {
    return ExtensionConnectionSchema.parse({
      id: record._id.toString(),
      extensionId: record.extensionId,
      name: record.name,
      status: record.status,
      configuration: record.configuration ?? {},
      secretConfigured: Boolean(record.secretCiphertext),
      createdAt: record.createdAt.toISOString(),
      updatedAt: record.updatedAt.toISOString(),
    });
  }

  private connectionNotFound(connectionId: string): NotFoundException {
    return new NotFoundException({
      code: 'EXTENSION_CONNECTION_NOT_FOUND',
      message: `Extension connection ${connectionId} was not found`,
    });
  }

  private extensionNotFound(extensionId: string): NotFoundException {
    return new NotFoundException({
      code: 'EXTENSION_NOT_FOUND',
      message: `Extension ${extensionId} was not found`,
    });
  }
}
