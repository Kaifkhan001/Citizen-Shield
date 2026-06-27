import {
  Body,
  Controller,
  Get,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { Throttle } from '@nestjs/throttler';
import { ApiTags } from '@nestjs/swagger';
import { ErrorCode } from '@citizen-shield/errors';
import {
  registerSchema,
  loginSchema,
  type AuthResponse,
  type SafeUserDto,
} from '@citizen-shield/validation';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { CurrentUser, type AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { REFRESH_COOKIE_NAME } from '@citizen-shield/auth';
import { env } from '@citizen-shield/config';
import { AuthService } from './auth.service';

// Per-route rate limit for `/auth/*` — stricter than the global default
// (env: `AUTH_RATE_LIMIT_*`) to deter credential stuffing. Tests raise the
// limit so a single suite can issue hundreds of auth requests.
const AUTH_THROTTLE_LIMIT = env.NODE_ENV === 'test' ? 100_000 : env.AUTH_RATE_LIMIT_LIMIT;
const AUTH_THROTTLE_TTL = env.NODE_ENV === 'test' ? 1_000 : env.AUTH_RATE_LIMIT_TTL;
const AUTH_THROTTLE = { default: { limit: AUTH_THROTTLE_LIMIT, ttl: AUTH_THROTTLE_TTL } };

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('register')
  @Throttle(AUTH_THROTTLE)
  async register(
    @Body(new ZodValidationPipe(registerSchema))
    body: { email: string; password: string; name: string },
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthResponse> {
    const { response, refreshCookie } = await this.auth.register(body);
    res.setHeader('Set-Cookie', refreshCookie);
    return response;
  }

  @Post('login')
  @Throttle(AUTH_THROTTLE)
  async login(
    @Body(new ZodValidationPipe(loginSchema)) body: { email: string; password: string },
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthResponse> {
    const { response, refreshCookie } = await this.auth.login(body);
    res.setHeader('Set-Cookie', refreshCookie);
    return response;
  }

  @Post('refresh')
  @Throttle(AUTH_THROTTLE)
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthResponse> {
    const cookies = parseCookies(req.headers.cookie);
    const refreshToken = cookies[REFRESH_COOKIE_NAME];
    if (!refreshToken) {
      throw new UnauthorizedException({
        code: ErrorCode.AUTH_REFRESH_EXPIRED,
        message: 'Refresh token missing',
      });
    }
    const result = await this.auth.refresh(refreshToken);
    if (!result) {
      // Clear the stale cookie and throw — the filter wraps it in the
      // canonical `{ success: false, error: { code: AUTH_REFRESH_EXPIRED } }`
      // envelope.
      res.setHeader(
        'Set-Cookie',
        `${REFRESH_COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`,
      );
      throw new UnauthorizedException({
        code: ErrorCode.AUTH_REFRESH_EXPIRED,
        message: 'Refresh token expired or rotated',
      });
    }
    res.setHeader('Set-Cookie', result.refreshCookie);
    return result.response;
  }

  @Post('logout')
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response): Promise<null> {
    const cookies = parseCookies(req.headers.cookie);
    const refreshToken = cookies[REFRESH_COOKIE_NAME];
    const { clearCookie } = await this.auth.logout(refreshToken);
    res.setHeader('Set-Cookie', clearCookie);
    return null;
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  async me(@CurrentUser() user: AuthenticatedUser): Promise<SafeUserDto> {
    return this.auth.me(user.id);
  }
}

function parseCookies(header: string | undefined): Record<string, string> {
  if (!header) return {};
  const out: Record<string, string> = {};
  for (const part of header.split(';')) {
    const [k, ...rest] = part.split('=');
    if (!k) continue;
    out[k.trim()] = decodeURIComponent(rest.join('=').trim());
  }
  return out;
}
