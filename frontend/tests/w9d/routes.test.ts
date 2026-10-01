import type { Session } from "next-auth";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { withCatalogDb } from "../catalog/db";
import { insertStudent, ORIGIN, sessionFor, stubAuthEnv } from "../ai/helpers";
import * as careerPlanRoute from "@/app/api/ai/career-plan/route";
import * as coldEmailRoute from "@/app/api/ai/cold-email/route";
import * as draftsRoute from "@/app/api/plan/drafts/route";
import * as availabilityRoute from "@/app/api/catalog/availability/route";
import { draftSendOutcome } from "@/app/(hub)/careers/[slug]/_components/ai-career-plan";
import { coldEmailAlumni } from "@/app/(hub)/careers/[slug]/_components/ai-panels";
import { filledEmail } from "@/app/(hub)/careers/[slug]/_components/ai-cold-email";
import { aiErrorCopy, aiFailureCopy } from "@/app/(hub)/careers/[slug]/_components/ai-result";
import { titleTermOf } from "@/app/(hub)/careers/[slug]/_components/ai-course-picks";
import { aiApi } from "@/lib/api/ai";
import { catalogApi } from "@/lib/api/catalog";
import { ApiClientError, callApi } from "@/lib/api/client";
import { planApi } from "@/lib/api/plan";
import { STUDENT_NAME_PLACEHOLDER } from "@/lib/types/ai";
import { mockAiRequests, resetMockAi } from "@/server/ai/mock";
import { alumniForCareer } from "@/server/content/alumni";
import { isDefinedRoute } from "@/server/http";

/**
 * The career AI panels' client calls against the REAL route handlers (W6 AI routes with AI_PROVIDER=mock, W5s
 * drafts, W1 availability) in fixtures mode: callApi's fetch is wired to the handlers, so the wire format the
 * panels switch on (AiResult kinds with their statuses, ApiErrorBody for 401/400/404), auth, validation and cache
 * headers are checked end to end — and the student's name never reaches the model.
 */

const auth = vi.hoisted(() => ({ session: null as Session | null }));
vi.mock("next-auth", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  getServerSession: async () => auth.session,
}));
vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  connection: async () => undefined,
}));

withCatalogDb();

type Handler = (
  request: Request,
  context: { params: Promise<Record<string, string>> },
) => Promise<Response>;
const ROUTES: Record<string, Partial<Record<string, Handler>>> = {
  "/api/ai/career-plan": careerPlanRoute as unknown as Record<string, Handler>,
  "/api/ai/cold-email": coldEmailRoute as unknown as Record<string, Handler>,
  "/api/plan/drafts": draftsRoute as unknown as Record<string, Handler>,
  "/api/catalog/availability": availabilityRoute as unknown as Record<string, Handler>,
};

/** Responses seen by the client, for header checks. */
let responses: { path: string; status: number; cacheControl: string | null }[] = [];

beforeEach(() => {
  stubAuthEnv();
  vi.stubEnv("AI_PROVIDER", "mock");
  vi.stubEnv("APP_ORIGIN", ORIGIN);
  responses = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init: RequestInit = {}) => {
      const url = new URL(String(input), ORIGIN);
      const handler = ROUTES[url.pathname]?.[init.method ?? "GET"];
      if (!handler) throw new Error(`no route for ${init.method} ${url.pathname}`);
      // What the browser adds to a same-origin request.
      const headers = new Headers(init.headers);
      headers.set("origin", ORIGIN);
      headers.set("sec-fetch-site", "same-origin");
      const res = await handler(new Request(url, { ...init, headers }), {
        params: Promise.resolve({}),
      });
      responses.push({
        path: url.pathname,
        status: res.status,
        cacheControl: res.headers.get("cache-control"),
      });
      return res;
    }),
  );
});

afterEach(() => {
  auth.session = null;
  resetMockAi();
  vi.unstubAllGlobals();
});

async function signIn(options: Parameters<typeof insertStudent>[0] = {}) {
  const user = await insertStudent(options);
  auth.session = await sessionFor(user);
  return user;
}

const LINKS = { verify: "/verify", consent: "/profile#ai-features", signIn: "/login" };

describe("route modules", () => {
  it("are defineRoute handlers", () => {
    expect(isDefinedRoute(careerPlanRoute.POST)).toBe(true);
    expect(isDefinedRoute(coldEmailRoute.POST)).toBe(true);
    expect(isDefinedRoute(draftsRoute.GET)).toBe(true);
  });
});

describe("career plan through callApi", () => {
  it("signed out: ApiClientError 401 → Sign in", async () => {
    const error = await callApi(aiApi.careerPlan, { body: { careerSlug: "medicine" } }).catch(
      (e: unknown) => e,
    );
    expect(error).toBeInstanceOf(ApiClientError);
    expect((error as ApiClientError).status).toBe(401);
    expect(aiErrorCopy(error, LINKS).next).toMatchObject({ kind: "link", href: "/login" });
    expect(responses[0]!.cacheControl).toBe("private, no-store");
  });

  it("unverified and no-consent accounts get their AiResult kinds (403), not a throw", async () => {
    await signIn({ verified: false });
    const unverified = await callApi(aiApi.careerPlan, { body: { careerSlug: "medicine" } });
    expect(unverified.kind).toBe("unverified");
    expect(responses.at(-1)!.status).toBe(403);
    if (unverified.kind === "ok") throw new Error("unexpected");
    expect(aiFailureCopy(unverified, LINKS).next).toMatchObject({ href: "/verify" });

    await signIn({ consent: false });
    const consent = await callApi(aiApi.careerPlan, { body: { careerSlug: "medicine" } });
    expect(consent.kind).toBe("consent_required");
    if (consent.kind === "ok") throw new Error("unexpected");
    expect(aiFailureCopy(consent, LINKS).next).toMatchObject({ href: "/profile#ai-features" });
  });

  it("a bad slug is a 400 the client throws on", async () => {
    await signIn();
    const error = await callApi(aiApi.careerPlan, {
      body: { careerSlug: "Not A Slug" },
    }).catch((e: unknown) => e);
    expect((error as ApiClientError).status).toBe(400);
  });

  it("ok: the plan, a pending draft the Send button finds in GET /api/plan/drafts, catalog-backed titles", async () => {
    await signIn({ name: "Priya Uniquename" });
    const result = await callApi(aiApi.careerPlan, {
      body: { careerSlug: "software-engineering" },
    });
    if (result.kind !== "ok") throw new Error(`expected ok, got ${result.kind}`);
    expect(responses.at(-1)).toMatchObject({ status: 200, cacheControl: "private, no-store" });
    const { plan, draft } = result.data;
    expect(plan.courses.length).toBeGreaterThan(0);
    expect(draft).not.toBeNull();

    const { drafts } = await callApi(planApi.listDrafts);
    expect(draftSendOutcome(drafts, draft!.id)).toBe("pending");
    expect(responses.at(-1)!.cacheControl).toBe("private, no-store");

    // Each pick resolves to a catalog term the official title can be read from.
    const pick = plan.courses[0]!;
    const { availability } = await callApi(catalogApi.availability, {
      query: { code: pick.courseCode },
    });
    expect(titleTermOf(availability, pick.termCode)).not.toBeNull();

    // The model never saw the student's name.
    expect(JSON.stringify(mockAiRequests().map((r) => r.params))).not.toContain("Priya");

    // A second ask is served from the cache with the same draft.
    const again = await callApi(aiApi.careerPlan, {
      body: { careerSlug: "software-engineering" },
    });
    expect(again).toMatchObject({ kind: "ok", cached: true });
  });
});

describe("cold email through callApi", () => {
  it("a contactable alumnus: a draft with {{studentName}}, filled in the browser only", async () => {
    await signIn({ name: "Priya Uniquename" });
    const [alumnus] = coldEmailAlumni(alumniForCareer("medicine"));
    const result = await callApi(aiApi.coldEmail, {
      body: { alumnusId: alumnus!.id, careerSlug: "medicine" },
    });
    if (result.kind !== "ok") throw new Error(`expected ok, got ${result.kind}`);
    expect(result.data.email.body).toContain(STUDENT_NAME_PLACEHOLDER);
    const filled = filledEmail(result.data.email, "Priya Uniquename");
    expect(filled.body).toContain("Priya Uniquename");
    expect(filled.body).not.toContain(STUDENT_NAME_PLACEHOLDER);
    expect(JSON.stringify(mockAiRequests().map((r) => r.params))).not.toContain("Priya");
    expect(responses.at(-1)!.cacheControl).toBe("private, no-store");
  });

  it("a notable (contactable=false) alumnus is refused with 404, which the panel shows without retry", async () => {
    await signIn();
    const notable = alumniForCareer("medicine").find((a) => !a.contactable)!;
    const error = await callApi(aiApi.coldEmail, {
      body: { alumnusId: notable.id, careerSlug: "medicine" },
    }).catch((e: unknown) => e);
    expect((error as ApiClientError).status).toBe(404);
    expect(aiErrorCopy(error, LINKS).next.kind).toBe("none");
    expect(mockAiRequests()).toHaveLength(0);
  });

  it("rejects extra body fields (strict): the student's name can't be sent along", async () => {
    await signIn();
    const error = await callApi(aiApi.coldEmail, {
      body: { alumnusId: "rahael-borchers", studentName: "x" } as never,
    }).catch((e: unknown) => e);
    expect((error as ApiClientError).status).toBe(400);
  });
});
