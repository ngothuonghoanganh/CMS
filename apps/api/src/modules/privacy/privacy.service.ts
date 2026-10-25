import { Injectable } from '@nestjs/common';
import type {
  ConsentVersion,
  ConsentVersionListResponse,
  CreateConsentVersionRequest,
  CursorQuery,
  PrivacySettings,
  UserRef,
  updatePrivacyRequestSchema,
} from '@plp/contracts';
import type { z } from 'zod';
import { AppError, notFound } from '../../shared/errors.js';
import type { ObjectId } from '../../shared/persistence/object-id.js';
import { TransactionRunner } from '../../shared/persistence/transaction.js';
import { ActivityRepository } from '../activity/activity.repository.js';
import type { AuthenticatedUser } from '../auth/authenticated-user.js';
import { UsersRepository } from '../auth/users.repository.js';
import { type SiteRecord, sitePrivacyOf } from '../sites/site.schema.js';
import { SitesRepository } from '../sites/sites.repository.js';
import { SITE_NOT_FOUND, SitesService } from '../sites/sites.service.js';
import { AccessService } from '../workspaces/access.service.js';
import type { ConsentVersionRecord } from './consent-version.schema.js';
import {
  ConsentVersionsRepository,
  ConsentVersionTakenError,
} from './consent-versions.repository.js';
import { toConsentVersionDto, toSitePrivacyDto } from './privacy-dto.js';

/** Body of `PUT /sites/:siteId/privacy` after the contract schema normalized it. */
export type UpdatePrivacyValues = z.output<typeof updatePrivacyRequestSchema>;

function consentVersionConflict(currentVersion: number, cause?: unknown): AppError {
  return new AppError(409, 'conflict', 'Nội dung đồng ý vừa được lưu thành bản mới', {
    detail: `Bản ${currentVersion} đã được lưu trong lúc bạn sửa. Tải lại để xem bản mới nhất rồi sửa tiếp.`,
    context: { currentVersion },
    cause,
  });
}

function userRef(users: ReadonlyMap<string, UserRef>, id: ObjectId): UserRef {
  const user = users.get(id.toHexString());
  if (!user) {
    throw new Error(`Consent version refers to unknown user ${id.toHexString()}`);
  }
  return user;
}

/**
 * Personal data settings and consent versions of a site (ADR-017). Every member reads them; only
 * the owner changes them (ADR-004). Live pages keep what their release snapshotted until they are
 * published again, so nothing is revalidated here.
 */
@Injectable()
export class PrivacyService {
  constructor(
    private readonly sitesService: SitesService,
    private readonly sites: SitesRepository,
    private readonly versions: ConsentVersionsRepository,
    private readonly access: AccessService,
    private readonly activity: ActivityRepository,
    private readonly users: UsersRepository,
    private readonly transactions: TransactionRunner,
  ) {}

  async get(user: AuthenticatedUser, siteId: string): Promise<PrivacySettings> {
    const { scope, site } = await this.sitesService.access(user, siteId);
    return this.settingsOf(site, await this.versions.findCurrent(scope, site._id));
  }

  async update(
    user: AuthenticatedUser,
    siteId: string,
    input: UpdatePrivacyValues,
  ): Promise<PrivacySettings> {
    const { scope, site } = await this.sitesService.access(user, siteId);
    this.access.requireOwner(scope);
    const updated = await this.transactions.run(async (tx) => {
      const saved = await this.sites.updatePrivacy(
        scope,
        site._id,
        { ...input, updatedAt: new Date(), updatedBy: scope.userId },
        tx,
      );
      if (!saved) {
        throw notFound(SITE_NOT_FOUND);
      }
      await this.activity.record(scope, { siteId: site._id, type: 'privacy.updated' }, tx);
      return saved;
    });
    return this.settingsOf(updated, await this.versions.findCurrent(scope, site._id));
  }

  async listVersions(
    user: AuthenticatedUser,
    siteId: string,
    query: CursorQuery,
  ): Promise<ConsentVersionListResponse> {
    const { scope, site } = await this.sitesService.access(user, siteId);
    const page = await this.versions.listForSite(scope, site._id, query.cursor, query.limit);
    const users = await this.users.findRefs(page.items.map((version) => version.createdBy));
    return {
      items: page.items.map((version) =>
        toConsentVersionDto(version, userRef(users, version.createdBy)),
      ),
      nextCursor: page.nextCursor,
    };
  }

  /**
   * Saves the texts as the next version, with its activity, in one transaction. The owner edited
   * `baseVersion`; when another version was saved meanwhile the request answers 409 instead of
   * replacing it, also when both raced for the same number (the unique index decides).
   */
  async createVersion(
    user: AuthenticatedUser,
    siteId: string,
    input: CreateConsentVersionRequest,
  ): Promise<ConsentVersion> {
    const { scope, site } = await this.sitesService.access(user, siteId);
    this.access.requireOwner(scope);
    let created: ConsentVersionRecord;
    try {
      created = await this.transactions.run(async (tx) => {
        const currentVersion = (await this.versions.findCurrent(scope, site._id, tx))?.version ?? 0;
        if (currentVersion !== input.baseVersion) {
          throw consentVersionConflict(currentVersion);
        }
        const inserted = await this.versions.insert(
          scope,
          {
            siteId: site._id,
            version: currentVersion + 1,
            requiredText: input.requiredText,
            marketingText: input.marketingText,
          },
          tx,
        );
        await this.activity.record(
          scope,
          {
            siteId: site._id,
            type: 'consent.version_created',
            data: { version: inserted.version },
          },
          tx,
        );
        return inserted;
      });
    } catch (error) {
      if (!(error instanceof ConsentVersionTakenError)) {
        throw error;
      }
      const current = await this.versions.findCurrent(scope, site._id);
      throw consentVersionConflict(current?.version ?? input.baseVersion + 1, error);
    }
    return toConsentVersionDto(created, { id: user.id.toHexString(), name: user.name });
  }

  private async settingsOf(
    site: SiteRecord,
    current: ConsentVersionRecord | null,
  ): Promise<PrivacySettings> {
    const privacy = sitePrivacyOf(site);
    const users = current ? await this.users.findRefs([current.createdBy]) : new Map();
    return {
      privacy: privacy ? toSitePrivacyDto(privacy) : null,
      currentConsent: current
        ? toConsentVersionDto(current, userRef(users, current.createdBy))
        : null,
    };
  }
}
