import "server-only";
import Anthropic, {
  AnthropicError,
  APIConnectionError,
  APIConnectionTimeoutError,
  APIError,
  APIUserAbortError,
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
import type * as z from "zod";
import { aiFailure, type AiFailureKind, type AiFeature } from "@/lib/types/ai";
import { readEnv } from "@/server/env";
import {
  AI_BETAS,
  AI_FALLBACKS,
  AI_MAX_RETRIES,
  AI_MIN_CALL_MS,
  AI_MODEL,
  AI_REQUEST_BUDGET_MS,
  AI_RETRY_BACKOFF_ALLOWANCE_MS,
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
 * Time: every call has a deadline (the request's or the cron run's start + AI_REQUEST_BUDGET_MS). The SDK gets
 * per-request options from the time left (callBudget): the timeout is at most what is left, the SDK retry is only
 * allowed when two full attempts still fit, and an AbortSignal fires at the deadline (it also cuts a long
 * retry-after sleep short). With less than AI_MIN_CALL_MS left no call is started. So a route never runs into
 * maxDuration, and its usage is always recorded.
 *
 * Result handling, in order: stop_reason "refusal" → refused; "max_tokens" (or the context window) → truncated;
 * the text after the last fallback boundary → JSON.parse → schema.safeParse → invalid when either fails; else ok
 * with servedModel = res.model and fallbackUsed = a `fallback_message` entry in usage.iterations. Thrown errors,
 * most specific first: connection timeout or our deadline → timeout; rate limit → unavailable ("AI is busy");
 * other connection errors → unavailable; 400/422 → invalid (logged: the request is ours); 401/403 →
 * not_configured (logged); anything else from the API → unavailable (logged). Prompts and outputs are never
 * logged.
 *
 * Every failure says where it came from (`origin`): "response" when the model answered (refusal, truncation, an
 * answer that is not JSON or not the schema), "rejected" when the API refused our request (400/401/403/404/422 or
 * an SDK usage error: nothing changes until the deployment is fixed), "transient" for timeouts, rate limits,
 * connection and server errors. Only "response" failures may be remembered as negative cache entries.
 *
 * Usage of a failed call: a timeout may still be billed, so it is charged as an estimate (the request's size plus
 * max_tokens, for every attempt the SDK may have made); a connection error is charged the request's size for each
 * attempt (the request may have been sent, an answer is unlikely); nothing else without a response is charged.
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

/**
 * Where a failure came from: the model's answer, the API rejecting our request (a deployment problem: 400, 401,
 * 403, 404, 422, SDK usage errors), or a transient condition (timeouts, rate limits, connection, 5xx).
 */
export type FailureOrigin = "response" | "rejected" | "transient";

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
      origin: FailureOrigin;
      /** The model that answered (for failures after a response), else the requested model. */
      servedModel: string;
      fallbackUsed: boolean;
      /** The response's usage; without a response, the estimate described in the module comment (or zero). */
      usage: TokenUsage;
    };

/** Per-request limits handed to the transport (derived from the time left; see callBudget). */
export interface CallLimits {
  timeoutMs: number;
  maxRetries: number;
  signal: AbortSignal;
}

/** How a request reaches a model: the SDK (anthropic) or the mock provider. */
export type AiTransport = (
  params: MessageCreateParamsNonStreaming,
  context: { feature: AiFeature } & CallLimits,
) => Promise<BetaMessage>;

/** The SDK's per-request options the transport passes (a subset of its RequestOptions). */
export interface MessagesRequestOptions {
  timeout?: number;
  maxRetries?: number;
  signal?: AbortSignal;
}

/** The part of the SDK client the transport uses (tests pass a fake with the same shape). */
export interface MessagesClient {
  beta: {
    messages: {
      create(
        params: MessageCreateParamsNonStreaming,
        options?: MessagesRequestOptions,
      ): PromiseLike<BetaMessage>;
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

/** A transport over an SDK client (the real one, or a fake in tests), with the per-request limits. */
export function sdkTransport(messagesClient: MessagesClient): AiTransport {
  return async (params, limits) =>
    messagesClient.beta.messages.create(params, {
      timeout: limits.timeoutMs,
      maxRetries: limits.maxRetries,
      signal: limits.signal,
    });
}

/** The deadline of model work that starts now (a request or a cron run). */
export function requestDeadline(startedAt: number = Date.now()): number {
  return startedAt + AI_REQUEST_BUDGET_MS;
}

/**
 * The SDK limits for a call started at `at` that must be over by `deadlineAt`: null when less than
 * AI_MIN_CALL_MS is left (no call is started); else a timeout of at most what is left (45 s at most), the SDK
 * retry only when two full attempts and the back-off still fit, and the time left for the abort signal.
 */
export function callBudget(
  deadlineAt: number,
  at: number = Date.now(),
): { timeoutMs: number; maxRetries: number; remainingMs: number } | null {
  const remainingMs = deadlineAt - at;
  if (remainingMs < AI_MIN_CALL_MS) return null;
  const timeoutMs = Math.min(AI_TIMEOUT_MS, remainingMs);
  const twoAttempts = 2 * AI_TIMEOUT_MS + AI_RETRY_BACKOFF_ALLOWANCE_MS;
  return { timeoutMs, maxRetries: remainingMs >= twoAttempts ? AI_MAX_RETRIES : 0, remainingMs };
}

/** Rough token count of the request (4 characters a token): the input side of a failed call's estimate. */
export function estimateInputTokens(params: MessageCreateParamsNonStreaming): number {
  const text = JSON.stringify({
    system: params.system,
    messages: params.messages,
    format: params.output_config?.format,
  });
  return Math.ceil(text.length / 4);
}

/** What a call that ended without a response is charged (see the module comment). */
export function failedCallUsage(
  error: unknown,
  params: MessageCreateParamsNonStreaming,
  maxRetries: number,
): TokenUsage {
  const attempts = 1 + maxRetries;
  if (error instanceof APIConnectionTimeoutError || error instanceof APIUserAbortError) {
    return {
      ...ZERO_USAGE,
      inputTokens: estimateInputTokens(params) * attempts,
      outputTokens: params.max_tokens * attempts,
    };
  }
  if (error instanceof APIConnectionError) {
    return { ...ZERO_USAGE, inputTokens: estimateInputTokens(params) * attempts };
  }
  return { ...ZERO_USAGE };
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

/**
 * Map a thrown SDK error to a failure kind and origin, most specific class first. Other errors are re-thrown.
 * (APIUserAbortError is our own deadline signal: a timeout.)
 */
export function failureForError(
  feature: AiFeature,
  error: unknown,
): { kind: AiFailureKind; origin: Exclude<FailureOrigin, "response"> } {
  if (error instanceof APIConnectionTimeoutError) return { kind: "timeout", origin: "transient" };
  if (error instanceof APIUserAbortError) return { kind: "timeout", origin: "transient" };
  if (error instanceof RateLimitError) return { kind: "unavailable", origin: "transient" };
  if (error instanceof APIConnectionError) return { kind: "unavailable", origin: "transient" };
  if (error instanceof BadRequestError || error instanceof UnprocessableEntityError) {
    logFailure(feature, "the API rejected the request", error);
    return { kind: "invalid", origin: "rejected" };
  }
  if (error instanceof AuthenticationError || error instanceof PermissionDeniedError) {
    logFailure(feature, "the API key was refused", error);
    return { kind: "not_configured", origin: "rejected" };
  }
  if (error instanceof NotFoundError) {
    logFailure(feature, "the model is not available to this key", error);
    return { kind: "unavailable", origin: "rejected" };
  }
  if (error instanceof APIError) {
    logFailure(feature, "the API failed", error);
    return { kind: "unavailable", origin: "transient" };
  }
  if (error instanceof AnthropicError) {
    // Raised by the SDK before sending (a usage error about our request).
    logFailure(feature, "the SDK refused the request", error);
    return { kind: "unavailable", origin: "rejected" };
  }
  throw error;
}

const BUSY_MESSAGE = "AI is busy right now. Please try again in a minute.";

export interface GenerateOptions {
  transport?: AiTransport;
  /** Epoch ms by which the call must be over (default: requestDeadline() from now). */
  deadlineAt?: number;
}

/**
 * Call the model once and validate its structured output with `schema` (the same zod schema is sent as the
 * output format). Never throws for model or API problems: they come back as failure outcomes.
 */
export async function generate<S extends z.ZodType>(
  schema: S,
  request: GenerateRequest,
  options: GenerateOptions = {},
): Promise<GenerateOutcome<z.output<S>>> {
  const transport = options.transport ?? defaultTransport();
  const params = buildParams(schema, request);
  const failed = (
    kind: AiFailureKind,
    origin: FailureOrigin,
    extra: Partial<{
      message: string;
      servedModel: string;
      fallbackUsed: boolean;
      usage: TokenUsage;
    }> = {},
  ): GenerateOutcome<z.output<S>> => ({
    kind,
    message: extra.message ?? aiFailure(kind).message,
    origin,
    servedModel: extra.servedModel ?? AI_MODEL,
    fallbackUsed: extra.fallbackUsed ?? false,
    usage: extra.usage ?? { ...ZERO_USAGE },
  });

  const budget = callBudget(options.deadlineAt ?? requestDeadline());
  if (!budget) return failed("timeout", "transient");

  let response: BetaMessage;
  try {
    response = await transport(params, {
      feature: request.feature,
      timeoutMs: budget.timeoutMs,
      maxRetries: budget.maxRetries,
      signal: AbortSignal.timeout(budget.remainingMs),
    });
  } catch (error) {
    const { kind, origin } = failureForError(request.feature, error);
    return failed(kind, origin, {
      ...(error instanceof RateLimitError ? { message: BUSY_MESSAGE } : {}),
      usage: failedCallUsage(error, params, budget.maxRetries),
    });
  }

  const usage = tokenUsage(response.usage);
  const meta = {
    servedModel: response.model || AI_MODEL,
    fallbackUsed: servedByFallback(response.usage),
    usage,
  };

  if (response.stop_reason === "refusal") return failed("refused", "response", meta);
  if (
    response.stop_reason === "max_tokens" ||
    response.stop_reason === "model_context_window_exceeded"
  ) {
    return failed("truncated", "response", meta);
  }

  const text = answerText(response.content);
  if (text === null) {
    logFailure(
      request.feature,
      `no text in the answer (stop_reason ${String(response.stop_reason)})`,
    );
    return failed("invalid", "response", meta);
  }
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    logFailure(request.feature, "the answer is not JSON");
    return failed("invalid", "response", meta);
  }
  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    logFailure(
      request.feature,
      `the answer does not match the schema (${parsed.error.issues.length} issues)`,
    );
    return failed("invalid", "response", meta);
  }
  return { kind: "ok", data: parsed.data as z.output<S>, ...meta };
}
