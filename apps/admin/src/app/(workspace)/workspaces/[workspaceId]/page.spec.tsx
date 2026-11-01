import type { Access } from '@plp/contracts';
import { describe, expect, it, vi } from 'vitest';
import WorkspacePage from './page';

const WORKSPACE_ID = '64b000000000000000000010';

class Redirected extends Error {}
const redirect = vi.fn((href: string) => {
  throw new Redirected(href);
});
vi.mock('next/navigation', () => ({ redirect: (href: string) => redirect(href) }));

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
  it('sends who signs in again from a workspace screen to "Thành viên", or to the start', async () => {
    expect(await landing('admin')).toBe(`/workspaces/${WORKSPACE_ID}/members`);
    expect(await landing('editor')).toBe('/');
  });
});
