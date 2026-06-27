// UUID validation tests — Task #14.
// Ensures malformed `:id` route params on /cases return a structured
// 400 VALIDATION_ERROR instead of leaking a Prisma "Invalid UUID" string
// or surfacing the case as a 404.

import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { bootstrapTestApp, clearTestData, teardownTestApp } from './test-app';

const SCOPE = 'uuid-validation';
const USER = {
  email: `alice-uuid@${SCOPE}.test.local`,
  password: 'hunter22pw',
  name: 'Alice UUID',
};

async function registerAndToken(app: INestApplication): Promise<string> {
  const res = await request(app.getHttpServer()).post('/api/auth/register').send(USER);
  return res.body.data.accessToken as string;
}

describe('UUID param validation (e2e)', () => {
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

  it('GET /cases/:id rejects a non-UUID param with 400 VALIDATION_ERROR', async () => {
    const token = await registerAndToken(app);
    const res = await request(app.getHttpServer())
      .get('/api/cases/not-a-uuid')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(res.body.error.message).toMatch(/param/i);
  });

  it('PATCH /cases/:id rejects a non-UUID param with 400 VALIDATION_ERROR', async () => {
    const token = await registerAndToken(app);
    const res = await request(app.getHttpServer())
      .patch('/api/cases/abc-123')
      .set('Authorization', `Bearer ${token}`)
      .send({ title: 'nope' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('DELETE /cases/:id rejects a non-UUID param with 400 VALIDATION_ERROR', async () => {
    const token = await registerAndToken(app);
    const res = await request(app.getHttpServer())
      .delete('/api/cases/42')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('GET /cases/<valid uuid> for a non-existent case still returns 404', async () => {
    const token = await registerAndToken(app);
    const res = await request(app.getHttpServer())
      .get('/api/cases/00000000-0000-4000-8000-000000000000')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(404);
  });
});
