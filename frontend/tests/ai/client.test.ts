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
  defaultTransport,
  generate,
  sdkTransport,
  setAiTransportForTests,
  tokenUsage,
  type GenerateRequest,
} from "@/server/ai/client";
import { AI_MAX_RETRIES, AI_MODEL, AI_TIMEOUT_MS } from "@/server/ai/config";
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
  const create = vi.fn(async (params: MessageCreateParamsNonStreaming) => respond(params));
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
    });
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

  it("refusal → refused, before looking at any text", async () => {
    const { client } = fakeClient(() => mockMessage({ text: okText, stopReason: "refusal" }));
    const outcome = await run(client);
    expect(outcome).toMatchObject({ kind: "refused", message: AI_FAILURE_MESSAGES.refused });
    expect(outcome.usage.inputTokens).toBe(100);
  });

  it("max_tokens and the context window → truncated", async () => {
    for (const stopReason of ["max_tokens", "model_context_window_exceeded"] as const) {
      const { client } = fakeClient(() => mockMessage({ text: okText, stopReason }));
      expect((await run(client)).kind).toBe("truncated");
    }
  });

  it("no text, text that is not JSON, and JSON that fails the schema → invalid", async () => {
    const errors = vi.spyOn(console, "error").mockImplementation(() => undefined);
    for (const text of [null, "Sure! {not json", JSON.stringify({ summary: 3 })]) {
      const { client } = fakeClient(() => mockMessage({ text }));
      expect((await run(client)).kind).toBe("invalid");
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
  const cases: [string, unknown, string][] = [
    ["connection timeout", new APIConnectionTimeoutError(), "timeout"],
    ["rate limit", new RateLimitError(429, errorBody, "429", headers), "unavailable"],
    ["connection", new APIConnectionError({ message: "Connection error." }), "unavailable"],
    ["overloaded", new InternalServerError(529, errorBody, "529", headers), "unavailable"],
    ["bad request", new BadRequestError(400, errorBody, "400", headers), "invalid"],
    ["unprocessable", new UnprocessableEntityError(422, errorBody, "422", headers), "invalid"],
    ["bad key", new AuthenticationError(401, errorBody, "401", headers), "not_configured"],
    ["no permission", new PermissionDeniedError(403, errorBody, "403", headers), "not_configured"],
    ["model not found", new NotFoundError(404, errorBody, "404", headers), "unavailable"],
    ["aborted", new APIUserAbortError(), "unavailable"],
  ];

  it.each(cases)("%s → %s", async (_name, error, kind) => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const outcome = await run(failingClient(error).client);
    expect(outcome.kind).toBe(kind);
    expect(outcome.usage.inputTokens).toBe(0);
    expect(outcome.servedModel).toBe(AI_MODEL);
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
