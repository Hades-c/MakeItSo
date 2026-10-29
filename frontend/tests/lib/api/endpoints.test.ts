import { afterEach, describe, expect, it, vi } from "vitest";
import { authExtraApi } from "@/app/(auth)/_lib/contracts";
import { accountApi } from "@/lib/api/account";
import { aiApi } from "@/lib/api/ai";
import { catalogApi } from "@/lib/api/catalog";
import { aiFailureOf, apiErrorOf, apiUrl, ApiClientError, callApi } from "@/lib/api/client";
import {
  accountEndpoints,
  aiEndpoints,
  authExtraEndpoints,
  catalogEndpoints,
  moodleEndpoints,
  planEndpoints,
  profileEndpoints,
  syllabiEndpoints,
} from "@/lib/api/endpoints";
import { moodleApi } from "@/lib/api/moodle";
import { planApi } from "@/lib/api/plan";
import { profileApi } from "@/lib/api/profile";
import { API_SPECS, specFor } from "@/lib/api/registry";
import type { ApiRouteSpec } from "@/lib/api/spec";
import { syllabiApi } from "@/lib/api/syllabi";
import { AI_FAILURE_KINDS, AI_RESULT_STATUS } from "@/lib/types/ai";

/**
 * lib/api/endpoints.ts: the zod-free routes client islands call. Each one is its spec's method, path and AI flag
 * (the compiler checks it too); callApi checks an endpoint's response against the spec outside production only.
 */

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.resetModules();
});

function stubFetch(status: number, body: unknown) {
  const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) =>
    body === null ? new Response(null, { status }) : Response.json(body, { status }),
  );
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

const FAMILIES: [string, Record<string, ApiRouteSpec>, Record<string, object>][] = [
  ["account", accountApi, accountEndpoints],
  ["ai", aiApi, aiEndpoints],
  ["catalog", catalogApi, catalogEndpoints],
  ["plan", planApi, planEndpoints],
  ["profile", profileApi, profileEndpoints],
  ["authExtra", authExtraApi, authExtraEndpoints],
  ["syllabi", syllabiApi, syllabiEndpoints],
  ["moodle", moodleApi, moodleEndpoints],
];

describe("endpoints", () => {
  it.each(FAMILIES)(
    "%s: one endpoint per route, with the spec's method, path and AI flag",
    (_name, specs, endpoints) => {
      expect(Object.keys(endpoints).sort()).toEqual(Object.keys(specs).sort());
      for (const [key, spec] of Object.entries(specs)) {
        expect([key, endpoints[key]]).toEqual([
          key,
          { method: spec.method, path: spec.path, ...(spec.aiResult ? { aiResult: true } : {}) },
        ]);
      }
    },
  );

  it("the registry finds every spec by method and path, once", () => {
    for (const spec of API_SPECS) {
      expect(specFor(spec.method, spec.path)).toBe(spec);
    }
    const keys = API_SPECS.map((spec) => `${spec.method} ${spec.path}`);
    expect(new Set(keys).size).toBe(keys.length);
    expect(specFor("GET", "/api/nope")).toBeUndefined();
  });
});

describe("callApi with an endpoint", () => {
  const ITEM_ID = "0123456789abcdef01234567";

  it("builds the URL and sends the request like the spec", async () => {
    expect(apiUrl(planEndpoints.removeItem, { params: { id: ITEM_ID } })).toBe(
      `/api/plan/items/${ITEM_ID}`,
    );
    const fetchMock = stubFetch(204, null);
    await expect(
      callApi(planEndpoints.removeItem, { params: { id: ITEM_ID } }),
    ).resolves.toBeNull();
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe(`/api/plan/items/${ITEM_ID}`);
    expect(init).toMatchObject({ method: "DELETE", credentials: "same-origin" });
  });

  it("checks the response against the spec outside production", async () => {
    stubFetch(200, { results: [{ kind: "nope" }] });
    await expect(callApi(catalogEndpoints.search, { query: { q: "x" } })).rejects.toMatchObject({
      code: "invalid_response",
    });
  });

  it("in production returns the body as sent, without loading the specs (no zod in the client)", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.resetModules();
    const client = await import("@/lib/api/client");
    const endpoints = await import("@/lib/api/endpoints");
    stubFetch(200, { results: [{ kind: "nope" }] });
    await expect(
      client.callApi(endpoints.catalogEndpoints.search, { query: { q: "x" } }),
    ).resolves.toEqual({ results: [{ kind: "nope" }] });
    // A full spec is still checked.
    await expect(client.callApi(catalogApi.search, { query: { q: "x" } })).rejects.toMatchObject({
      code: "invalid_response",
    });
  });

  it("returns AiResult failures from AI routes, and throws ApiClientError for error bodies", async () => {
    const body = { termCode: "202602", courseCode: "CSC 221" };
    for (const kind of AI_FAILURE_KINDS) {
      stubFetch(AI_RESULT_STATUS[kind], { kind, message: `m-${kind}` });
      await expect(callApi(aiEndpoints.courseAbout, { body })).resolves.toEqual({
        kind,
        message: `m-${kind}`,
      });
    }
    stubFetch(429, { error: { code: "rate_limited", message: "Slow down." } });
    const limited = await callApi(aiEndpoints.courseAbout, { body }).catch((e: unknown) => e);
    expect(limited).toBeInstanceOf(ApiClientError);
    expect(limited).toMatchObject({ status: 429, code: "rate_limited", message: "Slow down." });
    // A non-AI route never returns a failure-shaped body.
    stubFetch(403, { kind: "unverified", message: "x" });
    await expect(
      callApi(planEndpoints.addItem, { body: { termCode: "202602", courseCode: "CSC 221" } }),
    ).rejects.toMatchObject({ status: 403, code: "internal" });
  });
});

describe("the zod-free body guards", () => {
  it("apiErrorOf reads the error body, issues included, and nothing else", () => {
    expect(
      apiErrorOf({
        error: { code: "validation_failed", message: "Bad", issues: [{ path: "q", message: "x" }] },
        extra: 1,
      }),
    ).toEqual({ code: "validation_failed", message: "Bad", issues: [{ path: "q", message: "x" }] });
    expect(apiErrorOf({ error: { code: "not_found", message: "Gone" } })).toEqual({
      code: "not_found",
      message: "Gone",
    });
    for (const bad of [
      null,
      "error",
      { error: { code: "teapot", message: "x" } },
      { error: { code: "not_found" } },
      { error: { code: "not_found", message: "x", issues: [{ path: 1 }] } },
      { error: [] },
    ]) {
      expect(apiErrorOf(bad)).toBeNull();
    }
  });

  it("aiFailureOf accepts the AI failure kinds only", () => {
    expect(aiFailureOf({ kind: "quota", message: "Tomorrow." })).toEqual({
      kind: "quota",
      message: "Tomorrow.",
    });
    expect(aiFailureOf({ kind: "ok", data: {} })).toBeNull();
    expect(aiFailureOf({ kind: "quota" })).toBeNull();
    expect(aiFailureOf({ kind: "made-up", message: "x" })).toBeNull();
  });
});
