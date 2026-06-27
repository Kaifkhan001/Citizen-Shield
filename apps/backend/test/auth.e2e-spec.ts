// Auth e2e tests — covers the 7 spec scenarios:
//  1. Registration
//  2. Login
//  3. JWT verification (via /auth/me)
//  4. Create Case (covered in cases.e2e-spec.ts)
//  5. Get own Cases (covered in cases.e2e-spec.ts)
//  6. Unauthorized Case access (covered in cases.e2e-spec.ts)
//  7. Soft delete behavior (covered in cases.e2e-spec.ts)
//
// Plus auth-only checks for refresh rotation and logout.

import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { bootstrapTestApp, clearTestData, teardownTestApp } from './test-app';

const SCOPE = 'auth-e2e';
const ALICE = {
  email: `alice-e2e@${SCOPE}.test.local`,
  password: 'hunter22pw',
  name: 'Alice E2E',
};

describe('Auth (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await bootstrapTestApp();
  });

  afterAll(async () => {
    await teardownTestApp();
  });

  beforeEach(async () => {
    await clearTestData(SCOPE);
  });

  it('rejects registration with a bad email', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({ email: 'not-an-email', password: 'hunter22pw', name: 'X' });
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('rejects registration with a short password', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({ email: 'a@b.com', password: 'short', name: 'X' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('registers a new user and returns a user + access token', async () => {
    const res = await request(app.getHttpServer()).post('/api/auth/register').send(ALICE);
    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.user.email).toBe(ALICE.email);
    expect(res.body.data.user.role).toBe('USER');
    expect(res.body.data.user).not.toHaveProperty('passwordHash');
    expect(typeof res.body.data.accessToken).toBe('string');
    expect(res.body.data.expiresIn).toBe(900);
  });

  it('rejects duplicate registration', async () => {
    await request(app.getHttpServer()).post('/api/auth/register').send(ALICE).expect(201);
    const res = await request(app.getHttpServer()).post('/api/auth/register').send(ALICE);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('AUTH_EMAIL_TAKEN');
  });

  it('logs in with valid credentials', async () => {
    await request(app.getHttpServer()).post('/api/auth/register').send(ALICE);
    const res = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: ALICE.email, password: ALICE.password });
    expect(res.status).toBe(201);
    expect(res.body.data.user.email).toBe(ALICE.email);
    expect(typeof res.body.data.accessToken).toBe('string');
    // Refresh cookie present
    const setCookie = res.headers['set-cookie'] as string[] | undefined;
    expect(setCookie?.[0]).toMatch(/cs_refresh=/);
  });

  it('rejects login with bad password', async () => {
    await request(app.getHttpServer()).post('/api/auth/register').send(ALICE);
    const res = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: ALICE.email, password: 'WRONG-PASSWORD' });
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('AUTH_INVALID_CREDENTIALS');
  });

  it('returns the current user on /auth/me with a valid access token', async () => {
    const reg = await request(app.getHttpServer()).post('/api/auth/register').send(ALICE);
    const token = reg.body.data.accessToken;
    const res = await request(app.getHttpServer())
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.email).toBe(ALICE.email);
  });

  it('rejects /auth/me with a missing token', async () => {
    const res = await request(app.getHttpServer()).get('/api/auth/me');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('AUTH_UNAUTHORIZED');
  });

  it('rejects /auth/me with a tampered token', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/auth/me')
      .set('Authorization', 'Bearer not.a.real.jwt');
    expect(res.status).toBe(401);
  });

  it('rotates refresh tokens', async () => {
    const reg = await request(app.getHttpServer()).post('/api/auth/register').send(ALICE);
    const cookie = (reg.headers['set-cookie'] as string[])[0].split(';')[0]; // cs_refresh=...

    // First refresh — returns new pair.
    const r1 = await request(app.getHttpServer()).post('/api/auth/refresh').set('Cookie', cookie);
    expect(r1.status).toBe(201);
    expect(typeof r1.body.data.accessToken).toBe('string');
    const newCookie = (r1.headers['set-cookie'] as string[])[0].split(';')[0];

    // Second refresh with the OLD cookie — should fail (rotated).
    const r2 = await request(app.getHttpServer()).post('/api/auth/refresh').set('Cookie', cookie);
    expect(r2.status).toBe(401);
    expect(r2.body.error.code).toBe('AUTH_REFRESH_EXPIRED');

    // Third refresh with the NEW cookie — should succeed.
    const r3 = await request(app.getHttpServer())
      .post('/api/auth/refresh')
      .set('Cookie', newCookie);
    expect(r3.status).toBe(201);
    expect(typeof r3.body.data.accessToken).toBe('string');
  });

  it('logs out and clears the refresh token', async () => {
    const reg = await request(app.getHttpServer()).post('/api/auth/register').send(ALICE);
    const cookie = (reg.headers['set-cookie'] as string[])[0].split(';')[0];

    const out = await request(app.getHttpServer()).post('/api/auth/logout').set('Cookie', cookie);
    expect(out.status).toBe(201);
    const clearCookie = (out.headers['set-cookie'] as string[])[0];
    expect(clearCookie).toMatch(/cs_refresh=/);
    expect(clearCookie).toMatch(/Max-Age=0/);

    // After logout, refresh should return 401 AUTH_REFRESH_EXPIRED — the
    // revoked token is no longer in Redis.
    const r = await request(app.getHttpServer()).post('/api/auth/refresh').set('Cookie', cookie);
    expect(r.status).toBe(401);
    expect(r.body.error.code).toBe('AUTH_REFRESH_EXPIRED');
  });
});
