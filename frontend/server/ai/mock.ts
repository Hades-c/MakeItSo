import "server-only";
import {
  APIConnectionError,
  APIConnectionTimeoutError,
  AuthenticationError,
  BadRequestError,
  InternalServerError,
  RateLimitError,
} from "@anthropic-ai/sdk";
import type {
  BetaContentBlock,
  BetaMessage,
  BetaUsage,
  MessageCreateParamsNonStreaming,
} from "@anthropic-ai/sdk/resources/beta/messages/messages";
import { STUDENT_NAME_PLACEHOLDER, type AiFeature } from "@/lib/types/ai";
import { readDataBlocks } from "@/server/ai/blocks";

/**
 * The mock provider (AI_PROVIDER=mock): deterministic, schema-valid answers derived only from the request's data
 * blocks, so tests and e2e exercise the whole path (payloads, parsing, validation, grounding, caching) without a
 * model. server/env.ts rejects AI_PROVIDER=mock on the Vercel production environment.
 *
 * A knob simulates every outcome (vitest: setMockAiScenario; the e2e server cannot reach it, see the W6
 * contract requests): API errors are real SDK error instances and responses are real BetaMessage shapes, so
 * server/ai/client.ts handles them exactly as it would handle the API. The last requests are kept in memory
 * (mockAiRequests) so tests can check the exact request body.
 */

export const MOCK_FALLBACK_MODEL = "claude-sonnet-5";

export const MOCK_AI_SCENARIOS = [
  "ok",
  // stop reasons
  "refusal",
  "max_tokens",
  "context_window",
  // unusable answers
  "no_text",
  "bad_json",
  "wrong_shape",
  // thrown API / network errors
  "timeout",
  "rate_limit",
  "connection",
  "bad_request",
  "auth",
  "server_error",
  // served by the server-side fallback
  "fallback",
  // grounding: every suggested course invented / one invented next to valid ones
  "ungrounded",
  "one_ungrounded",
  // post-validation: forbidden claims, links and e-mail addresses, long quotations
  "forbidden_claims",
  "links",
  "quote_reviews",
] as const;
export type MockAiScenario = (typeof MOCK_AI_SCENARIOS)[number];

interface MockState {
  scenario: MockAiScenario;
  /** How many calls the scenario applies to (then back to "ok"). */
  remaining: number;
  /** Only calls of this feature use the scenario. */
  feature: AiFeature | null;
}

const state: MockState = { scenario: "ok", remaining: Infinity, feature: null };
const requests: { feature: AiFeature; params: MessageCreateParamsNonStreaming }[] = [];
const MAX_KEPT_REQUESTS = 50;

/** Make the next `times` calls (default: all) of `feature` (default: any) answer as `scenario`. */
export function setMockAiScenario(
  scenario: MockAiScenario,
  options: { times?: number; feature?: AiFeature } = {},
): void {
  state.scenario = scenario;
  state.remaining = options.times ?? Infinity;
  state.feature = options.feature ?? null;
}

/** Back to "ok" and forget the recorded requests. */
export function resetMockAi(): void {
  setMockAiScenario("ok");
  requests.length = 0;
}

/** The request bodies the mock received, oldest first (at most the last 50). */
export function mockAiRequests(): readonly {
  feature: AiFeature;
  params: MessageCreateParamsNonStreaming;
}[] {
  return requests;
}

function takeScenario(feature: AiFeature): MockAiScenario {
  if (state.scenario === "ok" || (state.feature && state.feature !== feature)) return "ok";
  if (state.remaining <= 0) return "ok";
  state.remaining -= 1;
  const scenario = state.scenario;
  if (state.remaining <= 0) setMockAiScenario("ok");
  return scenario;
}

// ---- Building responses ------------------------------------------------------------------------------------------

function estimateTokens(text: string): number {
  return Math.max(1, Math.ceil(text.length / 4));
}

function requestText(params: MessageCreateParamsNonStreaming): string {
  const system = Array.isArray(params.system)
    ? params.system.map((block) => block.text).join("\n")
    : (params.system ?? "");
  return `${system}\n${userBlocks(params).join("\n")}`;
}

function userBlocks(params: MessageCreateParamsNonStreaming): string[] {
  const out: string[] = [];
  for (const message of params.messages) {
    if (message.role !== "user") continue;
    if (typeof message.content === "string") {
      out.push(message.content);
      continue;
    }
    for (const block of message.content) {
      if (block.type === "text") out.push(block.text);
    }
  }
  return out;
}

export interface MockMessageOptions {
  text?: string | null;
  stopReason?: BetaMessage["stop_reason"];
  model?: string;
  inputTokens?: number;
  outputTokens?: number;
  fallback?: boolean;
  /** Blocks placed before the answer (e.g. a declined model's partial text and a fallback boundary). */
  prefix?: BetaContentBlock[];
}

function iteration(
  type: "message" | "fallback_message",
  model: string,
  input: number,
  output: number,
) {
  return {
    type,
    model,
    input_tokens: input,
    output_tokens: output,
    cache_creation: null,
    cache_creation_input_tokens: 0,
    cache_read_input_tokens: 0,
  } as const;
}

/** A BetaMessage as the Messages API returns it (also used by the client tests' fake SDK). */
export function mockMessage(options: MockMessageOptions = {}): BetaMessage {
  const model = options.model ?? (options.fallback ? MOCK_FALLBACK_MODEL : "claude-sonnet-5-5");
  const input = options.inputTokens ?? 100;
  const output = options.outputTokens ?? 50;
  const usage: BetaUsage = {
    cache_creation: null,
    cache_creation_input_tokens: 0,
    cache_read_input_tokens: 0,
    fallback_credit: null,
    inference_geo: null,
    input_tokens: input,
    output_tokens: output,
    iterations: options.fallback
      ? [
          iteration("message", "claude-sonnet-5-5", input, 0),
          iteration("fallback_message", model, input, output),
        ]
      : [iteration("message", model, input, output)],
    output_tokens_details: null,
    server_tool_use: null,
    service_tier: "standard",
    speed: null,
  };
  const content: BetaContentBlock[] = [...(options.prefix ?? [])];
  if (options.fallback && !options.prefix) {
    content.push({
      type: "fallback",
      from: { model: "claude-sonnet-5-5" },
      to: { model },
      trigger: { type: "refusal", category: "cyber" },
    });
  }
  if (options.text !== null && options.text !== undefined) {
    content.push({ type: "text", text: options.text, citations: null });
  }
  return {
    id: "msg_mock",
    type: "message",
    role: "assistant",
    model,
    container: null,
    content,
    context_management: null,
    diagnostics: null,
    stop_details: null,
    stop_reason: options.stopReason ?? "end_turn",
    stop_sequence: null,
    usage,
  };
}

// ---- Per-feature answers ------------------------------------------------------------------------------------------

type Json = Record<string, unknown>;

function obj(value: unknown): Json {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Json) : {};
}
function arr(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}
function str(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function firstSentences(text: string, count: number): string {
  return text
    .split(/(?<=[.!?])\s+/)
    .slice(0, count)
    .join(" ")
    .trim();
}

function keywords(text: string, count: number): string[] {
  const out: string[] = [];
  for (const word of text.toLowerCase().match(/[a-z][a-z-]{6,}/g) ?? []) {
    if (!out.includes(word)) out.push(word);
    if (out.length >= count) break;
  }
  return out;
}

function courseAbout(data: Json, scenario: MockAiScenario): unknown {
  const course = obj(obj(data.catalog_data).course);
  const title = str(course.title, "This course");
  const description = str(arr(course.descriptions)[0]);
  const requirements = arr(course.requirements)
    .map((r) => str(obj(r).name))
    .filter(Boolean);
  let summary = firstSentences(description, 2) || `${title} as described in the official catalog.`;
  const goodFor = requirements.length
    ? requirements.slice(0, 2).map((name) => `want a course that counts toward ${name}`)
    : [`are curious about ${title.toLowerCase()}`];
  const topics = keywords(description, 4);
  if (scenario === "forbidden_claims") {
    summary = `${summary} The workload is heavy and the prerequisites are strict. It is an easy A.`;
    goodFor.push("want an easy A", "can handle a heavy workload");
  }
  if (scenario === "links") {
    summary = `${summary} Details at https://example.org/course and www.example.com, or write to someone@example.org.`;
  }
  return { summary, goodFor, topics };
}

function planSuggestions(data: Json, scenario: MockAiScenario): unknown {
  const catalog = obj(data.catalog_data);
  const target = str(obj(catalog.targetTerm).code);
  const candidates = arr(catalog.candidates).map(obj);
  const real = candidates.slice(0, 4).map((c) => {
    const fills = arr(c.fills).map((f) => str(f));
    return {
      courseCode: str(c.courseCode),
      termCode: target,
      why: fills.length ? `Counts toward ${fills[0]}.` : "Fits the rest of your plan.",
    };
  });
  const fake = (n: number) => ({
    courseCode: `FAK ${String(900 + n)}`,
    termCode: target,
    why: "A course that does not exist.",
  });
  if (scenario === "ungrounded") return { picks: [fake(1), fake(2), fake(3)] };
  if (scenario === "one_ungrounded") return { picks: [...real, fake(1)] };
  return { picks: real };
}

function careerPlan(data: Json, scenario: MockAiScenario): unknown {
  const catalog = obj(data.catalog_data);
  const career = obj(catalog.career);
  const careerName = str(career.name, "this career");
  const related = arr(career.relatedPrograms)
    .map((p) => str(p))
    .filter(Boolean);
  const programs = obj(catalog.programs);
  const majors = arr(programs.majors)
    .map((m) => str(m))
    .filter((name) => related.some((r) => name.includes(r)))
    .slice(0, 1);
  const candidates = arr(catalog.candidates).map(obj);
  const courses = candidates.slice(0, 4).map((c) => ({
    courseCode: str(c.courseCode),
    termCode: str(obj(arr(c.terms)[0]).code),
    why: `Builds skills used in ${careerName}.`,
  }));
  const resources = arr(career.davidsonResources)
    .map((r) => str(r))
    .filter(Boolean);
  const experiences = [
    {
      title: "Talk with your advisor about this path",
      when: "This semester",
      why: `Plan the courses that lead toward ${careerName}.`,
    },
    ...(resources[0]
      ? [
          {
            title: `Visit ${resources[0]}`,
            when: "Next semester",
            why: "Get advice on first steps.",
          },
        ]
      : []),
  ];
  if (scenario === "ungrounded") {
    return {
      overview: `A path toward ${careerName}.`,
      majors: ["Major in Underwater Basketweaving"],
      minors: [],
      courses: [
        { courseCode: "FAK 901", termCode: str(obj(arr(candidates[0]?.terms)[0]).code), why: "x" },
        { courseCode: "FAK 902", termCode: "202602", why: "x" },
      ],
      experiences,
    };
  }
  return {
    overview: `Your courses and experiences at Davidson can build toward ${careerName}. Start with the courses below and talk with your advisor.`,
    majors,
    minors: [],
    courses,
    experiences,
  };
}

function coldEmail(data: Json): unknown {
  const catalog = obj(data.catalog_data);
  const alumnus = obj(catalog.alumnus);
  const profile = obj(data.student_profile);
  const goals = obj(data.student_goals);
  const name = str(alumnus.name, "there");
  const field = str(goals.career) || str(alumnus.role) || "your field";
  const standing = str(profile.standing, "student");
  const majors = arr(profile.majors)
    .map((m) => str(m))
    .filter(Boolean);
  const studying = majors.length ? ` pursuing the ${majors.join(" and ")}` : "";
  return {
    subject: `Davidson ${standing} interested in ${field}`,
    body: [
      `Dear ${name},`,
      `I am a ${standing} at Davidson College${studying}, and I am exploring ${field}.`,
      `Would you have 15 to 20 minutes in the coming weeks to tell me how you found your way into your work?`,
      "Thank you for considering it.",
      `Best,\n${STUDENT_NAME_PLACEHOLDER}`,
    ].join("\n\n"),
  };
}

function professorSummary(data: Json, scenario: MockAiScenario): unknown {
  const reviews = arr(data.untrusted_reviews).map(obj);
  if (scenario === "quote_reviews") {
    const text = str(reviews[0]?.text);
    return { summary: `Reviewers said: "${text}"`, themes: ["Quoted review"] };
  }
  return {
    summary: `Across ${reviews.length} reviews, reviewers often mention clear explanations and engaged class discussion.`,
    themes: ["Clear explanations", "Engaged discussion"],
  };
}

function answerFor(feature: AiFeature, data: Json, scenario: MockAiScenario): unknown {
  switch (feature) {
    case "course-about":
      return courseAbout(data, scenario);
    case "plan-suggestions":
      return planSuggestions(data, scenario);
    case "career-plan":
      return careerPlan(data, scenario);
    case "cold-email":
      return coldEmail(data);
    case "professor-summary":
      return professorSummary(data, scenario);
  }
}

function apiErrorBody(type: string, message: string) {
  return { type: "error", error: { type, message } };
}

/** The mock transport: answers (or fails) like the Messages API would. */
export async function mockTransport(
  params: MessageCreateParamsNonStreaming,
  context: { feature: AiFeature },
): Promise<BetaMessage> {
  requests.push({ feature: context.feature, params });
  if (requests.length > MAX_KEPT_REQUESTS) requests.shift();
  const scenario = takeScenario(context.feature);
  const inputTokens = estimateTokens(requestText(params));
  const headers = new Headers();

  switch (scenario) {
    case "timeout":
      throw new APIConnectionTimeoutError();
    case "connection":
      throw new APIConnectionError({ message: "Connection error." });
    case "rate_limit":
      throw new RateLimitError(
        429,
        apiErrorBody("rate_limit_error", "Rate limited"),
        "429",
        headers,
      );
    case "bad_request":
      throw new BadRequestError(400, apiErrorBody("invalid_request_error", "Bad"), "400", headers);
    case "auth":
      throw new AuthenticationError(
        401,
        apiErrorBody("authentication_error", "Bad key"),
        "401",
        headers,
      );
    case "server_error":
      throw new InternalServerError(
        529,
        apiErrorBody("overloaded_error", "Overloaded"),
        "529",
        headers,
      );
    case "refusal":
      return mockMessage({ text: null, stopReason: "refusal", inputTokens, outputTokens: 0 });
    case "max_tokens":
      return mockMessage({ text: '{"summary": "cut', stopReason: "max_tokens", inputTokens });
    case "context_window":
      return mockMessage({ text: null, stopReason: "model_context_window_exceeded", inputTokens });
    case "no_text":
      return mockMessage({ text: null, inputTokens });
    case "bad_json":
      return mockMessage({ text: "Here is your answer: {not json", inputTokens });
    case "wrong_shape":
      return mockMessage({ text: JSON.stringify({ unexpected: true }), inputTokens });
    default:
      break;
  }

  const data = readDataBlocks(userBlocks(params)) as Json;
  const text = JSON.stringify(answerFor(context.feature, data, scenario));
  return mockMessage({
    text,
    inputTokens,
    outputTokens: estimateTokens(text),
    fallback: scenario === "fallback",
  });
}
