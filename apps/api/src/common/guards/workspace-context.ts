import { NotFoundException, UnauthorizedException } from '@nestjs/common';
import type { AuthPrincipal } from '@payload/contracts';

export function requireWorkspaceId(principal: AuthPrincipal | undefined): string {
  if (!principal?.workspaceId) {
    throw new UnauthorizedException({
      code: 'UNAUTHENTICATED',
      message: 'An authenticated workspace context is required',
    });
  }

  return principal.workspaceId;
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
