import { Injectable } from '@nestjs/common';
import type { LoginRequest, MeResponse, SignupRequest } from '@plp/contracts';
import type { Env } from '../../config/env.js';
import { InjectEnv } from '../../shared/env.js';
import { AppError } from '../../shared/errors.js';
import { isDuplicateKeyError } from '../../shared/persistence/duplicate-key.js';
import { TransactionRunner } from '../../shared/persistence/transaction.js';
import { WorkspacesRepository } from '../workspaces/workspaces.repository.js';
import type { AuthenticatedUser } from './authenticated-user.js';
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
    private readonly workspaces: WorkspacesRepository,
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

  async login(input: LoginRequest): Promise<IssuedSession> {
    const user = await this.users.findByEmail(input.email);
    const valid = user
      ? await verifyPassword(user.passwordHash, input.password)
      : await verifyPassword(await timingSafeDummyHash(), input.password).then(() => false);
    if (!user || !valid) {
      throw new AppError(401, 'invalid_credentials', 'Email hoặc mật khẩu không đúng');
    }
    return this.issueSession({ id: user._id, name: user.name, email: user.email });
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
      memberships: memberships.map(({ workspace, role }) => ({
        workspace: { id: workspace._id.toHexString(), name: workspace.name },
        role,
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
