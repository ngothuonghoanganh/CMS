import { z } from 'zod';
import { sessionUserSchema } from './auth.js';
import { idSchema } from './common.js';
import { accessSchema } from './permissions.js';
import { workspaceSlugSchema } from './workspace-address.js';

export const membershipSchema = z.object({
  /** `slug` names the workspace's admin address (ADR-025). */
  workspace: z.object({ id: idSchema, name: z.string(), slug: workspaceSlugSchema }),
  /** A system role, or the custom role the member holds with its permissions (ADR-024). */
  role: accessSchema,
  /** Sites the member may open; `null` is the whole workspace, sites created later included. */
  siteIds: z.array(idSchema).nullable(),
});
export type Membership = z.infer<typeof membershipSchema>;

export const meResponseSchema = z.object({
  user: sessionUserSchema,
  memberships: z.array(membershipSchema),
});
export type MeResponse = z.infer<typeof meResponseSchema>;
