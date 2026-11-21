import { Injectable } from '@nestjs/common';
import type {
  MarketplaceCatalog,
  MarketplaceItemDetail,
  MarketplaceListResponse,
} from '@plp/contracts';
import { notFound } from '../../shared/errors.js';
import type { AuthenticatedUser } from '../auth/authenticated-user.js';
import { UsersRepository } from '../auth/users.repository.js';
import { TEMPLATE_NOT_FOUND } from '../templates/template-catalog.js';
import { AccessService } from '../workspaces/access.service.js';
import type { WorkspaceScope } from '../workspaces/workspace-scope.js';
import { WorkspacesRepository } from '../workspaces/workspaces.repository.js';
import { marketplaceDetail, marketplaceList, NO_HOLDINGS } from './domain/marketplace-items.js';
import { InjectMarketplaceCatalog } from './marketplace-catalog.js';

/**
 * Browsing the marketplace (ADR-036, boards 30 and 31). Every member sees it, as the template
 * library (`pages.view`); a read-only workspace too, since browsing changes nothing. Licences come
 * with MP2: until then no workspace holds one, so every item is unowned, equally used, and a
 * withdrawn item is not found.
 */
@Injectable()
export class MarketplaceService {
  constructor(
    @InjectMarketplaceCatalog() private readonly catalog: MarketplaceCatalog,
    private readonly access: AccessService,
    private readonly workspaces: WorkspacesRepository,
    private readonly users: UsersRepository,
  ) {}

  async list(user: AuthenticatedUser, workspaceId: string): Promise<MarketplaceListResponse> {
    await this.scope(user, workspaceId);
    return marketplaceList(this.catalog, NO_HOLDINGS);
  }

  /** 404 "Không tìm thấy mẫu" for an id the workspace may not see, as for any template. */
  async detail(
    user: AuthenticatedUser,
    workspaceId: string,
    itemId: string,
  ): Promise<MarketplaceItemDetail> {
    const scope = await this.scope(user, workspaceId);
    const view = marketplaceDetail(this.catalog, itemId, NO_HOLDINGS);
    if (view === null) {
      throw notFound(TEMPLATE_NOT_FOUND);
    }
    return { ...view, ownerName: await this.ownerName(scope) };
  }

  /** Membership of the workspace, then the permission every member holds (ADR-020). */
  private async scope(user: AuthenticatedUser, workspaceId: string): Promise<WorkspaceScope> {
    const scope = await this.access.scopeForWorkspace(user, workspaceId);
    this.access.require(scope, 'pages.view');
    return scope;
  }

  /** "Đề xuất {tên} mua": only Chủ sở hữu buys (`billing.manage`). */
  private async ownerName(scope: WorkspaceScope): Promise<string> {
    const owner = await this.workspaces.findOwner(scope);
    const ref =
      owner === null
        ? undefined
        : (await this.users.findRefs([owner.userId])).get(owner.userId.toHexString());
    if (ref === undefined) {
      throw new Error(`Workspace ${scope.workspaceId.toHexString()} has no owner to name`);
    }
    return ref.name;
  }
}
