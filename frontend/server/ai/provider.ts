import "server-only";
import { EnvError, readEnv } from "@/server/env";

/**
 * Which model provider serves AI requests (server/env.ts AI_PROVIDER):
 *   anthropic  the Claude API through @anthropic-ai/sdk (needs ANTHROPIC_API_KEY)
 *   mock       server/ai/mock.ts: deterministic, schema-valid answers derived from the request (vitest and e2e).
 *              server/env.ts rejects it on the Vercel production environment (readEnv throws EnvError there).
 */
export type AiProviderName = "anthropic" | "mock";

export function aiProvider(): AiProviderName {
  return readEnv("AI_PROVIDER");
}

/**
 * A provider is configured: AI_PROVIDER=mock (outside Vercel production), or anthropic with an API key. A
 * rejected configuration (mock on production) is logged and reads as "not configured", so the student sees
 * "AI features are not set up on this server yet." instead of a 500.
 */
export function aiConfigured(): boolean {
  try {
    const provider = aiProvider();
    if (provider === "mock") return true;
    return Boolean(readEnv("ANTHROPIC_API_KEY"));
  } catch (error) {
    if (error instanceof EnvError) {
      console.error("[ai] provider configuration rejected:", error.message);
      return false;
    }
    throw error;
  }
}
