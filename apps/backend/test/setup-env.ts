// Test env setup — runs before each test file.
//
// We point the test suite at the same Supabase Postgres as dev. Each suite
// cleans up the rows it creates.

process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'silent';
// Force the Mock provider across every suite so no test ever hits
// OpenAI. The unit specs for the real provider live in packages/ai.
process.env.AI_PROVIDER = 'mock';
