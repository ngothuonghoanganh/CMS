import {
  createHash,
  createHmac,
  randomBytes,
  randomUUID,
  timingSafeEqual,
} from 'node:crypto';

import {
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Model } from 'mongoose';

import {
  AuthPrincipalSchema,
  AuthSessionResponseSchema,
  AuthUserSchema,
  WorkspaceSchema,
  type AuthPrincipal,
  type AuthSessionResponse,
  type LoginRequest,
  type Workspace,
} from '@payload/contracts';

import { env } from '../../config/env';
import {
  AuthSessionRecord,
  type AuthSessionDocument,
} from '../../persistence/schemas/auth-session.schema';
import {
  WorkspaceRecord,
  type WorkspaceDocument,
} from '../../persistence/schemas/workspace.schema';

type AccessTokenClaims = {
  sub: string;
  sid: string;
  iat: number;
  exp: number;
};

type SessionTokens = {
  accessToken: string;
  refreshToken: string;
  accessTokenExpiresAt: number;
};

export type LoginResult = SessionTokens & {
  response: AuthSessionResponse;
};

const ACCESS_TOKEN_HEADER = { alg: 'HS256', typ: 'JWT' } as const;

function encodeBase64Url(value: string | Buffer): string {
  return Buffer.from(value).toString('base64url');
}

function decodeBase64Url(value: string): Buffer {
  return Buffer.from(value, 'base64url');
}

function hashRefreshToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

@Injectable()
export class AuthenticationService {
  readonly accessTokenCookieName = env.AUTH_ACCESS_TOKEN_COOKIE_NAME;
  readonly refreshTokenCookieName = env.AUTH_REFRESH_TOKEN_COOKIE_NAME;

  constructor(
    @InjectModel(WorkspaceRecord.name)
    private readonly workspaceModel: Model<WorkspaceRecord>,
    @InjectModel(AuthSessionRecord.name)
    private readonly sessionModel: Model<AuthSessionRecord>,
  ) {}

  async login(input: LoginRequest): Promise<LoginResult> {
    if (!this.hasValidCredentials(input)) {
      throw new UnauthorizedException({
        code: 'INVALID_CREDENTIALS',
        message: 'The email or password is invalid',
      });
    }

    const workspaceRecord = await this.workspaceModel
      .findOne()
      .sort({ createdAt: 1, _id: 1 })
      .exec();
    if (!workspaceRecord) {
      throw new ServiceUnavailableException({
        code: 'AUTH_WORKSPACE_UNAVAILABLE',
        message: 'Authentication is temporarily unavailable',
      });
    }

    const workspace = this.toWorkspace(workspaceRecord);
    const principalId = input.email.toLowerCase();
    const { session, refreshToken } = await this.createSession({
      email: principalId,
      principalId,
      workspaceId: workspace.id,
    });
    const tokens = this.issueAccessToken(session._id, principalId, refreshToken);
    const principal = this.toPrincipal(session, principalId);

    return {
      ...tokens,
      response: this.toSessionResponse(
        principal,
        principalId,
        workspace,
        tokens.accessTokenExpiresAt,
      ),
    };
  }

  async refresh(refreshToken: string | undefined): Promise<LoginResult> {
    if (!refreshToken) {
      throw this.refreshTokenError('REFRESH_TOKEN_INVALID');
    }

    const tokenHash = hashRefreshToken(refreshToken);
    const session = await this.sessionModel
      .findOne({ refreshTokenHash: tokenHash })
      .exec();
    if (!session) {
      throw this.refreshTokenError('REFRESH_TOKEN_INVALID');
    }

    const now = new Date();
    if (session.revokedAt) {
      throw this.refreshTokenError(
        session.replacedBySessionId ? 'REFRESH_TOKEN_INVALID' : 'SESSION_REVOKED',
      );
    }
    if (session.expiresAt.getTime() <= now.getTime()) {
      throw this.refreshTokenError('REFRESH_TOKEN_EXPIRED');
    }

    const nextSessionId = randomUUID();
    const nextRefreshToken = randomBytes(48).toString('base64url');
    const nextSession = {
      _id: nextSessionId,
      principalId: session.principalId,
      email: session.email,
      workspaceId: session.workspaceId,
      refreshTokenHash: hashRefreshToken(nextRefreshToken),
      createdAt: now,
      lastUsedAt: now,
      expiresAt: new Date(now.getTime() + env.AUTH_REFRESH_TOKEN_TTL_SECONDS * 1000),
      revokedAt: null,
      replacedBySessionId: null,
    };

    // The conditional update makes rotation single-use even when two refresh
    // requests race. Only the winner may create the replacement session.
    const rotated = await this.sessionModel
      .findOneAndUpdate(
        {
          _id: session._id,
          refreshTokenHash: tokenHash,
          revokedAt: null,
        },
        {
          $set: {
            lastUsedAt: now,
            replacedBySessionId: nextSessionId,
            revokedAt: now,
          },
        },
        { new: true },
      )
      .exec();
    if (!rotated) {
      throw this.refreshTokenError('SESSION_REVOKED');
    }

    const createdSession = await this.sessionModel.create(nextSession);
    const workspace = await this.getWorkspace(createdSession.workspaceId);
    const principal = this.toPrincipal(createdSession, createdSession.principalId);
    const tokens = this.issueAccessToken(
      createdSession._id,
      createdSession.principalId,
      nextRefreshToken,
    );

    return {
      ...tokens,
      response: this.toSessionResponse(
        principal,
        createdSession.email,
        workspace,
        tokens.accessTokenExpiresAt,
      ),
    };
  }

  async authenticate(token: string | undefined): Promise<AuthPrincipal> {
    if (!token) {
      throw this.unauthorized();
    }

    const claims = this.verifyAccessToken(token);
    const session = await this.sessionModel
      .findOne({
        _id: claims.sid,
        principalId: claims.sub,
      })
      .exec();
    if (!session || session.revokedAt || session.expiresAt.getTime() <= Date.now()) {
      throw this.unauthorized(
        'SESSION_REVOKED',
        'The authentication session is no longer active',
      );
    }

    return this.toPrincipal(session, claims.sub);
  }

  async getSessionResponse(principal: AuthPrincipal): Promise<AuthSessionResponse> {
    const workspaceId = principal.workspaceId;
    const sessionId = principal.sessionId;
    if (!workspaceId || !sessionId) {
      throw this.unauthorized();
    }

    const session = await this.sessionModel
      .findOne({ _id: sessionId, principalId: principal.subject, revokedAt: null })
      .exec();
    if (!session || session.expiresAt.getTime() <= Date.now()) {
      throw this.unauthorized(
        'SESSION_REVOKED',
        'The authentication session is no longer active',
      );
    }

    const workspace = await this.getWorkspace(workspaceId);
    return this.toSessionResponse(
      principal,
      session.email,
      workspace,
      Date.now() + env.AUTH_ACCESS_TOKEN_TTL_SECONDS * 1000,
    );
  }

  async logout(
    accessToken: string | undefined,
    refreshToken: string | undefined,
  ): Promise<void> {
    const sessionIds = new Set<string>();

    if (accessToken) {
      try {
        sessionIds.add(this.verifyAccessToken(accessToken, true).sid);
      } catch {
        // Logout still clears cookies when the access token has expired.
      }
    }

    if (refreshToken) {
      const session = await this.sessionModel
        .findOne({ refreshTokenHash: hashRefreshToken(refreshToken) })
        .select({ _id: 1 })
        .exec();
      if (session) {
        sessionIds.add(session._id);
      }
    }

    if (sessionIds.size > 0) {
      await this.sessionModel
        .updateMany(
          { _id: { $in: [...sessionIds] }, revokedAt: null },
          { $set: { revokedAt: new Date() } },
        )
        .exec();
    }
  }

  private async createSession(input: {
    email: string;
    principalId: string;
    workspaceId: string;
  }): Promise<{ session: AuthSessionDocument; refreshToken: string }> {
    const now = new Date();
    const refreshToken = randomBytes(48).toString('base64url');
    const session = await this.sessionModel.create({
      _id: randomUUID(),
      ...input,
      refreshTokenHash: hashRefreshToken(refreshToken),
      createdAt: now,
      lastUsedAt: now,
      expiresAt: new Date(now.getTime() + env.AUTH_REFRESH_TOKEN_TTL_SECONDS * 1000),
      revokedAt: null,
      replacedBySessionId: null,
    });
    return { refreshToken, session };
  }

  private issueAccessToken(
    sessionId: string,
    principalId: string,
    refreshToken: string,
  ): SessionTokens {
    // The refresh token is accepted here only to make accidental omission at
    // call sites visible in the type signature; it is never placed in a JWT.
    void refreshToken;
    const now = Math.floor(Date.now() / 1000);
    const claims: AccessTokenClaims = {
      exp: now + env.AUTH_ACCESS_TOKEN_TTL_SECONDS,
      iat: now,
      sid: sessionId,
      sub: principalId,
    };
    const encodedHeader = encodeBase64Url(JSON.stringify(ACCESS_TOKEN_HEADER));
    const encodedPayload = encodeBase64Url(JSON.stringify(claims));
    const signingInput = `${encodedHeader}.${encodedPayload}`;
    const signature = createHmac('sha256', env.AUTH_ACCESS_TOKEN_SECRET)
      .update(signingInput)
      .digest();

    return {
      accessToken: `${signingInput}.${encodeBase64Url(signature)}`,
      accessTokenExpiresAt: claims.exp * 1000,
      refreshToken,
    };
  }

  private verifyAccessToken(token: string, allowExpired = false): AccessTokenClaims {
    const parts = token.split('.');
    if (parts.length !== 3) {
      throw this.unauthorized('ACCESS_TOKEN_INVALID', 'The access token is invalid');
    }

    const encodedHeader = parts[0]!;
    const encodedPayload = parts[1]!;
    const encodedSignature = parts[2]!;
    const expectedSignature = createHmac('sha256', env.AUTH_ACCESS_TOKEN_SECRET)
      .update(`${encodedHeader}.${encodedPayload}`)
      .digest();
    const providedSignature = decodeBase64Url(encodedSignature);
    if (
      expectedSignature.length !== providedSignature.length ||
      !timingSafeEqual(expectedSignature, providedSignature)
    ) {
      throw this.unauthorized('ACCESS_TOKEN_INVALID', 'The access token is invalid');
    }

    try {
      const header = JSON.parse(decodeBase64Url(encodedHeader).toString('utf8')) as {
        alg?: unknown;
        typ?: unknown;
      };
      const payload = JSON.parse(decodeBase64Url(encodedPayload).toString('utf8')) as {
        sub?: unknown;
        sid?: unknown;
        iat?: unknown;
        exp?: unknown;
      };
      if (
        header.alg !== ACCESS_TOKEN_HEADER.alg ||
        header.typ !== ACCESS_TOKEN_HEADER.typ ||
        typeof payload.sub !== 'string' ||
        typeof payload.sid !== 'string' ||
        typeof payload.iat !== 'number' ||
        typeof payload.exp !== 'number'
      ) {
        throw new Error('invalid claims');
      }
      if (!allowExpired && payload.exp <= Math.floor(Date.now() / 1000)) {
        throw this.unauthorized('ACCESS_TOKEN_EXPIRED', 'The access token has expired');
      }
      return {
        exp: payload.exp,
        iat: payload.iat,
        sid: payload.sid,
        sub: payload.sub,
      };
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        throw error;
      }
      throw this.unauthorized('ACCESS_TOKEN_INVALID', 'The access token is invalid');
    }
  }

  private async getWorkspace(workspaceId: string): Promise<Workspace> {
    const record = await this.workspaceModel.findById(workspaceId).exec();
    if (!record) {
      throw this.unauthorized();
    }
    return this.toWorkspace(record);
  }

  private toPrincipal(session: AuthSessionDocument, subject: string): AuthPrincipal {
    return AuthPrincipalSchema.parse({
      sessionId: session._id,
      subject,
      workspaceId: session.workspaceId,
    });
  }

  private hasValidCredentials(input: LoginRequest): boolean {
    const expectedEmail = env.AUTH_EMAIL.toLowerCase();
    const providedEmail = input.email.toLowerCase();
    const expectedPassword = Buffer.from(env.AUTH_PASSWORD);
    const providedPassword = Buffer.from(input.password);
    const passwordMatches =
      expectedPassword.length === providedPassword.length &&
      timingSafeEqual(expectedPassword, providedPassword);

    return providedEmail === expectedEmail && passwordMatches;
  }

  private toWorkspace(record: WorkspaceDocument): Workspace {
    return WorkspaceSchema.parse({
      createdAt: record.createdAt.toISOString(),
      id: record._id.toString(),
      name: record.name,
      updatedAt: record.updatedAt.toISOString(),
    });
  }

  private toSessionResponse(
    principal: AuthPrincipal,
    email: string,
    workspace: Workspace,
    accessTokenExpiresAt: number,
  ): AuthSessionResponse {
    return AuthSessionResponseSchema.parse({
      expiresAt: new Date(accessTokenExpiresAt).toISOString(),
      user: AuthUserSchema.parse({
        email,
        subject: principal.subject,
        workspaceId: workspace.id,
      }),
      workspace,
    });
  }

  private refreshTokenError(
    code: 'REFRESH_TOKEN_INVALID' | 'REFRESH_TOKEN_EXPIRED' | 'SESSION_REVOKED',
  ): UnauthorizedException {
    const messages = {
      REFRESH_TOKEN_EXPIRED: 'The refresh token has expired',
      REFRESH_TOKEN_INVALID: 'The refresh token is invalid',
      SESSION_REVOKED: 'The authentication session has been revoked',
    } as const;
    return this.unauthorized(code, messages[code]);
  }

  private unauthorized(
    code = 'UNAUTHENTICATED',
    message = 'Authentication is required',
  ): UnauthorizedException {
    return new UnauthorizedException({ code, message });
  }
}
