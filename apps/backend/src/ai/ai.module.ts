// AiModule — wires the AIProvider into the Nest DI container.
//
// The provider is selected at boot via env.AI_PROVIDER:
//   - 'mock'   → MockProvider (no network, deterministic)
//   - 'openai' → OpenAIProvider (needs OPENAI_API_KEY)
//
// `AI_PROVIDER` is exported as a DI token so any consumer can
// `@Inject(AI_PROVIDER)` without coupling to a concrete class.

import { Module, type Provider } from '@nestjs/common';
import { env } from '@citizen-shield/config';
import { AIProvider, MockProvider, OpenAIProvider } from '@citizen-shield/ai';

export const AI_PROVIDER = 'AI_PROVIDER';

const aiProviderFactory: Provider = {
  provide: AI_PROVIDER,
  useFactory: (): AIProvider => {
    switch (env.AI_PROVIDER) {
      case 'mock':
        return new MockProvider();
      case 'openai': {
        if (!env.OPENAI_API_KEY) {
          // Config package's superRefine should have caught this at boot.
          // Defensive check in case someone wires env differently in tests.
          throw new Error('OPENAI_API_KEY is required when AI_PROVIDER=openai');
        }
        return new OpenAIProvider({
          apiKey: env.OPENAI_API_KEY,
          model: env.AI_MODEL,
          defaultTemperature: env.AI_TEMPERATURE,
        });
      }
    }
  },
};

@Module({
  providers: [aiProviderFactory],
  exports: [AI_PROVIDER],
})
export class AiModule {}
