// AuthService — register, login, refresh (with rotation), logout, me.
//
// Refresh tokens are opaque random strings stored in Redis under
// auth:refresh:<userId>:<tokenId>. Access tokens are short-lived JWTs
// (15 min). The refresh cookie is HttpOnly + SameSite=Lax + Secure (prod).

import { Inject, Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import type { PrismaClient } from '@citizen-shield/database';
import type Redis from 'ioredis';
import { env } from '@citizen-shield/config';
import { ErrorCode } from '@citizen-shield/errors';
import {
  ACCESS_TOKEN_TTL_SECONDS,
  REFRESH_TOKEN_TTL_SECONDS,
  buildClearRefreshCookie,
  buildRefreshCookie,
  generateRefreshToken,
  signAccessToken,
  verifyPassword,
} from '@citizen-shield/auth';
import type { AuthResponse, SafeUserDto } from '@citizen-shield/validation';
import { REDIS_CLIENT } from '../redis/redis.module';
import { PRISMA_CLIENT } from '../database/database.module';
import { UsersService } from '../users/users.service';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly secureCookie = env.NODE_ENV === 'production';

  constructor(
    @Inject(PRISMA_CLIENT) private readonly prisma: PrismaClient,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    private readonly users: UsersService,
  ) {}

  // -------- Registration --------

  async register(input: {
    email: string;
    password: string;
    name: string;
  }): Promise<{ response: AuthResponse; refreshCookie: string; refreshToken: string }> {
    const user = await this.users.create(input);
    return this.issueTokens(user, 'register');
  }

  // -------- Login --------

  async login(input: { email: string; password: string }): Promise<{
    response: AuthResponse;
    refreshCookie: string;
    refreshToken: string;
  }> {
    const user = await this.users.findByEmailWithHash(input.email);
    if (!user) {
      throw new UnauthorizedException({
        code: ErrorCode.AUTH_INVALID_CREDENTIALS,
        message: 'Invalid email or password',
      });
    }
    const ok = await verifyPassword(user.passwordHash, input.password);
    if (!ok) {
      throw new UnauthorizedException({
        code: ErrorCode.AUTH_INVALID_CREDENTIALS,
        message: 'Invalid email or password',
      });
    }
    return this.issueTokens(this.users.toSafeUser(user), 'login');
  }

  // -------- Refresh (with rotation) --------

  async refresh(refreshToken: string): Promise<{
    response: AuthResponse;
    refreshCookie: string;
    refreshToken: string;
  } | null> {
    // Refresh token shape is `<tokenId>.<secret>`. We store the secret
    // portion in Redis; the tokenId is the lookup key.
    const [tokenId, secret] = refreshToken.split('.');
    if (!tokenId || !secret) return null;

    // Look up all keys for this tokenId. We can't reverse-lookup userId from
    // tokenId alone, so we maintain the index `auth:refresh:index:<tokenId>`.
    // For simplicity in M3 we store the userId alongside the secret using a
    // single key `auth:refresh:<tokenId>` whose value is `<userId>:<secret>`.
    const raw = await this.redis.get(`auth:refresh:index:${tokenId}`);
    if (!raw) return null;
    const [userId, storedSecret] = raw.split(':');
    if (!userId || storedSecret !== secret) return null;

    // Rotate: delete the old index entry, mint a new pair.
    await this.redis.del(`auth:refresh:index:${tokenId}`);

    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) return null;

    return this.issueTokens(this.users.toSafeUser(user), 'refresh');
  }

  // -------- Logout --------

  async logout(refreshToken: string | undefined): Promise<{ clearCookie: string }> {
    if (refreshToken) {
      const [tokenId] = refreshToken.split('.');
      if (tokenId) {
        await this.redis.del(`auth:refresh:index:${tokenId}`);
      }
    }
    return { clearCookie: buildClearRefreshCookie(this.secureCookie) };
  }

  // -------- Me --------

  async me(userId: string): Promise<SafeUserDto> {
    return this.users.findById(userId);
  }

  // -------- helpers --------

  private async issueTokens(
    user: SafeUserDto,
    source: 'register' | 'login' | 'refresh',
  ): Promise<{ response: AuthResponse; refreshCookie: string; refreshToken: string }> {
    const accessToken = await signAccessToken({
      sub: user.id,
      email: user.email,
      role: user.role,
    });
    const tokenId = generateRefreshToken();
    const secret = generateRefreshToken();
    const refreshToken = `${tokenId}.${secret}`;
    await this.redis.set(
      `auth:refresh:index:${tokenId}`,
      `${user.id}:${secret}`,
      'EX',
      REFRESH_TOKEN_TTL_SECONDS,
    );

    const response: AuthResponse = {
      user,
      accessToken,
      expiresIn: ACCESS_TOKEN_TTL_SECONDS,
    };
    const refreshCookie = buildRefreshCookie(refreshToken, {
      secure: this.secureCookie,
      maxAgeSeconds: REFRESH_TOKEN_TTL_SECONDS,
    });
    this.logger.log(`Tokens issued via ${source} for ${user.email}`);
    return { response, refreshCookie, refreshToken };
  }
}
