import { beforeEach, describe, expect, it, vi } from "vitest";
import { withCatalogDb } from "../catalog/db";
import * as cronRoute from "@/app/api/cron/ai/route";
import AiCache from "@/models/AiCache";
import AiUsage from "@/models/AiUsage";
import RateLimit from "@/models/RateLimit";
import { courseAboutFor } from "@/server/ai/features/course-about";
import { mockAiRequests, resetMockAi, setMockAiScenario } from "@/server/ai/mock";
import { pregenerateCourseAbout, PregenerateResultSchema } from "@/server/ai/pregenerate";
import { usageSubject } from "@/server/ai/usage";
import { getCourse } from "@/server/catalog";
import { isDefinedRoute } from "@/server/http";

/** The course-about pre-generation job for the registration term (GET /api/cron/ai). */

withCatalogDb();

const CRON_SECRET = "test-cron-secret-0123456789";

beforeEach(() => {
  vi.stubEnv("AI_PROVIDER", "mock");
  resetMockAi();
});

const cron = (headers: Record<string, string> = {}) =>
  cronRoute.GET(new Request("http://localhost/api/cron/ai", { headers }));

describe("GET /api/cron/ai", () => {
  it("is a cron defineRoute handler with maxDuration 120", () => {
    expect(isDefinedRoute(cronRoute.GET)).toBe(true);
    expect(cronRoute.maxDuration).toBe(120);
  });

  it("answers 503 without CRON_SECRET and 401 with a wrong bearer", async () => {
    expect((await cron({ authorization: "Bearer whatever-whatever" })).status).toBe(503);
    vi.stubEnv("CRON_SECRET", CRON_SECRET);
    expect((await cron()).status).toBe(401);
    expect((await cron({ authorization: "Bearer wrong-secret-0123456789" })).status).toBe(401);
    expect(mockAiRequests()).toHaveLength(0);
  });

  it("does nothing while AI is off or not configured", async () => {
    vi.stubEnv("CRON_SECRET", CRON_SECRET);
    vi.stubEnv("AI_ENABLED", "false");
    const off = PregenerateResultSchema.parse(
      await (await cron({ authorization: `Bearer ${CRON_SECRET}` })).json(),
    );
    expect(off).toMatchObject({ skipped: "disabled", courses: 0, generated: 0 });
    vi.stubEnv("AI_ENABLED", "true");
    vi.stubEnv("AI_PROVIDER", "anthropic");
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    expect(await pregenerateCourseAbout()).toMatchObject({ skipped: "not_configured" });
    expect(mockAiRequests()).toHaveLength(0);
  });
});

describe("pregenerateCourseAbout", () => {
  it("fills the registration term's entries under the system subject, then finds them cached", async () => {
    vi.stubEnv("CRON_SECRET", CRON_SECRET);
    const res = await cron({ authorization: `Bearer ${CRON_SECRET}` });
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("private, no-store");
    const first = PregenerateResultSchema.parse(await res.json());
    expect(first).toMatchObject({ skipped: null, term: "202602", failed: 0, stoppedEarly: null });
    expect(first.courses).toBeGreaterThan(200);
    expect(first.noDescription).toBeGreaterThan(0);
    // Cross-listed or re-listed courses with the same official text share one entry.
    expect(first.generated + first.cached + first.noDescription).toBe(first.courses);
    expect(await AiCache.countDocuments({ feature: "course-about", status: "ok" })).toBe(
      first.generated,
    );

    const usage = await AiUsage.find().lean();
    expect(usage).toHaveLength(1);
    expect(usage[0]!.userId.equals(usageSubject(null))).toBe(true);
    expect(await RateLimit.countDocuments()).toBe(0);

    const second = await pregenerateCourseAbout();
    expect(second).toMatchObject({ generated: 0, cached: first.generated + first.cached });

    // A student's view is now a cache hit.
    const course = await getCourse("202602", "CSC 221");
    const view = await courseAboutFor(course!, { userId: "64b0000000000000000000a1" });
    expect(view).toMatchObject({ kind: "ok", cached: true });
  });

  it("stops at the time budget and continues on the next run", async () => {
    const stopped = await pregenerateCourseAbout({ timeBudgetMs: -1 });
    expect(stopped).toMatchObject({ stoppedEarly: "deadline", generated: 0 });
    expect(mockAiRequests()).toHaveLength(0);
  });

  it("stops at the daily token budget", async () => {
    vi.stubEnv("AI_DAILY_TOKEN_BUDGET", "1");
    const result = await pregenerateCourseAbout({ concurrency: 1 });
    expect(result).toMatchObject({ stoppedEarly: "budget", generated: 1 });
  });

  it("counts model failures and goes on", async () => {
    setMockAiScenario("timeout", { times: 2 });
    const result = await pregenerateCourseAbout({ concurrency: 1 });
    expect(result.failed).toBe(2);
    expect(result.stoppedEarly).toBeNull();
  });
});
