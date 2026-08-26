import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { FilterQuery, Model } from 'mongoose';
import {
  AuditLogListResponseSchema,
  AuditLogQuerySchema,
  AuditLogSchema,
  type AuditLog,
  type AuditLogQuery,
} from '@payload/contracts';
import { randomUUID } from 'node:crypto';

import {
  PlatformAuditLogRecord,
  type PlatformAuditLogDocument,
} from '../tenancy/schemas/platform-audit-log.schema';
import { sanitizeAuditValue, type AuditInput } from './audit.service';
import { MASTER_CONNECTION } from '../tenancy/master-connection';

@Injectable()
export class PlatformAuditService {
  constructor(
    @InjectModel(PlatformAuditLogRecord.name, MASTER_CONNECTION)
    private readonly auditModel: Model<PlatformAuditLogRecord>,
  ) {}

  async record(input: AuditInput): Promise<AuditLog> {
    const record = await this.auditModel.create({
      _id: randomUUID(),
      ...input,
      actorType: input.actorType === 'user' ? 'platform_user' : input.actorType,
      ...(input.metadata ? { metadata: sanitizeAuditValue(input.metadata) } : {}),
      ...(input.createdAt ? { createdAt: input.createdAt } : {}),
    });
    return this.toContract(record);
  }

  async list(
    input: AuditLogQuery,
  ): Promise<ReturnType<typeof AuditLogListResponseSchema.parse>> {
    const query = AuditLogQuerySchema.parse(input);
    const filter: FilterQuery<PlatformAuditLogRecord> = {};
    if (query.actorId) filter.actorId = query.actorId;
    if (query.action) filter.action = query.action;
    if (query.resourceType) filter.resourceType = query.resourceType;
    if (query.resourceId) filter.resourceId = query.resourceId;
    if (query.from || query.to) {
      filter.createdAt = {
        ...(query.from ? { $gte: new Date(query.from) } : {}),
        ...(query.to ? { $lte: new Date(query.to) } : {}),
      };
    }
    const [records, total] = await Promise.all([
      this.auditModel
        .find(filter)
        .sort({ createdAt: -1, _id: -1 })
        .skip(query.offset)
        .limit(query.limit)
        .exec(),
      this.auditModel.countDocuments(filter).exec(),
    ]);
    return AuditLogListResponseSchema.parse({
      items: records.map((record) => this.toContract(record)),
      pagination: { ...query, total, hasNextPage: query.offset + records.length < total },
    });
  }

  private toContract(record: PlatformAuditLogDocument): AuditLog {
    return AuditLogSchema.parse({
      id: record._id.toString(),
      actorType: record.actorType,
      actorId: record.actorId,
      action: record.action,
      resourceType: record.resourceType,
      ...(record.resourceId ? { resourceId: record.resourceId } : {}),
      result: record.result,
      ...(record.requestId ? { requestId: record.requestId } : {}),
      ...(record.metadata ? { metadata: sanitizeAuditValue(record.metadata) } : {}),
      ...(record.ipAddress ? { ipAddress: record.ipAddress } : {}),
      ...(record.userAgent ? { userAgent: record.userAgent } : {}),
      createdAt: record.createdAt.toISOString(),
    });
  }
}
