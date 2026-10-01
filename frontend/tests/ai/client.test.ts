import Anthropic, {
  APIConnectionError,
  APIConnectionTimeoutError,
  APIUserAbortError,
  AuthenticationError,
  BadRequestError,
  InternalServerError,
  NotFoundError,
  PermissionDeniedError,
  RateLimitError,
  UnprocessableEntityError,
} from "@anthropic-ai/sdk";
import type {
  BetaMessage,
  MessageCreateParamsNonStreaming,
} from "@anthropic-ai/sdk/resources/beta/messages/messages";
import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { AI_FAILURE_MESSAGES } from "@/lib/types/ai";
import {
  anthropicClient,
  answerText,
  buildParams,
  callBudget,
  defaultTransport,
  estimateInputTokens,
  generate,
  requestDeadline,
  sdkTransport,
  setAiTransportForTests,
  tokenUsage,
  ZERO_USAGE,
  type GenerateRequest,
} from "@/server/ai/client";
import {
  AI_MAX_RETRIES,
  AI_MIN_CALL_MS,
  AI_MIN_RETRY_MS,
  AI_MODEL,
  AI_REQUEST_BUDGET_MS,
  AI_ROUTE_MAX_DURATION,
  AI_TIMEOUT_MS,
} from "@/server/ai/config";
import { mockMessage, mockTransport } from "@/server/ai/mock";

/**
 * server/ai/client.ts against a fake SDK client (the Messages API is never reached): the exact request shape and
 * the result handling for every stop reason and error class.
 */

const Schema = z.object({ summary: z.string(), topics: z.array(z.string()) });

const REQUEST: GenerateRequest = {
  feature: "course-about",
  system: "SYSTEM PROMPT",
  userBlocks: ['<catalog_data>\n{"a":1}\n</catalog_data>', "Do the task."],
  effort: "low",
  maxTokens: 3000,
};

function fakeClient(
  respond: (params: MessageCreateParamsNonStreaming) => BetaMessage | Promise<BetaMessage>,
) {
  const create = vi.fn(async (params: MessageCreateParamsNonStreaming, _options?: unknown) =>
    respond(params),
  );
  return { client: { beta: { messages: { create } } }, create };
}

function failingClient(error: unknown) {
  return fakeClient(() => {
    throw error;
  });
}

const okText = JSON.stringify({ summary: "A course.", topics: ["one"] });

async function run(client: ReturnType<typeof fakeClient>["client"], request = REQUEST) {
  return generate(Schema, request, { transport: sdkTransport(client) });
}

const headers = new Headers();
const errorBody = { type: "error", error: { type: "x", message: "x" } };

afterEach(() => {
  setAiTransportForTests(null);
});

describe("the request (PLAN §6.1 W6 call shape)", () => {
  it("sends Claude Sonnet 5.5 with server-side fallback, effort, the zod output format and a cached system prompt", async () => {
    const { client, create } = fakeClient(() => mockMessage({ text: okText }));
    await run(client);
    expect(create).toHaveBeenCalledTimes(1);
    const params = create.mock.calls[0]![0];
    const sent = JSON.parse(JSON.stringify(params)) as Record<string, unknown>;
    expect(sent).toEqual({
      model: "claude-sonnet-5-5",
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      max_tokens: 3000,
      output_config: {
        effort: "low",
        format: {
          type: "json_schema",
          schema: expect.objectContaining({ type: "object", additionalProperties: false }),
        },
      },
      system: [{ type: "text", text: "SYSTEM PROMPT", cache_control: { type: "ephemeral" } }],
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: '<catalog_data>\n{"a":1}\n</catalog_data>' },
            { type: "text", text: "Do the task." },
          ],
        },
      ],
    });
  });

  it("never sends thinking, sampling parameters or an assistant prefill", () => {
    const params = buildParams(Schema, REQUEST) as unknown as Record<string, unknown>;
    for (const key of ["thinking", "temperature", "top_p", "top_k", "stop_sequences", "stream"]) {
      expect(params).not.toHaveProperty(key);
    }
    const messages = params.messages as { role: string }[];
    expect(messages.map((m) => m.role)).toEqual(["user"]);
  });

  it("creates the SDK client lazily from ANTHROPIC_API_KEY with a 45 s timeout and one retry", () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "sk-ant-test-key");
    vi.stubEnv("ANTHROPIC_AUTH_TOKEN", "should-not-be-used");
    const client = anthropicClient();
    expect(client).toBeInstanceOf(Anthropic);
    expect(client.apiKey).toBe("sk-ant-test-key");
    expect(client.authToken).toBeNull();
    expect(client.timeout).toBe(AI_TIMEOUT_MS);
    expect(client.maxRetries).toBe(AI_MAX_RETRIES);
    expect(AI_TIMEOUT_MS).toBe(45_000);
    expect(AI_MAX_RETRIES).toBe(1);
    expect(anthropicClient()).toBe(client);
    vi.stubEnv("ANTHROPIC_API_KEY", "sk-ant-other-key");
    expect(anthropicClient().apiKey).toBe("sk-ant-other-key");
  });

  it("uses the mock provider with AI_PROVIDER=mock, and a test override before anything", async () => {
    vi.stubEnv("AI_PROVIDER", "mock");
    expect(defaultTransport()).toBe(mockTransport);
    const override = vi.fn(async () => mockMessage({ text: okText }));
    setAiTransportForTests(override);
    expect(defaultTransport()).toBe(override);
    const outcome = await generate(Schema, REQUEST);
    expect(outcome.kind).toBe("ok");
    expect(override).toHaveBeenCalledWith(expect.objectContaining({ model: AI_MODEL }), {
      feature: "course-about",
      timeoutMs: AI_TIMEOUT_MS,
      maxRetries: AI_MAX_RETRIES,
      signal: expect.any(AbortSignal),
    });
  });
});

describe("time: every call is capped by the request's deadline", () => {
  const NOW = 1_000_000;

  it("gives a young request the client defaults: 45 s and one SDK retry", () => {
    expect(callBudget(requestDeadline(NOW), NOW)).toEqual({
      timeoutMs: 45_000,
      maxRetries: 1,
      remainingMs: AI_REQUEST_BUDGET_MS,
    });
    expect(AI_REQUEST_BUDGET_MS).toBeLessThan(AI_ROUTE_MAX_DURATION * 1000);
  });

  it("drops the SDK retry when two full attempts no longer fit, and caps the timeout by what is left", () => {
    expect(callBudget(NOW + 60_000, NOW)).toEqual({
      timeoutMs: 45_000,
      maxRetries: 0,
      remainingMs: 60_000,
    });
    expect(callBudget(NOW + 20_000, NOW)).toEqual({
      timeoutMs: 20_000,
      maxRetries: 0,
      remainingMs: 20_000,
    });
  });

  it("starts no call with less than the minimum left: a timeout, no request", async () => {
    expect(callBudget(NOW + AI_MIN_CALL_MS - 1, NOW)).toBeNull();
    const { client, create } = fakeClient(() => mockMessage({ text: okText }));
    const outcome = await generate(Schema, REQUEST, {
      transport: sdkTransport(client),
      deadlineAt: Date.now() + 1_000,
    });
    expect(outcome).toMatchObject({ kind: "timeout", origin: "transient" });
    expect(outcome.usage).toEqual(ZERO_USAGE);
    expect(create).not.toHaveBeenCalled();
  });

  it("passes timeout, maxRetries and an abort signal to the SDK per request", async () => {
    const { client, create } = fakeClient(() => mockMessage({ text: okText }));
    await generate(Schema, REQUEST, {
      transport: sdkTransport(client),
      deadlineAt: Date.now() + 70_000,
    });
    const options = create.mock.calls[0]![1] as {
      timeout: number;
      maxRetries: number;
      signal: AbortSignal;
    };
    expect(options.timeout).toBe(45_000);
    expect(options.maxRetries).toBe(0);
    expect(options.signal).toBeInstanceOf(AbortSignal);
    expect(options.signal.aborted).toBe(false);
  });

  it("worst case of one request stays inside maxDuration: first call, grounding retry and back-off", () => {
    // First call at t=0 with the SDK retry: 45 + 2 + 45 s at most; the retry is then refused (< 30 s left)…
    const first = callBudget(requestDeadline(NOW), NOW)!;
    const afterFirst = NOW + first.timeoutMs * (1 + first.maxRetries) + 2_000;
    expect(requestDeadline(NOW) - afterFirst).toBeLessThan(AI_MIN_RETRY_MS);
    // …and a first answer after 49 s leaves one capped attempt without an SDK retry.
    const retry = callBudget(requestDeadline(NOW), NOW + 49_000)!;
    expect(retry.maxRetries).toBe(0);
    expect(49_000 + retry.timeoutMs).toBeLessThanOrEqual(AI_REQUEST_BUDGET_MS);
  });
});

describe("result handling, in order", () => {
  it("ok: parses and validates the text, with the served model and no fallback", async () => {
    const { client } = fakeClient(() =>
      mockMessage({ text: okText, inputTokens: 120, outputTokens: 30 }),
    );
    expect(await run(client)).toEqual({
      kind: "ok",
      data: { summary: "A course.", topics: ["one"] },
      servedModel: "claude-sonnet-5-5",
      fallbackUsed: false,
      usage: { inputTokens: 120, outputTokens: 30, cacheReadTokens: 0, cacheCreationTokens: 0 },
    });
  });

  it("refusal → refused, before looking at any text (an answer: origin response)", async () => {
    const { client } = fakeClient(() => mockMessage({ text: okText, stopReason: "refusal" }));
    const outcome = await run(client);
    expect(outcome).toMatchObject({
      kind: "refused",
      origin: "response",
      message: AI_FAILURE_MESSAGES.refused,
    });
    expect(outcome.usage.inputTokens).toBe(100);
  });

  it("max_tokens and the context window → truncated", async () => {
    for (const stopReason of ["max_tokens", "model_context_window_exceeded"] as const) {
      const { client } = fakeClient(() => mockMessage({ text: okText, stopReason }));
      expect(await run(client)).toMatchObject({ kind: "truncated", origin: "response" });
    }
  });

  it("no text, text that is not JSON, and JSON that fails the schema → invalid", async () => {
    const errors = vi.spyOn(console, "error").mockImplementation(() => undefined);
    for (const text of [null, "Sure! {not json", JSON.stringify({ summary: 3 })]) {
      const { client } = fakeClient(() => mockMessage({ text }));
      expect(await run(client)).toMatchObject({ kind: "invalid", origin: "response" });
    }
    expect(errors).toHaveBeenCalledTimes(3);
    // The answer itself is never logged.
    expect(errors.mock.calls.flat().join(" ")).not.toContain("not json");
  });

  it("a fallback-served answer: fallbackUsed from usage.iterations, servedModel = res.model, text after the boundary", async () => {
    const { client } = fakeClient(() =>
      mockMessage({
        fallback: true,
        text: okText,
        inputTokens: 200,
        outputTokens: 40,
        prefix: [
          {
            type: "text",
            text: '{"summary": "partial answer of the declining model',
            citations: null,
          },
          {
            type: "fallback",
            from: { model: "claude-sonnet-5-5" },
            to: { model: "claude-sonnet-5" },
            trigger: { type: "refusal", category: "cyber" },
          },
        ],
      }),
    );
    const outcome = await run(client);
    expect(outcome).toMatchObject({
      kind: "ok",
      servedModel: "claude-sonnet-5",
      fallbackUsed: true,
      data: { summary: "A course." },
    });
    // Both attempts count: 200 input tokens each, the declined one produced no output.
    expect(outcome.usage).toEqual({
      inputTokens: 400,
      outputTokens: 40,
      cacheReadTokens: 0,
      cacheCreationTokens: 0,
    });
  });

  it("sums usage over iterations, falling back to the top-level usage", () => {
    const message = mockMessage({ inputTokens: 10, outputTokens: 5 });
    expect(tokenUsage({ ...message.usage, iterations: null, cache_read_input_tokens: 7 })).toEqual({
      inputTokens: 10,
      outputTokens: 5,
      cacheReadTokens: 7,
      cacheCreationTokens: 0,
    });
    expect(tokenUsage(null)).toEqual({
      inputTokens: 0,
      outputTokens: 0,
      cacheReadTokens: 0,
      cacheCreationTokens: 0,
    });
  });

  it("reads only the text blocks after the last fallback boundary", () => {
    expect(answerText([])).toBeNull();
    expect(
      answerText([
        { type: "text", text: "a", citations: null },
        { type: "text", text: "b", citations: null },
      ]),
    ).toBe("ab");
  });
});

describe("thrown errors, most specific first", () => {
  const cases: [string, unknown, string, string][] = [
    ["connection timeout", new APIConnectionTimeoutError(), "timeout", "transient"],
    ["our deadline (abort)", new APIUserAbortError(), "timeout", "transient"],
    ["rate limit", new RateLimitError(429, errorBody, "429", headers), "unavailable", "transient"],
    [
      "connection",
      new APIConnectionError({ message: "Connection error." }),
      "unavailable",
      "transient",
    ],
    [
      "overloaded",
      new InternalServerError(529, errorBody, "529", headers),
      "unavailable",
      "transient",
    ],
    ["bad request", new BadRequestError(400, errorBody, "400", headers), "invalid", "rejected"],
    [
      "unprocessable",
      new UnprocessableEntityError(422, errorBody, "422", headers),
      "invalid",
      "rejected",
    ],
    [
      "bad key",
      new AuthenticationError(401, errorBody, "401", headers),
      "not_configured",
      "rejected",
    ],
    [
      "no permission",
      new PermissionDeniedError(403, errorBody, "403", headers),
      "not_configured",
      "rejected",
    ],
    [
      "model not found",
      new NotFoundError(404, errorBody, "404", headers),
      "unavailable",
      "rejected",
    ],
  ];

  it.each(cases)("%s → %s (%s)", async (_name, error, kind, origin) => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const outcome = await run(failingClient(error).client);
    expect(outcome).toMatchObject({ kind, origin });
    expect(outcome.servedModel).toBe(AI_MODEL);
  });

  it("charges a timeout as billed (request size + max_tokens per attempt), a connection error its input", async () => {
    const params = buildParams(Schema, REQUEST);
    const input = estimateInputTokens(params);
    expect(input).toBeGreaterThan(0);
    const timeout = await run(failingClient(new APIConnectionTimeoutError()).client);
    // A young request allows the SDK retry: two attempts may have been billed.
    expect(timeout.usage).toEqual({ ...ZERO_USAGE, inputTokens: 2 * input, outputTokens: 6_000 });
    const aborted = await run(failingClient(new APIUserAbortError()).client);
    expect(aborted.usage.outputTokens).toBe(6_000);
    const connection = await run(
      failingClient(new APIConnectionError({ message: "Connection error." })).client,
    );
    expect(connection.usage).toEqual({ ...ZERO_USAGE, inputTokens: 2 * input });
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    for (const error of [
      new BadRequestError(400, errorBody, "400", headers),
      new RateLimitError(429, errorBody, "429", headers),
      new InternalServerError(529, errorBody, "529", headers),
    ]) {
      expect((await run(failingClient(error).client)).usage).toEqual(ZERO_USAGE);
    }
  });

  it("says the AI is busy on a rate limit", async () => {
    const outcome = await run(
      failingClient(new RateLimitError(429, errorBody, "429", headers)).client,
    );
    expect(outcome).toMatchObject({
      kind: "unavailable",
      message: "AI is busy right now. Please try again in a minute.",
    });
  });

  it("logs a rejected request (it is ours), without the prompt", async () => {
    const errors = vi.spyOn(console, "error").mockImplementation(() => undefined);
    await run(failingClient(new BadRequestError(400, errorBody, "400", headers)).client);
    expect(errors).toHaveBeenCalledTimes(1);
    const logged = errors.mock.calls.flat().join(" ");
    expect(logged).toContain("BadRequestError");
    expect(logged).not.toContain("catalog_data");
  });

  it("re-throws errors that are not the SDK's (a bug of ours)", async () => {
    await expect(run(failingClient(new TypeError("boom")).client)).rejects.toThrow("boom");
  });
});
