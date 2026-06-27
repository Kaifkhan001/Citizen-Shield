import { Body, Controller, Get, Post, Req, Res, UseGuards } from '@nestjs/common';
import type { Request, Response } from 'express';
import { Throttle } from '@nestjs/throttler';
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

// 5 requests per minute per IP on auth endpoints — strict enough to deter
// credential stuffing without being annoying during development. Tests raise
// the limit so a single suite can issue hundreds of auth requests without
// tripping the limiter.
const AUTH_THROTTLE_LIMIT = env.NODE_ENV === 'test' ? 100_000 : 5;
const AUTH_THROTTLE_TTL = env.NODE_ENV === 'test' ? 1_000 : 60_000;
const AUTH_THROTTLE = { default: { limit: AUTH_THROTTLE_LIMIT, ttl: AUTH_THROTTLE_TTL } };

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
  ): Promise<AuthResponse | null> {
    const cookies = parseCookies(req.headers.cookie);
    const refreshToken = cookies[REFRESH_COOKIE_NAME];
    if (!refreshToken) {
      return null;
    }
    const result = await this.auth.refresh(refreshToken);
    if (!result) {
      // Clear the stale cookie and return null so the client knows to log out.
      res.setHeader('Set-Cookie', `cs_refresh=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`);
      return null;
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
