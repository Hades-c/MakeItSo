import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import * as z from "zod";
import { accountApi } from "@/lib/api/account";
import { aiApi } from "@/lib/api/ai";
import { catalogApi } from "@/lib/api/catalog";
import { eventsApi } from "@/lib/api/events";
import { planApi } from "@/lib/api/plan";
import { profileApi } from "@/lib/api/profile";
import { programsApi } from "@/lib/api/programs";
import { ratingsApi } from "@/lib/api/ratings";
import { searchApi } from "@/lib/api/search";
import { buildPath, type ApiRouteSpec } from "@/lib/api/spec";

const FAMILIES = {
  accountApi,
  aiApi,
  catalogApi,
  eventsApi,
  planApi,
  profileApi,
  programsApi,
  ratingsApi,
  searchApi,
} satisfies Record<string, Record<string, ApiRouteSpec>>;

const specs = Object.entries(FAMILIES).flatMap(([family, routes]) =>
  Object.entries(routes).map(([name, spec]) => ({
    id: `${family}.${name}`,
    spec: spec as ApiRouteSpec,
  })),
);

describe("lib/api route contracts (PLAN §4.1.16)", () => {
  it("declares each method + path once", () => {
    const keys = specs.map(({ spec }) => `${spec.method} ${spec.path}`);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it.each(specs)("$id is consistent", ({ spec }) => {
    expect(spec.path).toMatch(/^\/api\/[a-z0-9/[\]-]+$/);
    if (spec.method === "GET") expect(spec.body).toBeUndefined();
    if (spec.cache === "public-catalog") {
      expect(spec.method).toBe("GET");
      expect(spec.auth).toBe("public");
    }
    // Every [segment] has a params schema key, and vice versa.
    const segments = [...spec.path.matchAll(/\[([^\]]+)\]/g)].map((m) => m[1]);
    if (segments.length > 0) {
      expect(spec.params).toBeInstanceOf(z.ZodObject);
      expect(Object.keys((spec.params as z.ZodObject).shape).sort()).toEqual(segments.sort());
    } else {
      expect(spec.params).toBeUndefined();
    }
    // Body schemas are strict: unknown keys are rejected.
    if (spec.body) {
      const probe = spec.body.safeParse({ __unknown_key__: 1 });
      expect(probe.success).toBe(false);
    }
    if (spec.response === null) expect(spec.status ?? 204).toBe(204);
  });

  it("AI routes: generating routes answer AiResults (auth user, gate in the handler); report/purge do not", () => {
    const generating = [
      "courseAbout",
      "planSuggestions",
      "careerPlan",
      "coldEmail",
      "professorSummary",
    ];
    for (const [name, spec] of Object.entries(aiApi)) {
      if (generating.includes(name)) {
        expect([name, spec.auth, "aiResult" in spec && spec.aiResult]).toEqual([
          name,
          "user",
          true,
        ]);
        // Every failure kind is a valid body for the route (callApi returns it instead of throwing).
        expect(spec.response?.safeParse({ kind: "unverified", message: "x" }).success).toBe(true);
      } else {
        expect([name, spec.auth]).toEqual([name, name === "purge" ? "admin" : "verified"]);
        expect("aiResult" in spec).toBe(false);
      }
    }
  });

  it("cron jobs: every /api/cron route has a cron spec, and vercel.json schedules each exactly once", () => {
    const cronSpecs = specs.filter(({ spec }) => spec.path.startsWith("/api/cron/"));
    for (const { id, spec } of cronSpecs) {
      expect([id, spec.method, spec.auth, spec.body]).toEqual([id, "GET", "cron", undefined]);
    }
    expect(cronSpecs.map(({ id }) => id).sort()).toEqual([
      "catalogApi.cronRefresh",
      "eventsApi.cronFeeds",
      "programsApi.cron",
      "ratingsApi.cronRoster",
    ]);
    // frontend/vercel.json is the Root Directory's config (the repository-root one is not read).
    const vercel = JSON.parse(
      readFileSync(new URL("../../../vercel.json", import.meta.url), "utf8"),
    ) as { crons: { path: string; schedule: string }[] };
    expect(vercel.crons.map((job) => job.path).sort()).toEqual(
      cronSpecs.map(({ spec }) => spec.path).sort(),
    );
    for (const job of vercel.crons) {
      // Five fields, at most daily (Vercel Hobby): fixed minute and hour.
      expect([job.path, job.schedule]).toEqual([
        job.path,
        expect.stringMatching(/^\d+ \d+ \* \* [\d*]+$/),
      ]);
    }
    expect(Object.fromEntries(vercel.crons.map((job) => [job.path, job.schedule]))).toMatchObject({
      "/api/cron/catalog": "13 7 * * *",
      "/api/cron/programs": "23 6 * * 1",
    });
  });

  it("account: enumeration-safe answers are 202 check-inbox; reset and test-mailbox routes have contracts", () => {
    for (const spec of [accountApi.register, accountApi.requestPasswordReset]) {
      expect(spec.status).toBe(202);
      expect(spec.response.parse({ status: "check-inbox", message: "Check your inbox." })).toEqual({
        status: "check-inbox",
        message: "Check your inbox.",
      });
      expect(spec.response.safeParse({ message: "Check your inbox." }).success).toBe(false);
    }
    const reset = { email: " Casey@Davidson.edu ", code: "123456", newPassword: "long enough pw" };
    expect(accountApi.confirmPasswordReset.body.parse(reset).email).toBe("casey@davidson.edu");
    expect(
      accountApi.confirmPasswordReset.body.safeParse({ ...reset, code: "12345" }).success,
    ).toBe(false);
    expect(accountApi.confirmPasswordReset.response).toBeNull();
    // Legacy accounts may reset too: any address, not only @davidson.edu.
    expect(accountApi.requestPasswordReset.body.safeParse({ email: "a@gmail.com" }).success).toBe(
      true,
    );
    expect(accountApi.testMailbox).toMatchObject({
      method: "GET",
      path: "/api/auth/test-mailbox",
      auth: "public",
    });
  });

  it("fills path parameters", () => {
    expect(buildPath(planApi.updateItem.path, { id: "abc" })).toBe("/api/plan/items/abc");
    expect(buildPath(catalogApi.course.path, { term: "202602", code: "CSC-221" })).toBe(
      "/api/catalog/courses/202602/CSC-221",
    );
    expect(() => buildPath(planApi.updateItem.path)).toThrow(/id/);
  });

  it("parses course slugs in catalog params", () => {
    expect(catalogApi.course.params.parse({ term: "202602", code: "csc-221" })).toEqual({
      term: "202602",
      code: "CSC 221",
    });
    expect(catalogApi.course.params.safeParse({ term: "202602", code: "nope" }).success).toBe(
      false,
    );
  });

  it("validates plan mutations strictly", () => {
    const add = planApi.addItem.body.parse({ termCode: "202602", courseCode: "csc 221" });
    expect(add).toMatchObject({
      courseCode: "CSC 221",
      status: "planned",
      passFail: false,
      source: "catalog",
    });
    expect(planApi.updateItem.body.safeParse({}).success).toBe(false);
    expect(planApi.updateItem.body.safeParse({ title: "x" }).success).toBe(false);
    expect(planApi.updateItem.body.parse({ note: null })).toEqual({ note: null });
  });

  it("enforces the sign-up rules of PLAN §1 in the W3 contract", () => {
    const body = { name: "Casey", email: " Casey@Davidson.EDU ", password: "long enough pw" };
    expect(accountApi.register.body.parse(body).email).toBe("casey@davidson.edu");
    expect(accountApi.register.body.safeParse({ ...body, email: "casey@gmail.com" }).success).toBe(
      false,
    );
    expect(accountApi.register.body.safeParse({ ...body, password: "short" }).success).toBe(false);
    expect(accountApi.register.body.safeParse({ ...body, password: " ".repeat(12) }).success).toBe(
      false,
    );
    expect(accountApi.register.body.safeParse({ ...body, password: "é".repeat(37) }).success).toBe(
      false,
    );
    expect(accountApi.verify.body.safeParse({ code: "12345" }).success).toBe(false);
    expect(profileApi.update.body.safeParse({ email: "x@davidson.edu" }).success).toBe(false);
  });
});
