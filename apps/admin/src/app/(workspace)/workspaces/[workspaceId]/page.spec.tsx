import type { Access } from '@plp/contracts';
import { describe, expect, it, vi } from 'vitest';
import WorkspacePage from './page';

const WORKSPACE_ID = '64b000000000000000000010';

class Redirected extends Error {}
const redirect = vi.fn((href: string) => {
  throw new Redirected(href);
});
vi.mock('next/navigation', () => ({ redirect: (href: string) => redirect(href) }));

class NotFound extends Error {}
const context = vi.fn<() => Promise<{ membership: { role: Access } }>>();
vi.mock('../../../../features/shell/workspace-context', () => ({
  loadWorkspaceContext: () => context(),
}));

async function landing(role: Access): Promise<string> {
  context.mockResolvedValueOnce({ membership: { role } });
  await expect(
    WorkspacePage({ params: Promise.resolve({ workspaceId: WORKSPACE_ID }) }),
  ).rejects.toBeInstanceOf(Redirected);
  return redirect.mock.lastCall?.[0] ?? '';
}

describe('workspace page', () => {
  it('opens the Sites screen for every role (ADR-028)', async () => {
    const roles: Access[] = ['owner', 'admin', 'editor', 'contributor', 'support', 'viewer'];
    for (const role of roles) {
      expect(await landing(role)).toBe(`/workspaces/${WORKSPACE_ID}/sites`);
    }
  });

  it('redirects only once the context let the user in (membership, address)', async () => {
    redirect.mockClear();
    // The context answers 404 for someone outside the workspace, or moves them to its address.
    context.mockRejectedValueOnce(new NotFound());
    await expect(
      WorkspacePage({ params: Promise.resolve({ workspaceId: WORKSPACE_ID }) }),
    ).rejects.toBeInstanceOf(NotFound);
    expect(redirect).not.toHaveBeenCalled();
  });
});
