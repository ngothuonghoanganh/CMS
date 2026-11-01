import { Injectable, Logger } from '@nestjs/common';
import type { InvitedSignupRequest, LoginRequest, MeResponse, SignupRequest } from '@plp/contracts';
import type { Env } from '../../config/env.js';
import { InjectEnv } from '../../shared/env.js';
import { AppError, notFound } from '../../shared/errors.js';
import { isDuplicateKeyError } from '../../shared/persistence/duplicate-key.js';
import { newObjectId, type ObjectId } from '../../shared/persistence/object-id.js';
import { TransactionRunner } from '../../shared/persistence/transaction.js';
import { WorkspaceDatabases } from '../../shared/persistence/workspace-databases.js';
import { hashInvitationToken, invitationState } from '../workspaces/domain/member-rules.js';
import { InvitationsRepository } from '../workspaces/invitations.repository.js';
import { INVITATION_UNAVAILABLE, WorkspaceJoin } from '../workspaces/workspace-join.service.js';
import { CustomRolesRepository } from '../workspaces/custom-roles.repository.js';
import { accessOf } from '../workspaces/domain/member-access.js';
import { slugBaseOf, slugCandidates } from '../workspaces/domain/workspace-slug.js';
import { WORKSPACES_SLUG_INDEX } from '../workspaces/workspace.schema.js';
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

/**
 * Sign-ups racing for one address: each loser tries the next free one. Every round has a winner,
 * so this many racers at once all get through.
 */
const SLUG_ATTEMPTS = 10;

/** Addresses asked about in one query while looking for a free one. */
const SLUG_BATCH = 20;

function emailTaken(cause?: unknown): AppError {
  return new AppError(409, 'email_taken', 'Email này đã được đăng ký', {
    issues: [{ path: ['email'], code: 'email_taken', message: 'Email này đã được đăng ký' }],
    cause,
  });
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    @InjectEnv() private readonly env: Env,
    private readonly users: UsersRepository,
    private readonly sessions: SessionsRepository,
    private readonly loginAttempts: LoginAttemptsRepository,
    private readonly workspaces: WorkspacesRepository,
    private readonly customRoles: CustomRolesRepository,
    private readonly invitations: InvitationsRepository,
    private readonly join: WorkspaceJoin,
    private readonly transactions: TransactionRunner,
    private readonly databases: WorkspaceDatabases,
  ) {}

  /**
   * Creates the user, their workspace and owner membership atomically, then signs them in. The
   * workspace's database is created first, so the workspace never exists without it (ADR-025).
   */
  async signup(input: SignupRequest): Promise<IssuedSession> {
    const passwordHash = await hashPassword(input.password);
    // The unique index decides; this only spares creating a database for a taken email.
    if ((await this.users.findByEmail(input.email)) !== null) {
      throw emailTaken();
    }
    const workspaceId = newObjectId();
    let userId;
    try {
      await this.databases.build(workspaceId);
      userId = await this.createOwner(input, passwordHash, workspaceId);
    } catch (error) {
      await this.dropDatabase(workspaceId, error);
      throw isDuplicateKeyError(error, USERS_EMAIL_INDEX) ? emailTaken(error) : error;
    }
    return this.issueSession({ id: userId, name: input.name, email: input.email });
  }

  /**
   * The user, their workspace at the first free address its name asks for, and the owner
   * membership, in one transaction. Another sign-up can take that address meanwhile: the unique
   * index refuses the second, which then tries the next free one (ADR-025).
   */
  private async createOwner(
    input: SignupRequest,
    passwordHash: string,
    workspaceId: ObjectId,
  ): Promise<ObjectId> {
    const base = slugBaseOf(input.workspaceName);
    for (let attempt = 1; ; attempt += 1) {
      const slug = await this.freeSlug(base);
      try {
        return await this.transactions.run(async (tx) => {
          const user = await this.users.create(
            { email: input.email, name: input.name, passwordHash },
            tx,
          );
          await this.workspaces.createWithOwner(
            { id: workspaceId, name: input.workspaceName, slug },
            user._id,
            tx,
          );
          return user._id;
        });
      } catch (error) {
        if (attempt >= SLUG_ATTEMPTS || !isDuplicateKeyError(error, WORKSPACES_SLUG_INDEX)) {
          throw error;
        }
      }
    }
  }

  /** The first form of `base` no workspace has: `base`, `base-2`, … asked a batch at a time. */
  private async freeSlug(base: string): Promise<string> {
    for (let from = 1; ; from += SLUG_BATCH) {
      const candidates = slugCandidates(base, from, SLUG_BATCH);
      const taken = await this.workspaces.takenSlugs(candidates);
      const free = candidates.find((slug) => !taken.has(slug));
      if (free !== undefined) {
        return free;
      }
    }
  }

  /** The database of a workspace that was not created holds nothing and nothing routes to it. */
  private async dropDatabase(workspaceId: ObjectId, cause: unknown): Promise<void> {
    try {
      // A commit whose answer was lost may have created the workspace after all: keep its data.
      if ((await this.workspaces.findSlug(workspaceId)) !== null) {
        return;
      }
      await this.databases.drop(workspaceId);
    } catch (error) {
      // Only the kind of the first error: a duplicate key's message carries the email.
      this.logger.error(
        {
          err: error,
          cause: cause instanceof Error ? cause.name : typeof cause,
          workspaceId: workspaceId.toHexString(),
        },
        'Database of a workspace not created was not dropped',
      );
    }
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

  /** Ends every session the browser presented (ADR-025: up to one per cookie scope). */
  async logout(tokens: readonly string[]): Promise<void> {
    for (const token of tokens) {
      await this.sessions.delete(hashSessionToken(token));
    }
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

  private async issueSession(user: AuthenticatedUser): Promise<IssuedSession> {
    const token = newSessionToken();
    const expiresAt = new Date(Date.now() + this.env.SESSION_TTL_DAYS * 24 * 60 * 60 * 1000);
    await this.sessions.create(user.id, hashSessionToken(token), expiresAt);
    return { token, expiresAt, me: await this.me(user) };
  }
}
