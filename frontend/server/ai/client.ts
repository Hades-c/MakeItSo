import "server-only";
import Anthropic, {
  AnthropicError,
  APIConnectionError,
  APIConnectionTimeoutError,
  APIError,
  AuthenticationError,
  BadRequestError,
  NotFoundError,
  PermissionDeniedError,
  RateLimitError,
  UnprocessableEntityError,
} from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import type {
  BetaContentBlock,
  BetaMessage,
  BetaUsage,
  MessageCreateParamsNonStreaming,
} from "@anthropic-ai/sdk/resources/beta/messages/messages";
import type { z } from "zod";
import { aiFailure, type AiFailureKind, type AiFeature } from "@/lib/types/ai";
import { readEnv } from "@/server/env";
import {
  AI_BETAS,
  AI_FALLBACKS,
  AI_MAX_RETRIES,
  AI_MODEL,
  AI_TIMEOUT_MS,
  type AiEffort,
} from "@/server/ai/config";
import { mockTransport } from "@/server/ai/mock";
import { aiProvider } from "@/server/ai/provider";

/**
 * The one way MakeItSo calls a model (PLAN §6.1 W6 "Client and call shape"):
 *
 *   client.beta.messages.create({
 *     model: "claude-sonnet-5-5", betas: ["server-side-fallback-2026-07-01"], fallbacks: "default",
 *     max_tokens, output_config: { effort, format: betaZodOutputFormat(schema) },
 *     system: [{ type: "text", text: <frozen system prompt>, cache_control: { type: "ephemeral" } }],
 *     messages: [{ role: "user", content: <tagged data blocks + the task> }],
 *   })
 *
 * `thinking` is omitted (adaptive by default on Claude Sonnet 5.5; `disabled` and budget_tokens are 400s there),
 * and so are temperature / top_p / top_k and any assistant prefill.
 *
 * The call goes to api.anthropic.com through the SDK (its own fetch), not fetchExternal: the SDK is the Claude
 * API's client, with its own timeout (45 s) and retry (1). Tests and e2e never reach it: vitest injects a fake
 * SDK client or uses AI_PROVIDER=mock, and the e2e server runs AI_PROVIDER=mock (its fetch guard would fail any
 * real call loudly).
 *
 * Result handling, in order: stop_reason "refusal" → refused; "max_tokens" (or the context window) → truncated;
 * the text after the last fallback boundary → JSON.parse → schema.safeParse → invalid when either fails; else ok
 * with servedModel = res.model and fallbackUsed = a `fallback_message` entry in usage.iterations. Thrown errors,
 * most specific first: connection timeout → timeout; rate limit → unavailable ("AI is busy"); other connection
 * errors → unavailable; 400/422 → invalid (logged: the request is ours); 401/403 → not_configured (logged);
 * anything else from the API → unavailable (logged). Prompts and outputs are never logged.
 */

export interface GenerateRequest {
  feature: AiFeature;
  /** The frozen system prompt of the feature's PROMPT_VERSION (no dates, ids or student data). */
  system: string;
  /** The user turn: tagged data blocks (server/ai/blocks.ts) followed by the task text. */
  userBlocks: readonly string[];
  effort: AiEffort;
  maxTokens: number;
}

/** Tokens of one call, summed over `usage.iterations` when present (declined attempts before a fallback). */
export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
}

export const ZERO_USAGE: Readonly<TokenUsage> = Object.freeze({
  inputTokens: 0,
  outputTokens: 0,
  cacheReadTokens: 0,
  cacheCreationTokens: 0,
});

export function totalTokens(usage: TokenUsage): number {
  return usage.inputTokens + usage.outputTokens + usage.cacheReadTokens + usage.cacheCreationTokens;
}

export type GenerateOutcome<T> =
  | {
      kind: "ok";
      data: T;
      servedModel: string;
      fallbackUsed: boolean;
      usage: TokenUsage;
    }
  | {
      kind: AiFailureKind;
      message: string;
      /** The model that answered (for failures after a response), else the requested model. */
      servedModel: string;
      fallbackUsed: boolean;
      /** Zero when no response arrived. */
      usage: TokenUsage;
    };

/** How a request reaches a model: the SDK (anthropic) or the mock provider. */
export type AiTransport = (
  params: MessageCreateParamsNonStreaming,
  context: { feature: AiFeature },
) => Promise<BetaMessage>;

/** The part of the SDK client the transport uses (tests pass a fake with the same shape). */
export interface MessagesClient {
  beta: {
    messages: {
      create(params: MessageCreateParamsNonStreaming): PromiseLike<BetaMessage>;
    };
  };
}

let client: Anthropic | null = null;
let clientKey: string | null = null;

/** The SDK client, created on first use from ANTHROPIC_API_KEY (re-created if the key changes). */
export function anthropicClient(): Anthropic {
  const apiKey = readEnv("ANTHROPIC_API_KEY") ?? null;
  if (!client || clientKey !== apiKey) {
    // authToken: null so an ANTHROPIC_AUTH_TOKEN in the environment is never sent next to the key.
    client = new Anthropic({
      apiKey,
      authToken: null,
      timeout: AI_TIMEOUT_MS,
      maxRetries: AI_MAX_RETRIES,
    });
    clientKey = apiKey;
  }
  return client;
}

/** A transport over an SDK client (the real one, or a fake in tests). */
export function sdkTransport(messagesClient: MessagesClient): AiTransport {
  return async (params) => messagesClient.beta.messages.create(params);
}

let transportOverride: AiTransport | null = null;

/** Test hook: route every generate() call through `transport` (null restores the configured provider). */
export function setAiTransportForTests(transport: AiTransport | null): void {
  transportOverride = transport;
}

/** The configured transport: a test override, the mock provider, or the Claude API. */
export function defaultTransport(): AiTransport {
  if (transportOverride) return transportOverride;
  return aiProvider() === "mock" ? mockTransport : sdkTransport(anthropicClient());
}

/** The exact request body sent for `request` (exported for the payload allow-list tests). */
export function buildParams<S extends z.ZodType>(
  schema: S,
  request: GenerateRequest,
): MessageCreateParamsNonStreaming {
  return {
    model: AI_MODEL,
    betas: [...AI_BETAS],
    fallbacks: AI_FALLBACKS,
    max_tokens: request.maxTokens,
    output_config: { effort: request.effort, format: betaZodOutputFormat(schema) },
    system: [{ type: "text", text: request.system, cache_control: { type: "ephemeral" } }],
    messages: [
      {
        role: "user",
        content: request.userBlocks.map((text) => ({ type: "text" as const, text })),
      },
    ],
  };
}

/** Sum the usage of every attempt (iterations), or the top-level usage when the API sends no iterations. */
export function tokenUsage(usage: BetaUsage | null | undefined): TokenUsage {
  if (!usage) return { ...ZERO_USAGE };
  const iterations = usage.iterations ?? [];
  type Counted = {
    input_tokens?: number | null;
    output_tokens?: number | null;
    cache_read_input_tokens?: number | null;
    cache_creation_input_tokens?: number | null;
  };
  const entries: readonly Counted[] = iterations.length > 0 ? iterations : [usage];
  const sum = (pick: (entry: Counted) => number | null | undefined) =>
    entries.reduce((total, entry) => total + Math.max(0, pick(entry) ?? 0), 0);
  return {
    inputTokens: sum((e) => e.input_tokens),
    outputTokens: sum((e) => e.output_tokens),
    cacheReadTokens: sum((e) => e.cache_read_input_tokens),
    cacheCreationTokens: sum((e) => e.cache_creation_input_tokens),
  };
}

/** A fallback model served the answer (a `fallback_message` iteration; sticky turns carry no fallback block). */
export function servedByFallback(usage: BetaUsage | null | undefined): boolean {
  return (usage?.iterations ?? []).some((entry) => entry.type === "fallback_message");
}

/**
 * The answer's text: the text blocks after the last `fallback` boundary (a model that declined mid-answer may
 * have written text before handing over), joined. Null when there is none.
 */
export function answerText(content: readonly BetaContentBlock[]): string | null {
  let start = 0;
  content.forEach((block, index) => {
    if (block.type === "fallback") start = index + 1;
  });
  const texts = content
    .slice(start)
    .flatMap((block) => (block.type === "text" ? [block.text] : []));
  return texts.length > 0 ? texts.join("") : null;
}

function logFailure(feature: AiFeature, what: string, error?: unknown): void {
  const detail =
    error instanceof APIError
      ? `${error.constructor.name} status=${String(error.status)} request=${error.requestID ?? "-"}`
      : error instanceof Error
        ? `${error.name}: ${error.message.slice(0, 200)}`
        : "";
  console.error(`[ai] ${feature}: ${what}${detail ? ` (${detail})` : ""}`);
}

/** Map a thrown SDK error to a failure kind, most specific class first. Other errors are re-thrown. */
export function failureForError(feature: AiFeature, error: unknown): AiFailureKind {
  if (error instanceof APIConnectionTimeoutError) return "timeout";
  if (error instanceof RateLimitError) return "unavailable";
  if (error instanceof APIConnectionError) return "unavailable";
  if (error instanceof BadRequestError || error instanceof UnprocessableEntityError) {
    logFailure(feature, "the API rejected the request", error);
    return "invalid";
  }
  if (error instanceof AuthenticationError || error instanceof PermissionDeniedError) {
    logFailure(feature, "the API key was refused", error);
    return "not_configured";
  }
  if (error instanceof NotFoundError) {
    logFailure(feature, "the model is not available to this key", error);
    return "unavailable";
  }
  if (error instanceof APIError) {
    logFailure(feature, "the API failed", error);
    return "unavailable";
  }
  if (error instanceof AnthropicError) {
    logFailure(feature, "the SDK failed", error);
    return "unavailable";
  }
  throw error;
}

const BUSY_MESSAGE = "AI is busy right now. Please try again in a minute.";

/**
 * Call the model once and validate its structured output with `schema` (the same zod schema is sent as the
 * output format). Never throws for model or API problems: they come back as failure outcomes.
 */
export async function generate<S extends z.ZodType>(
  schema: S,
  request: GenerateRequest,
  options: { transport?: AiTransport } = {},
): Promise<GenerateOutcome<z.output<S>>> {
  const transport = options.transport ?? defaultTransport();
  const params = buildParams(schema, request);
  const failed = (
    kind: AiFailureKind,
    extra: Partial<{
      message: string;
      servedModel: string;
      fallbackUsed: boolean;
      usage: TokenUsage;
    }> = {},
  ): GenerateOutcome<z.output<S>> => ({
    kind,
    message: extra.message ?? aiFailure(kind).message,
    servedModel: extra.servedModel ?? AI_MODEL,
    fallbackUsed: extra.fallbackUsed ?? false,
    usage: extra.usage ?? { ...ZERO_USAGE },
  });

  let response: BetaMessage;
  try {
    response = await transport(params, { feature: request.feature });
  } catch (error) {
    const kind = failureForError(request.feature, error);
    return failed(kind, error instanceof RateLimitError ? { message: BUSY_MESSAGE } : {});
  }

  const usage = tokenUsage(response.usage);
  const meta = {
    servedModel: response.model || AI_MODEL,
    fallbackUsed: servedByFallback(response.usage),
    usage,
  };

  if (response.stop_reason === "refusal") return failed("refused", meta);
  if (
    response.stop_reason === "max_tokens" ||
    response.stop_reason === "model_context_window_exceeded"
  ) {
    return failed("truncated", meta);
  }

  const text = answerText(response.content);
  if (text === null) {
    logFailure(
      request.feature,
      `no text in the answer (stop_reason ${String(response.stop_reason)})`,
    );
    return failed("invalid", meta);
  }
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    logFailure(request.feature, "the answer is not JSON");
    return failed("invalid", meta);
  }
  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    logFailure(
      request.feature,
      `the answer does not match the schema (${parsed.error.issues.length} issues)`,
    );
    return failed("invalid", meta);
  }
  return { kind: "ok", data: parsed.data as z.output<S>, ...meta };
}
