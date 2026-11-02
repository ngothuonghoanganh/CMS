import { Injectable } from '@nestjs/common';
import type { InvitedSignupRequest, LoginRequest, MeResponse } from '@plp/contracts';
import type { Env } from '../../config/env.js';
import { InjectEnv } from '../../shared/env.js';
import { AppError, notFound } from '../../shared/errors.js';
import { isDuplicateKeyError } from '../../shared/persistence/duplicate-key.js';
import { TransactionRunner } from '../../shared/persistence/transaction.js';
import { hashInvitationToken, invitationState } from '../workspaces/domain/member-rules.js';
import { InvitationsRepository } from '../workspaces/invitations.repository.js';
import { INVITATION_UNAVAILABLE, WorkspaceJoin } from '../workspaces/workspace-join.service.js';
import { CustomRolesRepository } from '../workspaces/custom-roles.repository.js';
import { accessOf } from '../workspaces/domain/member-access.js';
import { WorkspacesRepository } from '../workspaces/workspaces.repository.js';
import type { AuthenticatedUser } from './authenticated-user.js';
import { PasswordAttempts, type PasswordCheckUse } from './password-attempts.js';
import { hashPassword, timingSafeDummyHash, verifyPassword } from './password.js';
import { hashSessionToken, newSessionToken } from './session-token.js';
import { SessionsRepository } from './sessions.repository.js';
import { USERS_EMAIL_INDEX, UsersRepository } from './users.repository.js';

export interface IssuedSession {
  token: string;
  expiresAt: Date;
  me: MeResponse;
}

const LOGIN: PasswordCheckUse = {
  what: 'Login',
  tooMany: (minutes) =>
    new AppError(429, 'rate_limited', 'Đăng nhập sai quá nhiều lần', {
      detail: `Tài khoản này tạm dừng đăng nhập vì nhập sai quá nhiều lần. Thử lại sau ${String(minutes)} phút.`,
    }),
};

@Injectable()
export class AuthService {
  constructor(
    @InjectEnv() private readonly env: Env,
    private readonly users: UsersRepository,
    private readonly sessions: SessionsRepository,
    private readonly passwordAttempts: PasswordAttempts,
    private readonly workspaces: WorkspacesRepository,
    private readonly customRoles: CustomRolesRepository,
    private readonly invitations: InvitationsRepository,
    private readonly join: WorkspaceJoin,
    private readonly transactions: TransactionRunner,
  ) {}

  /**
   * Creates the account of an invited email from its link, and joins the workspace in the same
   * transaction (ADR-021): no workspace of its own. The email is the invitation's, so the link
   * proves it. An email with an account already must log in and accept instead.
   */
  async signupInvited(input: InvitedSignupRequest): Promise<IssuedSession> {
    const invitation = await this.invitations.findByTokenHash(hashInvitationToken(input.token));
    if (!invitation) {
      throw notFound('Liên kết mời không hợp lệ');
    }
    if (invitationState(invitation, new Date()) !== 'pending') {
      throw new AppError(409, 'invitation_unavailable', INVITATION_UNAVAILABLE);
    }
    const passwordHash = await hashPassword(input.password);
    let userId;
    try {
      userId = await this.transactions.run(async (tx) => {
        const user = await this.users.create(
          { email: invitation.email, name: input.name, passwordHash },
          tx,
        );
        await this.join.join(invitation, user._id, new Date(), tx);
        return user._id;
      });
    } catch (error) {
      if (isDuplicateKeyError(error, USERS_EMAIL_INDEX)) {
        throw new AppError(409, 'email_taken', 'Email này đã có tài khoản', {
          detail: 'Đăng nhập bằng email này rồi mở lại link mời để tham gia.',
          cause: error,
        });
      }
      throw error;
    }
    return this.issueSession({ id: userId, name: input.name, email: invitation.email });
  }

  /**
   * Each account allows `LOGIN_FAILURE_LIMIT` failed attempts per window; the attempt is counted
   * before the password is checked and a success clears the count (ADR-004, `PasswordAttempts`).
   */
  async login(input: LoginRequest): Promise<IssuedSession> {
    const user = await this.passwordAttempts.check(input.email, LOGIN, async () => {
      const found = await this.users.findByEmail(input.email);
      const valid = found
        ? await verifyPassword(found.passwordHash, input.password)
        : await verifyPassword(await timingSafeDummyHash(), input.password).then(() => false);
      return found && valid ? found : null;
    });
    if (!user) {
      throw new AppError(401, 'invalid_credentials', 'Email hoặc mật khẩu không đúng');
    }
    return this.issueSession({ id: user._id, name: user.name, email: user.email });
  }

  /** Ends every session the browser presented (ADR-025: up to one per cookie scope). */
  async logout(tokens: readonly string[]): Promise<void> {
    await this.sessions.deleteAll(tokens.map(hashSessionToken));
  }

  /** The display name, as sign-up takes it (ADR-026). */
  async updateName(user: AuthenticatedUser, name: string): Promise<MeResponse> {
    await this.users.setName(user.id, name);
    return this.me({ ...user, name });
  }

  async me(user: AuthenticatedUser): Promise<MeResponse> {
    const memberships = await this.workspaces.listForUser(user.id);
    // The custom roles of the user's own memberships, with what they allow now (ADR-024).
    const roles = await this.customRoles.findByIds(
      memberships.flatMap(({ membership }) =>
        membership.customRoleId ? [membership.customRoleId] : [],
      ),
    );
    return {
      user: { id: user.id.toHexString(), name: user.name, email: user.email },
      memberships: memberships.map(({ workspace, membership }) => ({
        workspace: { id: workspace._id.toHexString(), name: workspace.name, slug: workspace.slug },
        role: accessOf(membership, roles),
        siteIds: membership.siteIds?.map((id) => id.toHexString()) ?? null,
      })),
    };
  }

  /** A new session of `user`, for the cookie, with what `/auth/me` answers. */
  async issueSession(user: AuthenticatedUser): Promise<IssuedSession> {
    const token = newSessionToken();
    const expiresAt = new Date(Date.now() + this.env.SESSION_TTL_DAYS * 24 * 60 * 60 * 1000);
    await this.sessions.create(
      user.id,
      hashSessionToken(token),
      expiresAt,
      this.env.SESSION_COOKIE_DOMAIN ?? null,
    );
    return { token, expiresAt, me: await this.me(user) };
  }
}
