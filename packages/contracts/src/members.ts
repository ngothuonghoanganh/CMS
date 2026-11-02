import { z } from 'zod';
import {
  assignableRoleSchema,
  emailSchema,
  passwordSchema,
  personNameSchema,
  type Role,
} from './auth.js';
import { idSchema, isoDateTimeSchema, userRefSchema } from './common.js';
import { roleChoiceSchema } from './custom-roles.js';
import { accessSchema } from './permissions.js';
import { workspaceSlugSchema } from './workspace-address.js';

/*
 * Members, invitations, access requests and the ownership of a workspace (boards 15, 15b,
 * ADR-021).
 */

/** People in a workspace: its members and its pending invitations together. */
export const MEMBERS_MAX = 100;

/** Emails in one "Mời thành viên". */
export const INVITE_EMAILS_MAX = 10;

/** An invitation link works this many days, once, for the invited email only. */
export const INVITATION_VALID_DAYS = 7;

/** Admin page that opens an invitation link; the token travels in the fragment (`#token=`). */
export const INVITATION_PATH = '/invite';

/** Sites a member is given; at most this many when not the whole workspace. */
export const MEMBER_SITES_MAX = 100;

/** The member's sites; null is the whole workspace, sites created later included. */
export const memberSiteIdsSchema = z
  .array(idSchema)
  .min(1, 'Chọn ít nhất một site')
  .max(MEMBER_SITES_MAX)
  .refine((ids) => new Set(ids).size === ids.length, 'Mỗi site chỉ chọn một lần')
  .nullable();

/**
 * A role with its sites, as it is given: a system role or `custom:{id}` (ADR-024). Quản trị always
 * has the whole workspace; so does a custom role set to "Toàn workspace" (checked by the API).
 */
export const accessGrantSchema = z
  .object({ role: roleChoiceSchema, siteIds: memberSiteIdsSchema })
  .refine((grant) => grant.role !== 'admin' || grant.siteIds === null, {
    message: 'Quản trị làm việc trên mọi site của workspace',
    path: ['siteIds'],
  });
export type AccessGrant = z.infer<typeof accessGrantSchema>;

export const memberSchema = z.object({
  userId: idSchema,
  name: z.string(),
  email: z.string(),
  role: accessSchema,
  siteIds: z.array(idSchema).nullable(),
  joinedAt: isoDateTimeSchema,
});
export type Member = z.infer<typeof memberSchema>;

export const memberListResponseSchema = z.object({ items: z.array(memberSchema) });
export type MemberListResponse = z.infer<typeof memberListResponseSchema>;

export const transferOwnershipRequestSchema = z.object({
  toUserId: idSchema,
  /** The workspace's name, typed to confirm. */
  confirmName: z.string().trim().max(80),
});
export type TransferOwnershipRequest = z.infer<typeof transferOwnershipRequestSchema>;

// Invitations

export const createInvitationsRequestSchema = z
  .object({
    emails: z
      .array(emailSchema)
      .min(1, 'Nhập ít nhất một email')
      .max(INVITE_EMAILS_MAX, `Mỗi lần mời tối đa ${INVITE_EMAILS_MAX} email`),
    role: roleChoiceSchema,
    siteIds: memberSiteIdsSchema,
  })
  .refine((invite) => invite.role !== 'admin' || invite.siteIds === null, {
    message: 'Quản trị làm việc trên mọi site của workspace',
    path: ['siteIds'],
  });
export type CreateInvitationsRequest = z.input<typeof createInvitationsRequestSchema>;

/** What became of one email of "Mời thành viên". */
export const invitationOutcomeSchema = z.enum([
  'sent',
  /** The invitation exists but its email failed: "Gửi lại" tries again. */
  'unsent',
  'already_member',
  /** A pending invitation for the email exists already: "Gửi lại" sends it again. */
  'already_invited',
]);
export type InvitationOutcome = z.infer<typeof invitationOutcomeSchema>;

export const createInvitationsResponseSchema = z.object({
  results: z.array(z.object({ email: z.string(), outcome: invitationOutcomeSchema })),
});
export type CreateInvitationsResponse = z.infer<typeof createInvitationsResponseSchema>;

/** A pending invitation, expired ones included until they are sent again or revoked. */
export const invitationSchema = z.object({
  id: idSchema,
  email: z.string(),
  role: accessSchema,
  siteIds: z.array(idSchema).nullable(),
  invitedBy: userRefSchema,
  createdAt: isoDateTimeSchema,
  expiresAt: isoDateTimeSchema,
  /** When the email last went out; null when it failed. */
  sentAt: isoDateTimeSchema.nullable(),
});
export type Invitation = z.infer<typeof invitationSchema>;

export const invitationListResponseSchema = z.object({ items: z.array(invitationSchema) });
export type InvitationListResponse = z.infer<typeof invitationListResponseSchema>;

/** The secret of an invitation link, sent in a body so it never lands in a URL of the API. */
export const invitationTokenRequestSchema = z.object({ token: z.string().min(1).max(200) });
export type InvitationTokenRequest = z.infer<typeof invitationTokenRequestSchema>;

export const invitationStateSchema = z.enum([
  'pending',
  'expired',
  'accepted',
  'revoked',
  'declined',
]);
export type InvitationState = z.infer<typeof invitationStateSchema>;

/** What the invitation page shows to whoever holds the link (board 15b). */
export const invitationLookupResponseSchema = z.object({
  state: invitationStateSchema,
  workspaceName: z.string(),
  invitedByName: z.string(),
  /**
   * Only once the invitation expired, for "Nhờ {người mời} gửi lại"; null otherwise. Whoever holds
   * the link is the invited person, whom that inviter emailed (ADR-021).
   */
  inviterEmail: z.string().nullable(),
  email: z.string(),
  role: accessSchema,
  /** Names of the sites; null is the whole workspace. */
  siteNames: z.array(z.string()).nullable(),
  expiresAt: isoDateTimeSchema,
  /** An account uses the invited email: the page offers to log in instead of signing up. */
  accountExists: z.boolean(),
});
export type InvitationLookupResponse = z.infer<typeof invitationLookupResponseSchema>;

export const invitedSignupRequestSchema = z.object({
  token: z.string().min(1).max(200),
  name: personNameSchema,
  password: passwordSchema,
});
export type InvitedSignupRequest = z.infer<typeof invitedSignupRequestSchema>;

/** The workspace joined, with its admin address (ADR-025). */
export const acceptInvitationResponseSchema = z.object({
  workspaceId: idSchema,
  slug: workspaceSlugSchema,
});
export type AcceptInvitationResponse = z.infer<typeof acceptInvitationResponseSchema>;

// Access requests

export const ACCESS_REQUEST_NOTE_MAX = 500;

export const createAccessRequestSchema = z.object({
  role: assignableRoleSchema,
  /** Asks for every site of the workspace; otherwise the member's sites stay as they are. */
  wholeWorkspace: z.boolean(),
  note: z.string().trim().max(ACCESS_REQUEST_NOTE_MAX, 'Ghi chú tối đa 500 ký tự'),
});
export type CreateAccessRequest = z.infer<typeof createAccessRequestSchema>;

export const accessRequestSchema = z.object({
  id: idSchema,
  user: z.object({ id: idSchema, name: z.string(), email: z.string() }),
  current: z.object({ role: accessSchema, siteIds: z.array(idSchema).nullable() }),
  role: assignableRoleSchema,
  wholeWorkspace: z.boolean(),
  note: z.string(),
  createdAt: isoDateTimeSchema,
});
export type AccessRequest = z.infer<typeof accessRequestSchema>;

export const accessRequestListResponseSchema = z.object({ items: z.array(accessRequestSchema) });
export type AccessRequestListResponse = z.infer<typeof accessRequestListResponseSchema>;

/** The member's own pending request, if any. */
export const myAccessRequestResponseSchema = z.object({ request: accessRequestSchema.nullable() });
export type MyAccessRequestResponse = z.infer<typeof myAccessRequestResponseSchema>;

/** What the role does in a sentence, for "Mời thành viên" and the request dialog (board 15). */
export const roleDescriptions: Record<Role, string> = {
  owner: 'Mọi quyền, gồm chuyển quyền sở hữu và duyệt yêu cầu đổi quyền.',
  admin: 'Mọi thứ trừ chuyển quyền sở hữu và duyệt yêu cầu đổi quyền.',
  editor: 'Sửa, xuất bản, rollback trang. Không xem lead.',
  contributor: 'Sửa bản nháp, gửi yêu cầu xuất bản.',
  support: 'Xem và xử lý lead. Không sửa trang.',
  viewer: 'Xem trang và hiệu quả. Không sửa gì.',
};
