// Intake e2e tests — exercises the full /api/intake surface against
// the live dev Supabase Postgres + local Redis, with the Mock AI
// provider (set in setup-env.ts).
//
// The Mock provider's scripted responses are keyed off the *word
// count* of the latest user message:
//
//   0 words   → ask for more
//   <6 words  → category detected + first key fact
//   <12 words → party + timeline
//   <20 words → title + outcome (still gathering)
//   ≥20 words → ready to confirm
//
// The reducer also requires ≥3 keyFacts + title + category before
// it advances to `ready_to_confirm`, so the e2e flow drives 3-4
// turns of varying length to accumulate facts.

import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { bootstrapTestApp, clearTestData, teardownTestApp, getPrisma } from './test-app';

const SCOPE = 'intake-e2e';
const ALICE = {
  email: `alice-intake@${SCOPE}.test.local`,
  password: 'hunter22pw',
  name: 'Alice Intake',
};
const BOB = {
  email: `bob-intake@${SCOPE}.test.local`,
  password: 'hunter22pw',
  name: 'Bob Intake',
};

async function registerAndToken(
  app: INestApplication,
  user: { email: string; password: string; name: string },
): Promise<string> {
  const res = await request(app.getHttpServer()).post('/api/auth/register').send(user);
  return res.body.data.accessToken as string;
}

/**
 * Drive a conversation to `ready_to_confirm` using Mock's scripted
 * arc. Sends 3 messages of varying word count so the running
 * extraction accumulates:
 *   - turn 1 (5 words) → category detected + 1st keyFact
 *   - turn 2 (medium)  → 2nd keyFact + parties + timeline
 *   - turn 3 (≥20)     → 3rd keyFact + title + ready_to_confirm
 */
async function driveConversationToReady(app: INestApplication, token: string): Promise<string> {
  const start = await request(app.getHttpServer())
    .post('/api/intake/start')
    .set('Authorization', `Bearer ${token}`)
    .send({});
  expect(start.status).toBe(201);
  const id = start.body.data.conversation.id as string;
  expect(start.body.data.assistantMessage.length).toBeGreaterThan(0);

  const turns: Array<{ message: string; kind: string }> = [
    { message: 'broken laptop refund denied', kind: '' },
    {
      message:
        'The manager at the local electronics shop refused to process my refund two days ago even though my receipt was clean',
      kind: '',
    },
    {
      message:
        'I bought the laptop from the local store on Market Street last week and the manager told me no refunds',
      kind: '',
    },
  ];

  for (let i = 0; i < turns.length; i += 1) {
    const turn = turns[i]!;
    const res = await request(app.getHttpServer())
      .post(`/api/intake/${id}/message`)
      .set('Authorization', `Bearer ${token}`)
      .send({ message: turn.message });
    expect(res.status).toBe(201);
    turn.kind = String(res.body.data.conversation.state.kind);
  }

  // After 3 turns the conversation should be at `ready_to_confirm`.
  // The 3rd turn's message is exactly 20 words (≥20 branch in the
  // Mock), which trips `isReadyToConfirm: true`, and by now the
  // reducer has enough facts (≥3 keyFacts + title + category).
  expect(turns[2]?.kind).toBe('ready_to_confirm');

  return id;
}

describe('Intake (e2e)', () => {
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

  it('starts a conversation with the local greeting', async () => {
    const token = await registerAndToken(app, ALICE);
    const res = await request(app.getHttpServer())
      .post('/api/intake/start')
      .set('Authorization', `Bearer ${token}`)
      .send({});
    expect(res.status).toBe(201);
    expect(res.body.data.conversation.id).toMatch(/^[0-9a-f-]{36}$/i);
    expect(res.body.data.conversation.messages).toHaveLength(1);
    expect(res.body.data.conversation.messages[0].role).toBe('assistant');
    expect(res.body.data.assistantMessage.length).toBeGreaterThan(0);
  });

  it('rejects /start without auth', async () => {
    const res = await request(app.getHttpServer()).post('/api/intake/start').send({});
    expect(res.status).toBe(401);
  });

  it('rejects /start with invalid body', async () => {
    const token = await registerAndToken(app, ALICE);
    const res = await request(app.getHttpServer())
      .post('/api/intake/start')
      .set('Authorization', `Bearer ${token}`)
      .send({ initialMessage: '' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('seeds the conversation with the initial user message when provided', async () => {
    const token = await registerAndToken(app, ALICE);
    const res = await request(app.getHttpServer())
      .post('/api/intake/start')
      .set('Authorization', `Bearer ${token}`)
      .send({ initialMessage: 'My landlord refuses to return my deposit' });
    expect(res.status).toBe(201);
    expect(res.body.data.conversation.messages).toHaveLength(2);
    expect(res.body.data.conversation.messages[0].role).toBe('assistant');
    expect(res.body.data.conversation.messages[1].role).toBe('user');
  });

  it('drives a conversation through states and eventually surfaces ready_to_confirm', async () => {
    const token = await registerAndToken(app, ALICE);
    const id = await driveConversationToReady(app, token);

    const detail = await request(app.getHttpServer())
      .get(`/api/intake/${id}`)
      .set('Authorization', `Bearer ${token}`);
    expect(detail.status).toBe(200);
    expect(detail.body.data.state.kind).toBe('ready_to_confirm');
    expect(detail.body.data.state.draft.title.length).toBeGreaterThan(0);
    expect(detail.body.data.state.draft.category).toBe('CONSUMER_COMPLAINT');
    expect(detail.body.data.category).toBe('CONSUMER_COMPLAINT');
  });

  it('returns 404 when alice GETs bob conversation', async () => {
    const aliceToken = await registerAndToken(app, ALICE);
    const bobToken = await registerAndToken(app, BOB);

    const bobStart = await request(app.getHttpServer())
      .post('/api/intake/start')
      .set('Authorization', `Bearer ${bobToken}`)
      .send({});
    const bobId = bobStart.body.data.conversation.id as string;

    const res = await request(app.getHttpServer())
      .get(`/api/intake/${bobId}`)
      .set('Authorization', `Bearer ${aliceToken}`);
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('INTAKE_NOT_FOUND');
  });

  it('rejects confirm before the conversation reaches ready_to_confirm', async () => {
    const token = await registerAndToken(app, ALICE);
    const start = await request(app.getHttpServer())
      .post('/api/intake/start')
      .set('Authorization', `Bearer ${token}`)
      .send({});
    const id = start.body.data.conversation.id as string;

    const res = await request(app.getHttpServer())
      .post(`/api/intake/${id}/confirm`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('INTAKE_INVALID_STATE');
  });

  it('rejects messages after the conversation is aborted', async () => {
    const token = await registerAndToken(app, ALICE);
    const start = await request(app.getHttpServer())
      .post('/api/intake/start')
      .set('Authorization', `Bearer ${token}`)
      .send({});
    const id = start.body.data.conversation.id as string;

    const abort = await request(app.getHttpServer())
      .post(`/api/intake/${id}/abort`)
      .set('Authorization', `Bearer ${token}`)
      .send({ reason: 'changed my mind' });
    expect(abort.status).toBe(200);
    expect(abort.body.data.state.kind).toBe('failed');

    const followup = await request(app.getHttpServer())
      .post(`/api/intake/${id}/message`)
      .set('Authorization', `Bearer ${token}`)
      .send({ message: 'still typing' });
    expect(followup.status).toBe(409);
  });

  it('drives a full happy path: start → drive → confirm → case created', async () => {
    const token = await registerAndToken(app, ALICE);
    const id = await driveConversationToReady(app, token);

    const confirm = await request(app.getHttpServer())
      .post(`/api/intake/${id}/confirm`)
      .set('Authorization', `Bearer ${token}`);
    expect(confirm.status).toBe(200);
    expect(confirm.body.data.caseId).toMatch(/^[0-9a-f-]{36}$/i);
    expect(confirm.body.data.case.title.length).toBeGreaterThan(0);
    expect(confirm.body.data.case.category).toBe('CONSUMER_COMPLAINT');

    // A second confirm is idempotent — same case returned.
    const confirmAgain = await request(app.getHttpServer())
      .post(`/api/intake/${id}/confirm`)
      .set('Authorization', `Bearer ${token}`);
    expect(confirmAgain.status).toBe(200);
    expect(confirmAgain.body.data.caseId).toBe(confirm.body.data.caseId);

    // The case shows up on /api/cases/:id.
    const getCase = await request(app.getHttpServer())
      .get(`/api/cases/${confirm.body.data.caseId}`)
      .set('Authorization', `Bearer ${token}`);
    expect(getCase.status).toBe(200);
    expect(getCase.body.data.id).toBe(confirm.body.data.caseId);

    // Conversation row now points at the case via caseId.
    const convoRow = await getPrisma().conversation.findUnique({ where: { id } });
    expect(convoRow).not.toBeNull();
    expect(convoRow?.caseId).toBe(confirm.body.data.caseId);
  });
});
