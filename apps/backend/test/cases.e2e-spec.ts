// Cases e2e tests — covers scenarios 4–7 from the spec:
//   4. Create Case
//   5. Get own Cases
//   6. Unauthorized Case access
//   7. Soft delete behavior

import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { bootstrapTestApp, clearTestData, teardownTestApp } from './test-app';

const SCOPE = 'case-e2e';
const ALICE = {
  email: `alice-case@${SCOPE}.test.local`,
  password: 'hunter22pw',
  name: 'Alice Case',
};
const BOB = {
  email: `bob-case@${SCOPE}.test.local`,
  password: 'hunter22pw',
  name: 'Bob Case',
};

async function registerAndToken(
  app: INestApplication,
  user: { email: string; password: string; name: string },
): Promise<string> {
  const res = await request(app.getHttpServer()).post('/api/auth/register').send(user);
  return res.body.data.accessToken as string;
}

describe('Cases (e2e)', () => {
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

  it('creates a case for the authenticated user', async () => {
    const token = await registerAndToken(app, ALICE);
    const res = await request(app.getHttpServer())
      .post('/api/cases')
      .set('Authorization', `Bearer ${token}`)
      .send({
        title: 'Refund issue',
        description: 'Vendor refused refund',
        category: 'CONSUMER_COMPLAINT',
      });
    expect(res.status).toBe(201);
    expect(res.body.data.title).toBe('Refund issue');
    expect(res.body.data.status).toBe('DRAFT');
    expect(res.body.data.userId).toBeDefined();
  });

  it('rejects case creation without a token', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/cases')
      .send({ title: 'x', description: 'y', category: 'CONSUMER_COMPLAINT' });
    expect(res.status).toBe(401);
  });

  it('rejects case creation with a bad body', async () => {
    const token = await registerAndToken(app, ALICE);
    const res = await request(app.getHttpServer())
      .post('/api/cases')
      .set('Authorization', `Bearer ${token}`)
      .send({ title: '', description: '', category: 'NOPE' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('lists only the authenticated user own cases', async () => {
    const aliceToken = await registerAndToken(app, ALICE);
    const bobToken = await registerAndToken(app, BOB);

    await request(app.getHttpServer())
      .post('/api/cases')
      .set('Authorization', `Bearer ${aliceToken}`)
      .send({ title: 'A1', description: 'a', category: 'CONSUMER_COMPLAINT' });
    await request(app.getHttpServer())
      .post('/api/cases')
      .set('Authorization', `Bearer ${aliceToken}`)
      .send({ title: 'A2', description: 'a', category: 'CONSUMER_COMPLAINT' });
    await request(app.getHttpServer())
      .post('/api/cases')
      .set('Authorization', `Bearer ${bobToken}`)
      .send({ title: 'B1', description: 'b', category: 'EMPLOYMENT_DISPUTE' });

    const aliceList = await request(app.getHttpServer())
      .get('/api/cases')
      .set('Authorization', `Bearer ${aliceToken}`);
    expect(aliceList.status).toBe(200);
    expect(aliceList.body.data).toHaveLength(2);
    expect(aliceList.body.data.every((c: { title: string }) => c.title.startsWith('A'))).toBe(true);

    const bobList = await request(app.getHttpServer())
      .get('/api/cases')
      .set('Authorization', `Bearer ${bobToken}`);
    expect(bobList.body.data).toHaveLength(1);
    expect(bobList.body.data[0].title).toBe('B1');
  });

  it('returns 404 when alice GETs bob case', async () => {
    const aliceToken = await registerAndToken(app, ALICE);
    const bobToken = await registerAndToken(app, BOB);

    const bobCase = await request(app.getHttpServer())
      .post('/api/cases')
      .set('Authorization', `Bearer ${bobToken}`)
      .send({ title: 'Bob private', description: 'x', category: 'EMPLOYMENT_DISPUTE' });

    const res = await request(app.getHttpServer())
      .get(`/api/cases/${bobCase.body.data.id}`)
      .set('Authorization', `Bearer ${aliceToken}`);
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  it('returns 404 when alice PATCHes bob case', async () => {
    const aliceToken = await registerAndToken(app, ALICE);
    const bobToken = await registerAndToken(app, BOB);

    const bobCase = await request(app.getHttpServer())
      .post('/api/cases')
      .set('Authorization', `Bearer ${bobToken}`)
      .send({ title: 'Bob', description: 'x', category: 'EMPLOYMENT_DISPUTE' });

    const res = await request(app.getHttpServer())
      .patch(`/api/cases/${bobCase.body.data.id}`)
      .set('Authorization', `Bearer ${aliceToken}`)
      .send({ title: 'Hijacked' });
    expect(res.status).toBe(404);
  });

  it('returns 404 when alice DELETEs bob case', async () => {
    const aliceToken = await registerAndToken(app, ALICE);
    const bobToken = await registerAndToken(app, BOB);

    const bobCase = await request(app.getHttpServer())
      .post('/api/cases')
      .set('Authorization', `Bearer ${bobToken}`)
      .send({ title: 'Bob', description: 'x', category: 'EMPLOYMENT_DISPUTE' });

    const res = await request(app.getHttpServer())
      .delete(`/api/cases/${bobCase.body.data.id}`)
      .set('Authorization', `Bearer ${aliceToken}`);
    expect(res.status).toBe(404);
  });

  it('soft-deletes a case and removes it from the list', async () => {
    const token = await registerAndToken(app, ALICE);
    const created = await request(app.getHttpServer())
      .post('/api/cases')
      .set('Authorization', `Bearer ${token}`)
      .send({ title: 'To delete', description: 'x', category: 'CONSUMER_COMPLAINT' });
    const id = created.body.data.id;

    const del = await request(app.getHttpServer())
      .delete(`/api/cases/${id}`)
      .set('Authorization', `Bearer ${token}`);
    expect(del.status).toBe(200);
    expect(del.body.data.deleted).toBe(true);

    // Subsequent GET returns 404
    const get = await request(app.getHttpServer())
      .get(`/api/cases/${id}`)
      .set('Authorization', `Bearer ${token}`);
    expect(get.status).toBe(404);

    // And the case is no longer in the list
    const list = await request(app.getHttpServer())
      .get('/api/cases')
      .set('Authorization', `Bearer ${token}`);
    expect(list.body.data).toEqual([]);
  });

  it('updates a case the user owns', async () => {
    const token = await registerAndToken(app, ALICE);
    const created = await request(app.getHttpServer())
      .post('/api/cases')
      .set('Authorization', `Bearer ${token}`)
      .send({ title: 'T', description: 'd', category: 'CONSUMER_COMPLAINT' });

    const res = await request(app.getHttpServer())
      .patch(`/api/cases/${created.body.data.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'EVIDENCE_PENDING' });
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('EVIDENCE_PENDING');
  });

  it('rejects an empty PATCH body', async () => {
    const token = await registerAndToken(app, ALICE);
    const created = await request(app.getHttpServer())
      .post('/api/cases')
      .set('Authorization', `Bearer ${token}`)
      .send({ title: 'T', description: 'd', category: 'CONSUMER_COMPLAINT' });
    const res = await request(app.getHttpServer())
      .patch(`/api/cases/${created.body.data.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({});
    expect(res.status).toBe(400);
  });
});
