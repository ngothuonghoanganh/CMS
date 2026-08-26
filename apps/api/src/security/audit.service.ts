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
  AuditLogRecord,
  type AuditLogDocument,
} from '../persistence/schemas/audit-log.schema';

export type AuditInput = Omit<AuditLog, 'id' | 'createdAt'> & { createdAt?: Date };

const sensitiveKey =
  /password|secret|token|authorization|cookie|api[-_]?key|credential|connection|string|uri/i;

export function sanitizeAuditValue(value: unknown, key?: string): unknown {
  if (key && sensitiveKey.test(key)) return '[REDACTED]';
  if (Array.isArray(value)) return value.map((item) => sanitizeAuditValue(item));
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([entryKey, entryValue]) => [
        entryKey,
        sanitizeAuditValue(entryValue, entryKey),
      ]),
    );
  }
  return value;
}

@Injectable()
export class AuditService {
  constructor(
    @InjectModel(AuditLogRecord.name)
    private readonly auditModel: Model<AuditLogRecord>,
  ) {}

  async record(input: AuditInput): Promise<AuditLog> {
    const safeMetadata = input.metadata
      ? (sanitizeAuditValue(input.metadata) as Record<string, unknown>)
      : undefined;
    const record = await this.auditModel.create({
      _id: randomUUID(),
      ...input,
      ...(safeMetadata ? { metadata: safeMetadata } : {}),
      ...(input.createdAt ? { createdAt: input.createdAt } : {}),
    });
    return this.toContract(record);
  }

  async list(
    input: AuditLogQuery,
  ): Promise<ReturnType<typeof AuditLogListResponseSchema.parse>> {
    const query = AuditLogQuerySchema.parse(input);
    const filter: FilterQuery<AuditLogRecord> = {};
    if (query.workspaceId) filter.workspaceId = query.workspaceId;
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

  private toContract(record: AuditLogDocument): AuditLog {
    return AuditLogSchema.parse({
      id: record._id.toString(),
      actorType: record.actorType,
      actorId: record.actorId,
      action: record.action,
      ...(record.workspaceId ? { workspaceId: record.workspaceId } : {}),
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
