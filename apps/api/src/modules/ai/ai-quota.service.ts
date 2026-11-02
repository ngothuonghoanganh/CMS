import { Injectable } from '@nestjs/common';
import { type AiUsage, nextVnMonthStart, type VnMonth, vnMonthOf } from '@plp/contracts';
import type { Env } from '../../config/env.js';
import { InjectEnv } from '../../shared/env.js';
import { AppError } from '../../shared/errors.js';
import type { ObjectId } from '../../shared/persistence/object-id.js';
import type { Tx } from '../../shared/persistence/transaction.js';
import type { WorkspaceRef } from '../../shared/persistence/workspace-databases.js';
import { LeadLimitsRepository } from '../leads/lead-limits.repository.js';
import { AiUsageRepository } from './ai-usage.repository.js';
import { AI_REQUESTS_PER_MINUTE } from './domain/job-rules.js';

/** The time AI quotas count in; tests set it to cross a month. */
@Injectable()
export class AiClock {
  now(): Date {
    return new Date();
  }
}

/** "dd/MM" of a day: "Lượt mới có vào 01/12". */
function dayMonth(day: string): string {
  return `${day.slice(8, 10)}/${day.slice(5, 7)}`;
}

const MINUTE_MS = 60_000;

/**
 * The AI uses of a workspace per calendar month in Vietnam, and the AI requests of a user per
 * minute (ADR-031). Creating a page with AI and the editor assistant both reserve a use before the
 * AI is asked and give it back when nothing is written.
 */
@Injectable()
export class AiQuota {
  constructor(
    @InjectEnv() private readonly env: Env,
    private readonly usage: AiUsageRepository,
    private readonly limits: LeadLimitsRepository,
    private readonly clock: AiClock,
  ) {}

  get enabled(): boolean {
    return this.env.AI_PROVIDER !== 'none';
  }

  /** 409 `ai_disabled` when the API has no AI service: every AI entry checks it first. */
  requireEnabled(): void {
    if (!this.enabled) {
      throw new AppError(409, 'ai_disabled', 'AI chưa được bật', {
        detail: 'Hệ thống chưa nối dịch vụ AI. Hãy tạo trang từ template hoặc theo mục tiêu.',
      });
    }
  }

  /** The month uses count in now. */
  currentMonth(): VnMonth {
    return vnMonthOf(this.clock.now());
  }

  async usageOf(ref: WorkspaceRef): Promise<AiUsage> {
    const month = this.currentMonth();
    const used = await this.usage.usedIn(ref, month);
    const limit = this.env.AI_MONTHLY_QUOTA;
    return {
      enabled: this.enabled,
      month,
      limit,
      used,
      remaining: Math.max(0, limit - used),
      resetsOn: nextVnMonthStart(month),
    };
  }

  /**
   * 429 `rate_limited` past `AI_REQUESTS_PER_MINUTE` requests of the user in a minute, counted in
   * the master's shared counters so every API instance sees them. Refused requests count too.
   */
  async throttle(userId: ObjectId): Promise<void> {
    const now = new Date();
    const window = await this.limits.hit(
      `ai:user:${userId.toHexString()}`,
      now,
      new Date(now.getTime() + MINUTE_MS),
    );
    if (window.count > AI_REQUESTS_PER_MINUTE) {
      throw new AppError(429, 'rate_limited', 'Bạn gửi yêu cầu AI quá nhanh', {
        detail: `Mỗi người gửi tối đa ${AI_REQUESTS_PER_MINUTE} yêu cầu AI mỗi phút. Hãy thử lại sau ít phút.`,
      });
    }
  }

  /** Creates this month's counter if needed; call before the transaction that `reserve`s. */
  async prepare(ref: WorkspaceRef): Promise<VnMonth> {
    const month = this.currentMonth();
    await this.usage.ensureMonth(ref, month, this.clock.now());
    return month;
  }

  /** Takes one use of `month` in `tx`; 429 `ai_quota_exhausted` when none is left. */
  async reserve(ref: WorkspaceRef, month: VnMonth, tx: Tx): Promise<void> {
    const limit = this.env.AI_MONTHLY_QUOTA;
    if (await this.usage.take(ref, month, limit, this.clock.now(), tx)) {
      return;
    }
    const resetsOn = nextVnMonthStart(month);
    throw new AppError(
      429,
      'ai_quota_exhausted',
      `Workspace đã dùng hết ${limit} lượt AI tháng này`,
      {
        detail: `Lượt mới có vào ${dayMonth(resetsOn)}.`,
        context: { limit, resetsOn },
      },
    );
  }

  /** Gives back a use reserved in `month`, in the transaction that records why. */
  refund(ref: WorkspaceRef, month: VnMonth, tx: Tx): Promise<void> {
    return this.usage.giveBack(ref, month, this.clock.now(), tx);
  }
}
