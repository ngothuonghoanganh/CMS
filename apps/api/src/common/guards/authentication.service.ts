import {
  createHash,
  createHmac,
  randomBytes,
  randomUUID,
  scrypt as nodeScrypt,
  timingSafeEqual,
} from 'node:crypto';
import { promisify } from 'node:util';

import {
  Inject,
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
  SwitchAuthContextRequestSchema,
  WorkspaceSchema,
  type AuthPrincipal,
  type AuthSessionResponse,
  type LoginRequest,
  type SwitchAuthContextRequest,
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
import { TenantMembershipRecord } from '../../tenancy/schemas/tenant-membership.schema';
import { TenantUserRecord } from '../../tenancy/schemas/tenant-user.schema';
import { TenantContext } from '../../tenancy/tenant-context';
import { TenantResolver } from '../../tenancy/tenant-resolver';

type AccessTokenClaims = {
  sub: string;
  sid: string;
  tid: string;
  iat: number;
  exp: number;
};

type SessionTokens = {
  accessToken: string;
  refreshToken: string;
  accessTokenExpiresAt: number;
};

export type LoginResult = SessionTokens & { response: AuthSessionResponse };

const ACCESS_TOKEN_HEADER = { alg: 'HS256', typ: 'JWT' } as const;
const scrypt = promisify(nodeScrypt);

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
    @InjectModel(TenantUserRecord.name)
    private readonly userModel: Model<TenantUserRecord>,
    @InjectModel(TenantMembershipRecord.name)
    private readonly membershipModel: Model<TenantMembershipRecord>,
    @Inject(TenantResolver) private readonly resolver: TenantResolver,
    @Inject(TenantContext) private readonly context: TenantContext,
  ) {}

  async login(input: LoginRequest): Promise<LoginResult> {
    const scope = await this.resolver.resolveForLogin({ tenantSlug: input.tenantSlug });
    await this.resolver.ensureConnection(scope);
    return this.context.run(scope, async () => {
      const user = await this.userModel
        .findOne({ email: input.email.toLowerCase(), status: 'active' })
        .select('+passwordHash')
        .exec();
      if (!user || !(await verifyPassword(input.password, user.passwordHash))) {
        throw new UnauthorizedException({
          code: 'INVALID_CREDENTIALS',
          message: 'The email or password is invalid',
        });
      }
      const membership = await this.membershipModel
        .findOne({ tenantId: scope.id, userId: user.email })
        .exec();
      if (!membership) {
        throw new UnauthorizedException({
          code: 'TENANT_MEMBERSHIP_REQUIRED',
          message: 'The user is not a member of this tenant',
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

      const principalId = user.email;
      const workspace = this.toWorkspace(workspaceRecord);
      const { session, refreshToken } = await this.createSession({
        email: principalId,
        principalId,
        workspaceId: workspace.id,
        tenantId: scope.id,
      });
      const tokens = this.issueAccessToken(
        session._id,
        principalId,
        scope.id,
        refreshToken,
      );
      const principal = this.toPrincipal(session, principalId, scope.id);
      return {
        ...tokens,
        response: this.toSessionResponse(
          principal,
          principalId,
          workspace,
          scope.slug,
          tokens.accessTokenExpiresAt,
        ),
      };
    });
  }

  async refresh(refreshToken: string | undefined): Promise<LoginResult> {
    const tenantId = this.tenantIdFromRefreshToken(refreshToken);
    const scope = await this.resolver.resolveById(tenantId);
    await this.resolver.ensureConnection(scope);
    return this.context.run(scope, async () => {
      if (!refreshToken) throw this.refreshTokenError('REFRESH_TOKEN_INVALID');
      const tokenHash = hashRefreshToken(refreshToken);
      const session = await this.sessionModel
        .findOne({ refreshTokenHash: tokenHash })
        .exec();
      if (!session) throw this.refreshTokenError('REFRESH_TOKEN_INVALID');
      this.assertSessionActive(session);

      const now = new Date();
      const nextSessionId = randomUUID();
      const nextRefreshToken = `${scope.id}.${randomBytes(48).toString('base64url')}`;
      const rotated = await this.sessionModel
        .findOneAndUpdate(
          { _id: session._id, refreshTokenHash: tokenHash, revokedAt: null },
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
      if (!rotated) throw this.refreshTokenError('SESSION_REVOKED');

      const createdSession = await this.sessionModel.create({
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
      });
      const workspace = await this.getWorkspace(createdSession.workspaceId);
      const principal = this.toPrincipal(
        createdSession,
        createdSession.principalId,
        scope.id,
      );
      const tokens = this.issueAccessToken(
        createdSession._id,
        createdSession.principalId,
        scope.id,
        nextRefreshToken,
      );
      return {
        ...tokens,
        response: this.toSessionResponse(
          principal,
          createdSession.email,
          workspace,
          scope.slug,
          tokens.accessTokenExpiresAt,
        ),
      };
    });
  }

  async authenticate(token: string | undefined): Promise<AuthPrincipal> {
    if (!token) throw this.unauthorized();
    const claims = this.verifyAccessToken(token);
    const scope = await this.resolver.resolveById(claims.tid);
    await this.resolver.ensureConnection(scope);
    const session = await this.sessionModel
      .findOne({ _id: claims.sid, principalId: claims.sub })
      .exec();
    if (!session || session.revokedAt || session.expiresAt.getTime() <= Date.now()) {
      throw this.unauthorized(
        'SESSION_REVOKED',
        'The authentication session is no longer active',
      );
    }
    return this.toPrincipal(session, claims.sub, scope.id);
  }

  async getSessionResponse(principal: AuthPrincipal): Promise<AuthSessionResponse> {
    const workspaceId = principal.workspaceId;
    const sessionId = principal.sessionId;
    const tenantId = principal.tenantId;
    if (!workspaceId || !sessionId || !tenantId) throw this.unauthorized();
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
    const scope = this.context.require();
    return this.toSessionResponse(
      principal,
      session.email,
      workspace,
      scope.slug,
      Date.now() + env.AUTH_ACCESS_TOKEN_TTL_SECONDS * 1000,
    );
  }

  async switchContext(
    principal: AuthPrincipal,
    input: SwitchAuthContextRequest,
  ): Promise<LoginResult> {
    // The old request field is retained as a wire-compatibility alias while the
    // value is now a Master Tenant id. Workspace remains tenant-local.
    const parsed = SwitchAuthContextRequestSchema.parse(input);
    if (!principal.sessionId) throw this.unauthorized();
    const scope = await this.resolver.resolveById(parsed.organizationId);
    await this.resolver.ensureConnection(scope);
    return this.context.run(scope, async () => {
      const membership = await this.membershipModel
        .findOne({ tenantId: scope.id, userId: principal.subject })
        .exec();
      if (!membership) {
        throw new UnauthorizedException({
          code: 'AUTH_CONTEXT_INVALID',
          message: 'The user is not a member of the requested tenant',
        });
      }
      const user = await this.userModel
        .findOne({ email: principal.subject, status: 'active' })
        .exec();
      if (!user) {
        throw new UnauthorizedException({
          code: 'AUTH_CONTEXT_INVALID',
          message: 'The user is not active in the requested tenant',
        });
      }
      const workspace = await this.workspaceModel.findById(parsed.workspaceId).exec();
      if (!workspace) {
        throw new UnauthorizedException({
          code: 'AUTH_CONTEXT_INVALID',
          message: 'The requested tenant or workspace is not available',
        });
      }
      const { session, refreshToken } = await this.createSession({
        email: user.email,
        principalId: user.email,
        workspaceId: parsed.workspaceId,
        tenantId: scope.id,
      });
      const tokens = this.issueAccessToken(
        session._id,
        user.email,
        scope.id,
        refreshToken,
      );
      const nextPrincipal = this.toPrincipal(session, user.email, scope.id);
      return {
        ...tokens,
        response: this.toSessionResponse(
          nextPrincipal,
          user.email,
          this.toWorkspace(workspace),
          scope.slug,
          tokens.accessTokenExpiresAt,
        ),
      };
    });
  }

  async logout(
    accessToken: string | undefined,
    refreshToken: string | undefined,
  ): Promise<void> {
    const tenantId = this.tenantIdFromTokens(accessToken, refreshToken);
    if (!tenantId) return;
    const scope = await this.resolver.resolveById(tenantId);
    await this.resolver.ensureConnection(scope);
    await this.context.run(scope, async () => {
      const sessionIds = new Set<string>();
      if (accessToken) {
        try {
          sessionIds.add(this.verifyAccessToken(accessToken, true).sid);
        } catch {
          // Cookie clearing remains successful for expired access tokens.
        }
      }
      if (refreshToken) {
        const session = await this.sessionModel
          .findOne({ refreshTokenHash: hashRefreshToken(refreshToken) })
          .select({ _id: 1 })
          .exec();
        if (session) sessionIds.add(session._id);
      }
      if (sessionIds.size > 0) {
        await this.sessionModel
          .updateMany(
            { _id: { $in: [...sessionIds] }, revokedAt: null },
            { $set: { revokedAt: new Date() } },
          )
          .exec();
      }
    });
  }

  private async createSession(input: {
    email: string;
    principalId: string;
    workspaceId: string;
    tenantId: string;
  }): Promise<{ session: AuthSessionDocument; refreshToken: string }> {
    const now = new Date();
    const refreshToken = `${input.tenantId}.${randomBytes(48).toString('base64url')}`;
    const session = await this.sessionModel.create({
      _id: randomUUID(),
      email: input.email,
      principalId: input.principalId,
      workspaceId: input.workspaceId,
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
    tenantId: string,
    refreshToken: string,
  ): SessionTokens {
    const now = Math.floor(Date.now() / 1000);
    const claims: AccessTokenClaims = {
      exp: now + env.AUTH_ACCESS_TOKEN_TTL_SECONDS,
      iat: now,
      sid: sessionId,
      sub: principalId,
      tid: tenantId,
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
    if (parts.length !== 3)
      throw this.unauthorized('ACCESS_TOKEN_INVALID', 'The access token is invalid');
    const [encodedHeader, encodedPayload, encodedSignature] = parts as [
      string,
      string,
      string,
    ];
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
        tid?: unknown;
        iat?: unknown;
        exp?: unknown;
      };
      if (
        header.alg !== ACCESS_TOKEN_HEADER.alg ||
        header.typ !== ACCESS_TOKEN_HEADER.typ ||
        typeof payload.sub !== 'string' ||
        typeof payload.sid !== 'string' ||
        typeof payload.tid !== 'string' ||
        typeof payload.iat !== 'number' ||
        typeof payload.exp !== 'number'
      )
        throw new Error('invalid claims');
      if (!allowExpired && payload.exp <= Math.floor(Date.now() / 1000)) {
        throw this.unauthorized('ACCESS_TOKEN_EXPIRED', 'The access token has expired');
      }
      return {
        exp: payload.exp,
        iat: payload.iat,
        sid: payload.sid,
        sub: payload.sub,
        tid: payload.tid,
      };
    } catch (error) {
      if (error instanceof UnauthorizedException) throw error;
      throw this.unauthorized('ACCESS_TOKEN_INVALID', 'The access token is invalid');
    }
  }

  private async getWorkspace(workspaceId: string): Promise<Workspace> {
    const record = await this.workspaceModel.findById(workspaceId).exec();
    if (!record) throw this.unauthorized();
    return this.toWorkspace(record);
  }

  private toPrincipal(
    session: AuthSessionDocument,
    subject: string,
    tenantId: string,
  ): AuthPrincipal {
    return AuthPrincipalSchema.parse({
      sessionId: session._id,
      subject,
      tenantId,
      workspaceId: session.workspaceId,
    });
  }

  private toWorkspace(record: WorkspaceDocument): Workspace {
    return WorkspaceSchema.parse({
      createdAt: record.createdAt.toISOString(),
      id: record._id.toString(),
      organizationId: this.context.require().id,
      name: record.name,
      updatedAt: record.updatedAt.toISOString(),
    });
  }

  private toSessionResponse(
    principal: AuthPrincipal,
    email: string,
    workspace: Workspace,
    tenantSlug: string,
    accessTokenExpiresAt: number,
  ): AuthSessionResponse {
    return AuthSessionResponseSchema.parse({
      expiresAt: new Date(accessTokenExpiresAt).toISOString(),
      user: AuthUserSchema.parse({
        email,
        subject: principal.subject,
        tenantId: principal.tenantId,
        tenantSlug,
        workspaceId: workspace.id,
      }),
      workspace,
    });
  }

  private assertSessionActive(session: AuthSessionDocument): void {
    if (session.revokedAt) {
      throw this.refreshTokenError(
        session.replacedBySessionId ? 'REFRESH_TOKEN_INVALID' : 'SESSION_REVOKED',
      );
    }
    if (session.expiresAt.getTime() <= Date.now()) {
      throw this.refreshTokenError('REFRESH_TOKEN_EXPIRED');
    }
  }

  private tenantIdFromRefreshToken(token: string | undefined): string {
    const tenantId = token?.split('.', 1)[0];
    if (!tenantId) throw this.refreshTokenError('REFRESH_TOKEN_INVALID');
    return tenantId;
  }

  private tenantIdFromTokens(
    accessToken?: string,
    refreshToken?: string,
  ): string | undefined {
    if (accessToken) {
      try {
        return this.verifyAccessToken(accessToken, true).tid;
      } catch {
        // Try the refresh token below when access has expired.
      }
    }
    return refreshToken?.split('.', 1)[0];
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

async function verifyPassword(
  password: string,
  storedHash: string | undefined,
): Promise<boolean> {
  if (!storedHash || !/^scrypt\$[^$]+\$[0-9a-f]+$/.test(storedHash)) return false;
  const [, salt, expectedHex] = storedHash.split('$');
  if (!salt || !expectedHex) return false;
  const expected = Buffer.from(expectedHex, 'hex');
  const derived = (await scrypt(password, salt, expected.length)) as Buffer;
  return expected.length === derived.length && timingSafeEqual(expected, derived);
}
