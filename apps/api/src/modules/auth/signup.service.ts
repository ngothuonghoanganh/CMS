import { Injectable, Logger } from '@nestjs/common';
import {
  type AccountEmailRequest,
  type AccountEmailResponse,
  FORGOT_PASSWORD_PATH,
  SIGNUP_LINK_VALID_HOURS,
  SIGNUP_VERIFY_PATH,
  type SignupLookupRequest,
  type SignupLookupResponse,
  type SignupRequest,
  type SignupVerifyRequest,
} from '@plp/contracts';
import type { Env } from '../../config/env.js';
import { InjectEnv } from '../../shared/env.js';
import { AppError } from '../../shared/errors.js';
import { isDuplicateKeyError } from '../../shared/persistence/duplicate-key.js';
import { newObjectId, type ObjectId } from '../../shared/persistence/object-id.js';
import { TransactionRunner } from '../../shared/persistence/transaction.js';
import { WorkspaceDatabases } from '../../shared/persistence/workspace-databases.js';
import { accountExistsEmail, signupConfirmationEmail } from '../notifications/emails.js';
import { slugBaseOf, slugCandidates } from '../workspaces/domain/workspace-slug.js';
import { WORKSPACES_SLUG_INDEX } from '../workspaces/workspace.schema.js';
import { WorkspacesRepository } from '../workspaces/workspaces.repository.js';
import type { PendingSignupRecord } from './account.schema.js';
import { AccountEmails } from './account-emails.js';
import { accountLink, hashLinkToken, newLinkToken, signupLinkExpiry } from './account-links.js';
import { AuthService, type IssuedSession } from './auth.service.js';
import { hashPassword } from './password.js';
import { PendingSignupsRepository } from './pending-signups.repository.js';
import { USERS_EMAIL_INDEX, UsersRepository } from './users.repository.js';

/**
 * Sign-ups racing for one address: each loser tries the next free one. Every round has a winner,
 * so this many racers at once all get through.
 */
const SLUG_ATTEMPTS = 10;

/** Addresses asked about in one query while looking for a free one. */
const SLUG_BATCH = 20;

function emailTaken(cause?: unknown): AppError {
  return new AppError(409, 'email_taken', 'Email này đã có tài khoản', {
    detail: 'Đăng nhập bằng email này. Nếu quên mật khẩu, hãy chọn "Quên mật khẩu?".',
    cause,
  });
}

function signupLinkInvalid(): AppError {
  return new AppError(410, 'signup_link_invalid', 'Link xác nhận không còn dùng được', {
    detail:
      'Link đã được dùng, đã hết hạn hoặc không đúng. Hãy đăng ký lại để nhận link xác nhận mới.',
  });
}

/** The account a confirmed sign-up creates: the password and names chosen on the link's page. */
interface NewOwner {
  name: string;
  workspaceName: string;
  passwordHash: string;
}

/**
 * Signing up in two steps (ADR-026): the form only stores the sign-up and emails a link; the
 * account, its workspace and the workspace's database exist once the link confirms the email.
 * The password is chosen on the link's page, by whoever proved they read that mailbox.
 */
@Injectable()
export class SignupService {
  private readonly logger = new Logger(SignupService.name);

  constructor(
    @InjectEnv() private readonly env: Env,
    private readonly auth: AuthService,
    private readonly users: UsersRepository,
    private readonly pending: PendingSignupsRepository,
    private readonly workspaces: WorkspacesRepository,
    private readonly emails: AccountEmails,
    private readonly transactions: TransactionRunner,
    private readonly databases: WorkspaceDatabases,
  ) {}

  /**
   * Stores the sign-up, replacing an earlier one of the email, and emails its link. An email with
   * an account stores nothing and gets "already has an account" instead; the answer is the same,
   * so it tells nobody which emails are registered.
   */
  async start(input: SignupRequest): Promise<AccountEmailResponse> {
    const now = new Date();
    await this.emails.deliver(input.email, now, 'Sign-up email', async () => {
      const existing = await this.users.findByEmail(input.email);
      if (existing !== null) {
        return accountExistsEmail({
          userId: existing._id.toHexString(),
          requestedAt: now,
          loginUrl: `${this.env.ADMIN_ORIGIN}/login`,
          forgotUrl: `${this.env.ADMIN_ORIGIN}${FORGOT_PASSWORD_PATH}`,
        });
      }
      const { token, tokenHash } = newLinkToken();
      const expiresAt = signupLinkExpiry(now);
      const signupId = await this.pending.replace(
        {
          email: input.email,
          name: input.name,
          workspaceName: input.workspaceName,
          tokenHash,
          expiresAt,
        },
        now,
      );
      return this.confirmationEmail(
        { _id: signupId, workspaceName: input.workspaceName, expiresAt },
        token,
      );
    });
    return { email: input.email };
  }

  /** A new link, valid 24 hours again, for a sign-up still waiting; nothing otherwise. */
  async resend(input: AccountEmailRequest): Promise<AccountEmailResponse> {
    const now = new Date();
    await this.emails.deliver(input.email, now, 'Sign-up email sent again', async () => {
      const { token, tokenHash } = newLinkToken();
      const renewed = await this.pending.renew(input.email, tokenHash, signupLinkExpiry(now), now);
      return renewed === null ? null : this.confirmationEmail(renewed, token);
    });
    return { email: input.email };
  }

  /** What the link's page shows: the email, and the names to prefill. Uses nothing up. */
  async lookup(input: SignupLookupRequest): Promise<SignupLookupResponse> {
    const pending = await this.activeSignup(input.token);
    return { email: pending.email, name: pending.name, workspaceName: pending.workspaceName };
  }

  /**
   * Creates the user, with the password chosen on the link's page, their workspace and the owner
   * membership from the sign-up the link names, then signs them in. The workspace's database is
   * built first, and the transaction that creates them also removes the sign-up, so a link
   * creates one account at most (ADR-025, ADR-026).
   */
  async verify(input: SignupVerifyRequest): Promise<IssuedSession> {
    const pending = await this.activeSignup(input.token);
    // The email got an account while the sign-up waited, e.g. from an invitation.
    if ((await this.users.findByEmail(pending.email)) !== null) {
      await this.pending.delete(pending._id);
      throw emailTaken();
    }
    const owner: NewOwner = {
      name: input.name,
      workspaceName: input.workspaceName,
      passwordHash: await hashPassword(input.password),
    };
    const workspaceId = newObjectId();
    let userId;
    try {
      await this.databases.build(workspaceId);
      userId = await this.createOwner(pending, owner, workspaceId);
    } catch (error) {
      await this.dropDatabase(workspaceId, error);
      // An account made in the same moment; the sign-up goes once its link is opened again.
      throw isDuplicateKeyError(error, USERS_EMAIL_INDEX) ? emailTaken(error) : error;
    }
    return this.auth.issueSession({ id: userId, name: owner.name, email: pending.email }, 0);
  }

  private async activeSignup(token: string): Promise<PendingSignupRecord> {
    const pending = await this.pending.findActiveByTokenHash(hashLinkToken(token), new Date());
    if (pending === null) {
      throw signupLinkInvalid();
    }
    return pending;
  }

  private confirmationEmail(
    signup: Pick<PendingSignupRecord, '_id' | 'workspaceName' | 'expiresAt'>,
    token: string,
  ) {
    return signupConfirmationEmail({
      signupId: signup._id.toHexString(),
      linkExpiresAt: signup.expiresAt,
      workspaceName: signup.workspaceName,
      confirmUrl: accountLink(this.env.ADMIN_ORIGIN, SIGNUP_VERIFY_PATH, token),
      validHours: SIGNUP_LINK_VALID_HOURS,
    });
  }

  /**
   * The user, their workspace at the first free address its name asks for, and the owner
   * membership, in one transaction that also takes the sign-up away. Another sign-up can take
   * that address meanwhile: the unique index refuses the second, which then tries the next free
   * one (ADR-025).
   */
  private async createOwner(
    pending: PendingSignupRecord,
    owner: NewOwner,
    workspaceId: ObjectId,
  ): Promise<ObjectId> {
    const base = slugBaseOf(owner.workspaceName);
    for (let attempt = 1; ; attempt += 1) {
      const slug = await this.freeSlug(base);
      try {
        return await this.transactions.run(async (tx) => {
          // Used, sent again or replaced since it was read: this link no longer counts.
          if (!(await this.pending.claim(pending._id, pending.tokenHash, tx))) {
            throw signupLinkInvalid();
          }
          const user = await this.users.create(
            { email: pending.email, name: owner.name, passwordHash: owner.passwordHash },
            tx,
          );
          await this.workspaces.createWithOwner(
            { id: workspaceId, name: owner.workspaceName, slug },
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
}
