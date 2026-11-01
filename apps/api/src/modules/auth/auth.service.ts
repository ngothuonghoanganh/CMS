import { Injectable } from '@nestjs/common';
import type { InvitedSignupRequest, LoginRequest, MeResponse, SignupRequest } from '@plp/contracts';
import type { Env } from '../../config/env.js';
import { InjectEnv } from '../../shared/env.js';
import { AppError, notFound } from '../../shared/errors.js';
import { isDuplicateKeyError } from '../../shared/persistence/duplicate-key.js';
import { TransactionRunner } from '../../shared/persistence/transaction.js';
import { hashInvitationToken, invitationState } from '../workspaces/domain/member-rules.js';
import { InvitationsRepository } from '../workspaces/invitations.repository.js';
import { INVITATION_UNAVAILABLE, WorkspaceJoin } from '../workspaces/workspace-join.service.js';
import { WorkspacesRepository } from '../workspaces/workspaces.repository.js';
import type { AuthenticatedUser } from './authenticated-user.js';
import {
  type AttemptWindow,
  LoginAttemptsRepository,
  loginAccountKey,
} from './login-attempts.repository.js';
import { hashPassword, timingSafeDummyHash, verifyPassword } from './password.js';
import { hashSessionToken, newSessionToken } from './session-token.js';
import { SessionsRepository } from './sessions.repository.js';
import { USERS_EMAIL_INDEX, UsersRepository } from './users.repository.js';

export interface IssuedSession {
  token: string;
  expiresAt: Date;
  me: MeResponse;
}

@Injectable()
export class AuthService {
  constructor(
    @InjectEnv() private readonly env: Env,
    private readonly users: UsersRepository,
    private readonly sessions: SessionsRepository,
    private readonly loginAttempts: LoginAttemptsRepository,
    private readonly workspaces: WorkspacesRepository,
    private readonly invitations: InvitationsRepository,
    private readonly join: WorkspaceJoin,
    private readonly transactions: TransactionRunner,
  ) {}

  /** Creates the user, their workspace and owner membership atomically, then signs them in. */
  async signup(input: SignupRequest): Promise<IssuedSession> {
    const passwordHash = await hashPassword(input.password);
    let userId;
    try {
      userId = await this.transactions.run(async (tx) => {
        const user = await this.users.create(
          { email: input.email, name: input.name, passwordHash },
          tx,
        );
        await this.workspaces.createWithOwner(input.workspaceName, user._id, tx);
        return user._id;
      });
    } catch (error) {
      if (isDuplicateKeyError(error, USERS_EMAIL_INDEX)) {
        throw new AppError(409, 'email_taken', 'Email này đã được đăng ký', {
          issues: [{ path: ['email'], code: 'email_taken', message: 'Email này đã được đăng ký' }],
          cause: error,
        });
      }
      throw error;
    }
    return this.issueSession({ id: userId, name: input.name, email: input.email });
  }

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
   * Each account allows `LOGIN_FAILURE_LIMIT` failed attempts per window. The attempt is counted
   * before the password is checked; a success clears the count (ADR-004). A login that fails on
   * our side (database, password hashing, session) gives its attempt back: only a wrong password
   * may use up the account's attempts.
   */
  async login(input: LoginRequest): Promise<IssuedSession> {
    const accountKey = loginAccountKey(this.env.LOGIN_ATTEMPT_SECRET, input.email);
    const now = new Date();
    const windowEnd = new Date(now.getTime() + this.env.LOGIN_FAILURE_WINDOW_MINUTES * 60_000);
    const attempts = await this.loginAttempts.begin(accountKey, now, windowEnd);
    if (attempts.count > this.env.LOGIN_FAILURE_LIMIT) {
      const minutes = Math.max(
        1,
        Math.ceil((attempts.expiresAt.getTime() - now.getTime()) / 60_000),
      );
      throw new AppError(429, 'rate_limited', 'Đăng nhập sai quá nhiều lần', {
        detail: `Tài khoản này tạm dừng đăng nhập vì nhập sai quá nhiều lần. Thử lại sau ${String(minutes)} phút.`,
      });
    }
    let session: IssuedSession | null;
    try {
      session = await this.signInWithPassword(input, accountKey);
    } catch (error) {
      return this.giveBackAttempt(accountKey, attempts, error);
    }
    if (!session) {
      throw new AppError(401, 'invalid_credentials', 'Email hoặc mật khẩu không đúng');
    }
    return session;
  }

  /** A session when the password is right, null when it is wrong or the email has no account. */
  private async signInWithPassword(
    input: LoginRequest,
    accountKey: string,
  ): Promise<IssuedSession | null> {
    const user = await this.users.findByEmail(input.email);
    const valid = user
      ? await verifyPassword(user.passwordHash, input.password)
      : await verifyPassword(await timingSafeDummyHash(), input.password).then(() => false);
    if (!user || !valid) {
      return null;
    }
    await this.loginAttempts.clear(accountKey);
    return this.issueSession({ id: user._id, name: user.name, email: user.email });
  }

  /** Rethrows `error` once the attempt it counted is given back. */
  private async giveBackAttempt(
    accountKey: string,
    attempts: AttemptWindow,
    error: unknown,
  ): Promise<never> {
    try {
      await this.loginAttempts.giveBack(accountKey, attempts, new Date());
    } catch (giveBackError) {
      throw new AggregateError(
        [error, giveBackError],
        'Login failed, and giving its attempt back failed too',
        { cause: giveBackError },
      );
    }
    throw error;
  }

  async logout(token: string | undefined): Promise<void> {
    if (token) {
      await this.sessions.delete(hashSessionToken(token));
    }
  }

  async me(user: AuthenticatedUser): Promise<MeResponse> {
    const memberships = await this.workspaces.listForUser(user.id);
    return {
      user: { id: user.id.toHexString(), name: user.name, email: user.email },
      memberships: memberships.map(({ workspace, role, siteIds }) => ({
        workspace: { id: workspace._id.toHexString(), name: workspace.name },
        role,
        siteIds: siteIds?.map((id) => id.toHexString()) ?? null,
      })),
    };
  }

  private async issueSession(user: AuthenticatedUser): Promise<IssuedSession> {
    const token = newSessionToken();
    const expiresAt = new Date(Date.now() + this.env.SESSION_TTL_DAYS * 24 * 60 * 60 * 1000);
    await this.sessions.create(user.id, hashSessionToken(token), expiresAt);
    return { token, expiresAt, me: await this.me(user) };
  }
}
