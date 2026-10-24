import { Injectable } from '@nestjs/common';
import type { CreatePreviewLinkRequest, PreviewLinkResponse } from '@plp/contracts';
import { notFound } from '../../shared/errors.js';
import { toObjectId } from '../../shared/persistence/object-id.js';
import type { AuthenticatedUser } from '../auth/authenticated-user.js';
import { PageAccessService } from '../pages/page-access.service.js';
import { RELEASE_NOT_FOUND } from '../publishing/release-dto.js';
import { ReleasesRepository } from '../publishing/releases.repository.js';
import { SitesService } from '../sites/sites.service.js';
import { type PreviewClaims, PreviewTokens } from './preview-tokens.js';

@Injectable()
export class PreviewService {
  constructor(
    private readonly pageAccess: PageAccessService,
    private readonly releases: ReleasesRepository,
    private readonly sites: SitesService,
    private readonly tokens: PreviewTokens,
  ) {}

  /**
   * A signed link to the page's latest draft or to one of its releases ("Xem bản này"), served
   * by the renderer at `{site origin}/_preview/{token}` (ADR-010, ARCHITECTURE §2.1.7).
   */
  async createLink(
    user: AuthenticatedUser,
    pageId: string,
    input: CreatePreviewLinkRequest,
  ): Promise<PreviewLinkResponse> {
    const { site, page, scope } = await this.pageAccess.access(user, pageId);
    const siteClaims = {
      siteId: site._id.toHexString(),
      workspaceId: site.workspaceId.toHexString(),
      subdomain: site.subdomain,
    };
    let claims: PreviewClaims;
    if (input.kind === 'draft') {
      claims = { kind: 'draft', pageId: page._id.toHexString(), ...siteClaims };
    } else {
      const release = await this.releases.findById(
        scope,
        toObjectId(input.releaseId, RELEASE_NOT_FOUND),
      );
      if (!release || !release.pageId.equals(page._id)) {
        throw notFound(RELEASE_NOT_FOUND);
      }
      claims = { kind: 'release', releaseId: release._id.toHexString(), ...siteClaims };
    }
    const { token, expiresAt } = await this.tokens.sign(claims);
    return {
      url: `${this.sites.defaultOrigin(site)}/_preview/${token}`,
      expiresAt: expiresAt.toISOString(),
    };
  }
}
