import { expect, test, type APIRequestContext } from "@playwright/test";
import { registerViaApi, SAME_ORIGIN, signIn, uniqueEmail } from "./helpers";

/**
 * AI routes (W6) in the production build with AI_PROVIDER=mock: the gate order with real accounts (unverified →
 * verify with the e-mailed code → consent), a course-about answer and its cache, professor summaries off by
 * default, and the cron job closed without CRON_SECRET. The mock provider answers from the request; the e2e
 * server's fetch guard would fail any real model call. The AI panels themselves are W8/W9a's.
 */

async function latestCode(request: APIRequestContext, email: string): Promise<string> {
  let code: string | null = null;
  await expect
    .poll(async () => {
      const res = await request.get(`/api/auth/test-mailbox?email=${encodeURIComponent(email)}`);
      const { messages } = (await res.json()) as {
        messages: { kind: string; code: string | null }[];
      };
      code = [...messages].reverse().find((m) => m.kind === "verify-email")?.code ?? null;
      return code;
    })
    .toMatch(/^\d{6}$/);
  return code as unknown as string;
}

const COURSE = { termCode: "202602", courseCode: "CSC 221" };

test("the course-about route walks the gate, then answers and caches", async ({
  page,
  request,
}) => {
  const signedOut = await request.post("/api/ai/course-about", {
    data: COURSE,
    headers: SAME_ORIGIN,
  });
  expect(signedOut.status()).toBe(401);
  expect(signedOut.headers()["cache-control"]).toBe("private, no-store");

  const email = uniqueEmail("e2e-ai");
  const password = "ai e2e password 123";
  await registerViaApi(request, { name: "Avery Ai", email, password });
  await signIn(page, email, password);
  const api = page.request;
  const ask = () => api.post("/api/ai/course-about", { data: COURSE, headers: SAME_ORIGIN });

  const unverified = await ask();
  expect(unverified.status()).toBe(403);
  expect(await unverified.json()).toMatchObject({ kind: "unverified" });

  const verified = await api.post("/api/account/verify", {
    data: { code: await latestCode(request, email) },
    headers: SAME_ORIGIN,
  });
  expect(verified.status()).toBe(200);

  const noConsent = await ask();
  expect(noConsent.status()).toBe(403);
  expect(await noConsent.json()).toMatchObject({ kind: "consent_required" });

  const consent = await api.put("/api/profile/ai-consent", {
    data: { adultAttested: true },
    headers: SAME_ORIGIN,
  });
  expect(consent.status()).toBe(200);

  const first = await ask();
  expect(first.status()).toBe(200);
  expect(first.headers()["cache-control"]).toBe("private, no-store");
  const body = (await first.json()) as {
    kind: string;
    cached: boolean;
    servedModel: string;
    data: { about: { summary: string }; provenance: { inputHash: string; promptVersion: string } };
  };
  expect(body).toMatchObject({ kind: "ok", servedModel: "claude-sonnet-5-5" });
  expect(body.data.about.summary).toMatch(/abstract data types/);
  expect(body.data.provenance.promptVersion).toBe("course-about/1");

  const second = await ask();
  expect(await second.json()).toMatchObject({ kind: "ok", cached: true });

  const invalid = await api.post("/api/ai/course-about", {
    data: { ...COURSE, regenerate: true },
    headers: SAME_ORIGIN,
  });
  expect(invalid.status()).toBe(400);

  // Professor summaries are off unless the owner turns RMP_SUMMARIES_ENABLED on.
  const summary = await api.post("/api/ai/professor-summary", {
    data: { ...COURSE, instructor: { first: "Katy", last: "Williams", isStaff: false } },
    headers: SAME_ORIGIN,
  });
  expect(summary.status()).toBe(404);
  expect(await summary.json()).toMatchObject({ kind: "disabled" });

  // A single student's report never hides a shared entry.
  const report = await api.post("/api/ai/report", {
    data: { feature: "course-about", key: body.data.provenance.inputHash, reason: "e2e" },
    headers: SAME_ORIGIN,
  });
  expect(report.status()).toBe(204);
  expect(await (await ask()).json()).toMatchObject({ kind: "ok", cached: true });
});

test("AI cron jobs answer 503 without CRON_SECRET", async ({ request }) => {
  for (const path of ["/api/cron/ai", "/api/cron/ai/professor-summaries"]) {
    const res = await request.get(path, {
      headers: { authorization: "Bearer guess-guess-guess-guess" },
    });
    expect(res.status(), path).toBe(503);
    expect(res.headers()["cache-control"]).toBe("private, no-store");
  }
});
