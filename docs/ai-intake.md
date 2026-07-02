# AI Intake — Milestone 4

The intake feature walks a citizen through a multi-turn interview and
produces a `Case` they confirm before anything is filed. The
orchestration is a state machine, not an agent loop. There is no
LangChain, no vector DB, no streaming — every AI action is readable
in the source.

## Why a state machine

- **Deterministic.** A discriminated union (`IntakeState`) is the
  source of truth for "where are we in this conversation?" The
  reducer is a pure function that takes the current state, the
  user's latest message, and the AI's structured response, and
  returns the next state. There is no implicit context window, no
  hidden prompt assembly, no tool-calling.
- **Testable.** The reducer has 23 unit tests in
  `apps/backend/test/ai-state.unit-spec.ts` that exercise every
  transition with no Nest bootstrap and no DB. The provider
  abstraction has its own unit tests for the mock (`mock-provider`)
  and the parser (`ai-parse`).
- **Auditable.** Every state transition is explainable by reading
  the next-state branch in the reducer. The persisted `Conversation`
  row is the audit log: `state` enum + `messages` JSON + `extracted`
  facts.

## The contract

`packages/ai/src/schemas.ts` defines the single source of truth for
the AI's response:

```ts
aiTurnResponseSchema = z.object({
  assistantMessage: z.string().min(1),
  stateUpdate: extractedFactsSchema.partial(),
  detectedCategory: caseCategorySchema.nullable(),
  isReadyToConfirm: z.boolean(),
  confidence: z.number().min(0).max(1),
});
```

The provider **must** return exactly this shape on every turn.
`safeParseAiResponse` distinguishes `SyntaxError` (`malformed_json`)
from `ZodError` (`schema_mismatch`); the service uses the
`malformed_json` reason to decide whether to retry.

## Provider swap

`AI_PROVIDER` (default `mock`) selects at boot:

- **`mock`** — `MockProvider`. Scripted responses keyed by the
  _word count_ of the last user message. No network, no
  randomness, deterministic. Used by every e2e test and recommended
  for local dev unless you're actively working on the prompt.
- **`openai`** — `OpenAIProvider`. The official `openai` SDK
  against `gpt-4o-mini`, with `response_format: { type:
'json_object' }` and `temperature: 0.2`. The SDK's typed errors
  are mapped:
  - `401` / `403` → `'auth'` → HTTP 429 (`AI_RATE_LIMITED`)
  - `429` → `'rate_limit'` → HTTP 429
  - everything else → `'transport'` → HTTP 502

## Retry / fallback

1. The service calls `provider.chat(req, { parse: safeParseAiResponse })`.
2. On success: pass the parsed response to `transition()`.
3. On `'auth'` or `'rate_limit'`: throw `AI_RATE_LIMITED` (429).
4. On `'transport'` whose `message` contains `parser rejected`:
   retry once with a system message appended: "Reply with the JSON
   object ALONE — no prose, no fences." If the retry also fails,
   persist a fallback assistant message, flip the conversation to
   `FAILED`, and throw `AI_PROVIDER_INVALID_OUTPUT` (502).
5. On any other transport failure: throw `AI_PROVIDER_UNAVAILABLE`
   (502) directly. No retry — those are upstream / network errors.

## State transitions

The reducer in `packages/ai/src/state.ts` follows this table:

| Current `kind`         | Trigger                                 | Next `kind`           |
| ---------------------- | --------------------------------------- | --------------------- | ------------------------- | ------------------ |
| `started`              | `start({initialMessage?})` (no AI call) | `gathering_problem`   |
| `gathering_problem`    | `detectedCategory !== null`             | `gathering_category`  |
| `gathering_problem`    | `isReadyToConfirm && hasEnoughFacts`    | `ready_to_confirm`    |
| `gathering_problem`    | otherwise (loop)                        | `gathering_problem`   |
| `gathering_category`   | (always; the category is now fixed)     | `gathering_facts`     |
| `gathering_facts`      | `isReadyToConfirm && hasEnoughFacts`    | `ready_to_confirm`    |
| `gathering_facts`      | otherwise                               | `gathering_followups` |
| `gathering_followups`  | `remaining=0                            |                       | isReadyToConfirm` + facts | `ready_to_confirm` |
| `gathering_followups`  | insufficient facts                      | `failed`              |
| `gathering_followups`  | otherwise                               | `gathering_followups` |
| `ready_to_confirm`     | (user edits a fact)                     | `ready_to_confirm`    |
| `confirmed` / `failed` | any further call                        | `invalid: true`       |
| any                    | two parse failures in a row             | `failed`              |

`hasEnoughFactsForDraft(mergedFacts)` returns true when
`keyFacts.length ≥ 3 && category !== undefined && title !== undefined
&& title.length > 0`.

## Conversation lifecycle

```
POST /api/intake/start
  → creates Conversation row in GATHERING_PROBLEM,
    records the local greeting as messages[0].
  → returns { conversation, assistantMessage }.

POST /api/intake/:id/message
  → loads row, decodes IntakeState, checks canSendMessage.
  → calls provider.chat, parses, retries once on parse failure.
  → passes (state, userMessage, aiResponse, currentFacts) into transition().
  → persists new state + appended messages + merged facts.

GET  /api/intake/:id
  → returns the full envelope (state, messages, extracted, category, caseId).

POST /api/intake/:id/confirm
  → checks state.kind === 'ready_to_confirm'.
  → in a single Prisma transaction:
      create Case (status DRAFT),
      create CaseTimeline event,
      flip Conversation → CONFIRMED, set caseId.
  → idempotent: a second confirm with state=CONFIRMED returns the
    existing case.

POST /api/intake/:id/abort
  → flips state to FAILED.
```

## Environment

| Var                   | Default       | Notes                              |
| --------------------- | ------------- | ---------------------------------- |
| `AI_PROVIDER`         | `mock`        | `mock` or `openai`                 |
| `AI_MODEL`            | `gpt-4o-mini` | OpenAI model id                    |
| `AI_TEMPERATURE`      | `0.2`         | Passed to the provider             |
| `OPENAI_API_KEY`      | —             | Required when `AI_PROVIDER=openai` |
| `AI_RATE_LIMIT_TTL`   | `60000` ms    | Throttler window                   |
| `AI_RATE_LIMIT_LIMIT` | `20`          | Max requests per window per IP     |
| `INTAKE_MAX_MESSAGES` | `20`          | Hard ceiling on user turns         |

## Non-goals (deferred to later milestones)

- Streaming responses (M5 will swap the chat layer for SSE).
- Vector DB / RAG / embeddings.
- Voice input, file uploads.
- Multi-user conversations.
- Branching / undo.
- Custom provider registry / per-user provider config.
