import {
  ForbiddenException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import type { AuthPrincipal } from '@payload/contracts';

export function requireWorkspaceId(principal: AuthPrincipal | undefined): string {
  if (!principal?.workspaceId) {
    throw new UnauthorizedException({
      code: 'UNAUTHENTICATED',
      message: 'An authenticated workspace context is required',
    });
  }

  if (principal.organizationStatus === 'suspended') {
    throw new ForbiddenException({
      code: 'ORGANIZATION_SUSPENDED',
      message: 'This organization is suspended',
    });
  }

  return principal.workspaceId;
}

export function requireOrganizationId(principal: AuthPrincipal | undefined): string {
  const tenantId = principal?.tenantId ?? principal?.organizationId;
  if (!tenantId) {
    throw new UnauthorizedException({
      code: 'ORGANIZATION_CONTEXT_REQUIRED',
      message: 'An authenticated organization context is required',
    });
  }
  if (principal?.organizationStatus === 'suspended') {
    throw new ForbiddenException({
      code: 'ORGANIZATION_SUSPENDED',
      message: 'This organization is suspended',
    });
  }
  return tenantId;
}

export function requireRequestedWorkspace(
  principal: AuthPrincipal | undefined,
  requestedWorkspaceId: string,
): string {
  const workspaceId = requireWorkspaceId(principal);
  if (workspaceId !== requestedWorkspaceId) {
    throw new NotFoundException({
      code: 'WORKSPACE_NOT_FOUND',
      message: `Workspace ${requestedWorkspaceId} was not found`,
    });
  }
  return workspaceId;
}

export function requestedWorkspaceId(
  principal: AuthPrincipal | undefined,
  requestedWorkspaceId: string,
): string {
  if (!principal?.workspaceId) {
    throw new UnauthorizedException({
      code: 'UNAUTHENTICATED',
      message: 'An authenticated workspace context is required',
    });
  }
  return requestedWorkspaceId;
}
