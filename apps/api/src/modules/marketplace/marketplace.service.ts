import { Injectable } from '@nestjs/common';
import {
  can,
  type ClaimMarketplaceItemRequest,
  MarketplaceItemDetail,
  MarketplaceLicence,
  MarketplaceLicenceListResponse,
  MarketplaceListResponse,
  MarketplaceSuggestionResponse,
  Permission,
  UpdateMarketplaceLicenceVersionRequest,
} from '@plp/contracts';
import { forbidden, notFound } from '../../shared/errors.js';
import type { ObjectId } from '../../shared/persistence/object-id.js';
import type { AuthenticatedUser } from '../auth/authenticated-user.js';
import { UsersRepository } from '../auth/users.repository.js';
import { BillingNotifier } from '../billing/billing-notifier.service.js';
import { PagesRepository } from '../pages/pages.repository.js';
import { TEMPLATE_NOT_FOUND } from '../templates/template-catalog.js';
import { AccessService } from '../workspaces/access.service.js';
import type { WorkspaceScope } from '../workspaces/workspace-scope.js';
import { WorkspacesRepository } from '../workspaces/workspaces.repository.js';
import { claimOutcome, versionUpdateOutcome } from './domain/licence-rules.js';
import { marketplaceDetail, marketplaceList, ownedItemOf } from './domain/marketplace-items.js';
import { suggestionOutcome } from './domain/purchase-rules.js';
import { versionHashOf } from './domain/version-hash.js';
import { MarketplaceLicences, toMarketplaceLicence } from './marketplace-licences.js';
import { MarketplaceLicencesRepository } from './marketplace-licences.repository.js';
import {
  itemChanged,
  itemFree,
  itemNotFree,
  itemOwned,
  licenceChanged,
  suggestionNotSent,
} from './marketplace-problems.js';

/**
 * The marketplace of a workspace (ADR-036, boards 30–32). Every member browses it and lists the
 * licences, as the template library (`pages.view`); a read-only workspace too, since that changes
 * nothing. Claiming a free item and updating a licence add or change a template of the library
 * (`templates.manage`), which a read-only workspace may not (402). Every call checks membership
 * (404), then the permission (403), then read-only (402), then the item or the licence, then the
 * rules of the action.
 */
@Injectable()
export class MarketplaceService {
  constructor(
    private readonly licences: MarketplaceLicences,
    private readonly repository: MarketplaceLicencesRepository,
    private readonly access: AccessService,
    private readonly workspaces: WorkspacesRepository,
    private readonly users: UsersRepository,
    private readonly pages: PagesRepository,
    private readonly notifier: BillingNotifier,
  ) {}

  async list(user: AuthenticatedUser, workspaceId: string): Promise<MarketplaceListResponse> {
    const scope = await this.scope(user, workspaceId, 'pages.view');
    return marketplaceList(this.licences.catalog, await this.licences.holdings(scope));
  }

  /**
   * 404 "Không tìm thấy mẫu" for an id the workspace may not see (a draft, a withdrawn item it
   * holds no licence of, any other id), as for any template.
   */
  async detail(
    user: AuthenticatedUser,
    workspaceId: string,
    itemId: string,
  ): Promise<MarketplaceItemDetail> {
    const scope = await this.scope(user, workspaceId, 'pages.view');
    const view = marketplaceDetail(
      this.licences.catalog,
      itemId,
      await this.licences.holdings(scope),
    );
    if (view === null) {
      throw notFound(TEMPLATE_NOT_FOUND);
    }
    return {
      ...view,
      ownerName: (await this.owner(scope)).name,
      suggested: await this.suggestedBy(scope, itemId),
    };
  }

  /**
   * "Đề xuất {tên} mua" (`pages.view`): emails Chủ sở hữu, once per member and item. Only a member
   * who cannot buy asks (403 for `billing.manage`), a read-only workspace included: it changes
   * nothing. A repeat is 200 and sends nothing; an email that could not be sent is 503, given back.
   */
  async suggest(
    user: AuthenticatedUser,
    workspaceId: string,
    itemId: string,
  ): Promise<MarketplaceSuggestionResponse> {
    const scope = await this.scope(user, workspaceId, 'pages.view');
    if (can(scope.access, 'billing.manage')) {
      throw forbidden('Chủ sở hữu mua mẫu trực tiếp ở Marketplace, không cần đề xuất');
    }
    const held = await this.repository.find(scope, itemId);
    const outcome = suggestionOutcome(this.licences.catalog, itemId, held);
    switch (outcome.kind) {
      case 'not_found':
        throw notFound(TEMPLATE_NOT_FOUND);
      case 'owned':
        throw itemOwned(outcome.item.name, toMarketplaceLicence(outcome.licence));
      case 'free':
        throw itemFree(outcome.item.name);
      case 'suggest': {
        const [owner, asker] = await Promise.all([this.owner(scope), this.nameOf(scope.userId)]);
        const sent = await this.notifier.marketplaceSuggestion(scope, {
          userId: scope.userId.toHexString(),
          memberName: asker,
          itemId,
          itemName: outcome.item.name,
          price: outcome.item.price,
        });
        switch (sent) {
          case 'sent':
            return { alreadySuggested: false, message: `Đã gửi đề xuất tới ${owner.name}.` };
          case 'sent_before':
            return {
              alreadySuggested: true,
              message: `Bạn đã đề xuất ${owner.name} mua mẫu này trước đó.`,
            };
          case 'failed':
          case 'nobody':
            throw suggestionNotSent();
        }
      }
    }
  }

  /**
   * "Nhận mẫu": a free licence at the version and under the terms the member agreed to; no
   * invoice, no gateway, no email. A licence held answers as it is, so a claim sent twice, or by
   * two members at once, leaves one licence.
   */
  async claim(
    user: AuthenticatedUser,
    workspaceId: string,
    itemId: string,
    request: ClaimMarketplaceItemRequest,
  ): Promise<MarketplaceLicence> {
    const scope = await this.scope(user, workspaceId, 'templates.manage');
    const held = await this.repository.find(scope, itemId);
    const outcome = claimOutcome(this.licences.catalog, itemId, held, request);
    switch (outcome.kind) {
      case 'not_found':
        throw notFound(TEMPLATE_NOT_FOUND);
      case 'held':
        return toMarketplaceLicence(outcome.licence);
      case 'not_free':
        throw itemNotFree(outcome.item.name, outcome.item.price);
      case 'changed':
        throw itemChanged(outcome.item.name, outcome.current);
      case 'grant': {
        const { licence } = await this.repository.grant(scope, {
          itemId: outcome.item.id,
          source: 'free',
          version: outcome.version.version,
          versionHash: versionHashOf(outcome.version.composition),
          invoiceId: null,
          termsVersion: outcome.termsVersion,
          grantedBy: scope.userId,
          at: new Date(),
        });
        return toMarketplaceLicence(licence);
      }
    }
  }

  /**
   * Board 32: every licence of the workspace, withdrawn items included, the newest first, with the
   * pages made from each in the member's sites, counted as "Đã dùng" of board 18: one aggregation
   * on the pages' `createdFrom` index for every row.
   */
  async licenceList(
    user: AuthenticatedUser,
    workspaceId: string,
  ): Promise<MarketplaceLicenceListResponse> {
    const scope = await this.scope(user, workspaceId, 'pages.view');
    const held = await this.licences.heldItems(scope);
    const used = await this.pages.countCreatedFromEach(
      scope,
      'marketplace',
      held.map(({ item }) => item.id),
      scope.siteIds,
    );
    return {
      items: held.map(({ item, licence }) => ownedItemOf(item, licence, used.get(item.id) ?? 0)),
    };
  }

  /**
   * "Cập nhật": the licence moves to the item's current version, from the version the member saw
   * (`baseVersion`). Pages, drafts and releases made from it keep their copy (ADR-030). Already at
   * the current version: unchanged. 404 when the workspace holds no licence of the item; a
   * withdrawn item's licence updates too.
   */
  async updateVersion(
    user: AuthenticatedUser,
    workspaceId: string,
    itemId: string,
    { baseVersion }: UpdateMarketplaceLicenceVersionRequest,
  ): Promise<MarketplaceLicence> {
    const scope = await this.scope(user, workspaceId, 'templates.manage');
    const held = await this.licences.heldItem(scope, itemId);
    if (held === null) {
      throw notFound(TEMPLATE_NOT_FOUND);
    }
    const outcome = versionUpdateOutcome(held.item, held.licence.version, baseVersion);
    switch (outcome.kind) {
      case 'latest':
        return held.licence;
      case 'changed':
        throw licenceChanged(held.item.name, outcome.licenceVersion);
      case 'move': {
        const moved = await this.repository.moveVersion(scope, itemId, {
          from: held.licence.version,
          to: outcome.to.version,
          versionHash: versionHashOf(outcome.to.composition),
          at: new Date(),
        });
        return moved === null
          ? this.afterConcurrentMove(scope, itemId, baseVersion)
          : toMarketplaceLicence(moved);
      }
    }
  }

  /**
   * Another member moved the licence between its read and the write: the result is theirs when it
   * reached the current version, else the member reads the dialog again.
   */
  private async afterConcurrentMove(
    scope: WorkspaceScope,
    itemId: string,
    baseVersion: number,
  ): Promise<MarketplaceLicence> {
    const held = await this.licences.heldItem(scope, itemId);
    if (held === null) {
      throw new Error(`The licence of ${itemId} disappeared while it moved; none is ever deleted`);
    }
    if (versionUpdateOutcome(held.item, held.licence.version, baseVersion).kind === 'latest') {
      return held.licence;
    }
    throw licenceChanged(held.item.name, held.licence.version);
  }

  /**
   * Membership of the workspace (404), then the permission (403, ADR-020), then a read-only
   * workspace for a request that writes under a write permission (402, ADR-035).
   */
  private async scope(
    user: AuthenticatedUser,
    workspaceId: string,
    permission: Permission,
  ): Promise<WorkspaceScope> {
    const scope = await this.access.scopeForWorkspace(user, workspaceId);
    this.access.require(scope, permission);
    return scope;
  }

  /** Whether the viewer asked for this item already; Chủ sở hữu buys, so never asks. */
  private suggestedBy(scope: WorkspaceScope, itemId: string): Promise<boolean> {
    return can(scope.access, 'billing.manage')
      ? Promise.resolve(false)
      : this.notifier.hasSuggested(scope, { userId: scope.userId.toHexString(), itemId });
  }

  /** "Đề xuất {tên} mua": only Chủ sở hữu buys (`billing.manage`). */
  private async owner(scope: WorkspaceScope): Promise<{ name: string }> {
    const owner = await this.workspaces.findOwner(scope);
    if (owner === null) {
      throw new Error(`Workspace ${scope.workspaceId.toHexString()} has no owner to name`);
    }
    return { name: await this.nameOf(owner.userId) };
  }

  private async nameOf(userId: ObjectId): Promise<string> {
    const ref = (await this.users.findRefs([userId])).get(userId.toHexString());
    if (ref === undefined) {
      throw new Error(`User ${userId.toHexString()} has no name to show`);
    }
    return ref.name;
  }
}
