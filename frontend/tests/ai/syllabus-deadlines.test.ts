import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { startTestDb, type TestDb } from "../helpers/db";
import { insertStudent, stubAuthEnv } from "./helpers";
import { aiGateFailure } from "@/lib/types/ai";
import { aiGateInput } from "@/server/ai";
import {
  cleanSyllabusDeadlines,
  extractSyllabusDeadlines,
  MAX_SYLLABUS_TEXT_CHARS,
} from "@/server/ai/features/syllabus-deadlines";
import { mockAiRequests, resetMockAi, setMockAiScenario } from "@/server/ai/mock";
import { SYSTEM } from "@/server/ai/prompts/syllabus-deadlines";
import { readDataBlocks } from "@/server/ai/blocks";
import { DAILY_GENERATION_QUOTA } from "@/server/ai/config";
import { getDb } from "@/server/db";

/**
 * extractSyllabusDeadlines (PLAN-UX §3 /syllabi, server/ai/features/syllabus-deadlines.ts). Unlike the other W6
 * features, this one has no dedicated /api/ai/* route: it is called from inside the upload route
 * (app/api/syllabi/route.ts, server/syllabi/records.ts uploadSyllabusImpl), so it is tested by calling it
 * directly rather than through a route handler.
 */

let testDb: TestDb;

beforeAll(async () => {
  testDb = await startTestDb();
  await getDb();
});

beforeEach(() => {
  stubAuthEnv();
  vi.stubEnv("AI_PROVIDER", "mock");
});

afterEach(async () => {
  resetMockAi();
  await testDb.clear();
});

afterAll(async () => {
  await testDb.stop();
});

const SYLLABUS_TEXT =
  "CSC 221 Data Structures\nMidterm exam on October 15.\nFinal paper due December 3.";

describe("extractSyllabusDeadlines", () => {
  it("is gated the same way as any other AI feature (disabled, not configured, unverified, consent)", async () => {
    const user = await insertStudent();
    vi.stubEnv("AI_ENABLED", "false");
    expect(aiGateFailure(await aiGateInput(user.id, "syllabus-deadlines"))).toMatchObject({
      kind: "disabled",
    });
    vi.stubEnv("AI_ENABLED", "true");

    const unverified = await insertStudent({ verified: false });
    expect(aiGateFailure(await aiGateInput(unverified.id, "syllabus-deadlines"))).toMatchObject({
      kind: "unverified",
    });

    const notConsented = await insertStudent({ consent: false });
    expect(aiGateFailure(await aiGateInput(notConsented.id, "syllabus-deadlines"))).toMatchObject({
      kind: "consent_required",
    });
  });

  it("extracts deadlines from the syllabus text, sending only the course code, academic year and the text", async () => {
    const user = await insertStudent();
    const result = await extractSyllabusDeadlines(user.id, {
      courseCode: "CSC 221",
      termCode: "202601",
      syllabusText: SYLLABUS_TEXT,
    });
    expect(result.kind).toBe("ok");
    if (result.kind !== "ok") throw new Error("expected ok");
    expect(result.data.deadlines).toEqual([
      { title: "Midterm Exam", dueAt: "2026-10-15" },
      { title: "Final Paper", dueAt: "2026-12-03" },
    ]);

    const params = mockAiRequests()[0]!.params;
    expect(params.system).toEqual([
      { type: "text", text: SYSTEM, cache_control: { type: "ephemeral" } },
    ]);
    expect(params.output_config?.effort).toBe("low");
    const blocks = readDataBlocks(
      (params.messages[0]!.content as { text: string }[]).map((b) => b.text),
    ) as Record<string, unknown>;
    expect(blocks.catalog_data).toEqual({ courseCode: "CSC 221", academicYear: 2026 });
    expect(blocks.untrusted_syllabus).toBe(SYLLABUS_TEXT);
    // Never the student's name, e-mail or id.
    const whole = JSON.stringify(params);
    for (const secret of [user.id, user.email, user.name]) {
      expect(whole, secret).not.toContain(secret);
    }
  });

  it("resolves Spring's bare dates to the term's own calendar year", async () => {
    const user = await insertStudent();
    const result = await extractSyllabusDeadlines(user.id, {
      courseCode: "ENG 260",
      termCode: "202602", // Spring 2027
      syllabusText: "Final exam on May 10.",
    });
    expect(result.kind === "ok" && result.data.deadlines).toEqual([
      { title: "Final Exam", dueAt: "2027-05-10" },
    ]);
  });

  it("truncates a very long syllabus before sending it to the model", async () => {
    const user = await insertStudent();
    const long = "x".repeat(MAX_SYLLABUS_TEXT_CHARS + 5_000);
    await extractSyllabusDeadlines(user.id, {
      courseCode: "CSC 221",
      termCode: "202601",
      syllabusText: long,
    });
    const blocks = readDataBlocks(
      (mockAiRequests()[0]!.params.messages[0]!.content as { text: string }[]).map((b) => b.text),
    ) as Record<string, unknown>;
    expect((blocks.untrusted_syllabus as string).length).toBeLessThanOrEqual(
      MAX_SYLLABUS_TEXT_CHARS,
    );
  });

  it("spends a generation and counts against the daily quota like any other feature", async () => {
    const user = await insertStudent();
    for (let i = 0; i < DAILY_GENERATION_QUOTA; i++) {
      const result = await extractSyllabusDeadlines(user.id, {
        courseCode: "CSC 221",
        termCode: "202601",
        syllabusText: `${SYLLABUS_TEXT} ${i}`,
      });
      expect(result.kind).toBe("ok");
    }
    const result = await extractSyllabusDeadlines(user.id, {
      courseCode: "CSC 221",
      termCode: "202601",
      syllabusText: SYLLABUS_TEXT,
    });
    expect(result.kind).toBe("quota");
  });

  it("passes model failures through, refunding the spent quota (nothing was answered)", async () => {
    const user = await insertStudent();
    setMockAiScenario("timeout", { times: 1 });
    const result = await extractSyllabusDeadlines(user.id, {
      courseCode: "CSC 221",
      termCode: "202601",
      syllabusText: SYLLABUS_TEXT,
    });
    expect(result.kind).toBe("timeout");
    // The failed attempt did not count: a full quota's worth of further calls all succeed.
    for (let i = 0; i < DAILY_GENERATION_QUOTA; i++) {
      const ok = await extractSyllabusDeadlines(user.id, {
        courseCode: "CSC 221",
        termCode: "202601",
        syllabusText: `${SYLLABUS_TEXT} ${i}`,
      });
      expect(ok.kind).toBe("ok");
    }
  });

  it("rejects a term code that is not a real term", async () => {
    const user = await insertStudent();
    await expect(
      extractSyllabusDeadlines(user.id, {
        courseCode: "CSC 221",
        termCode: "not-a-term",
        syllabusText: SYLLABUS_TEXT,
      }),
    ).rejects.toMatchObject({ status: 400 });
  });
});

describe("cleanSyllabusDeadlines", () => {
  it("cleans titles, and drops a deadline with no usable title", () => {
    expect(
      cleanSyllabusDeadlines(
        [
          { title: "  Midterm   exam  ", dueAt: "2026-10-15" },
          { title: "   ", dueAt: "2026-10-16" },
        ],
        2026,
      ),
    ).toEqual([{ title: "Midterm exam", dueAt: "2026-10-15" }]);
  });

  it("drops a date far outside the term's academic year", () => {
    expect(
      cleanSyllabusDeadlines(
        [
          { title: "Midterm", dueAt: "2026-10-15" },
          { title: "Decades off", dueAt: "1980-01-01" },
          { title: "Not a date", dueAt: "not-a-date" },
        ],
        2026,
      ),
    ).toEqual([{ title: "Midterm", dueAt: "2026-10-15" }]);
  });

  it("de-duplicates the same title and date", () => {
    expect(
      cleanSyllabusDeadlines(
        [
          { title: "Midterm exam", dueAt: "2026-10-15" },
          { title: "midterm exam", dueAt: "2026-10-15" },
          { title: "Midterm exam", dueAt: "2026-10-16" },
        ],
        2026,
      ),
    ).toEqual([
      { title: "Midterm exam", dueAt: "2026-10-15" },
      { title: "Midterm exam", dueAt: "2026-10-16" },
    ]);
  });

  it("keeps at most the 50 deadlines one review can save", () => {
    const many = Array.from({ length: 80 }, (_, i) => ({
      title: `Problem set ${i + 1}`,
      dueAt: `2026-${String(9 + Math.floor(i / 28)).padStart(2, "0")}-${String((i % 28) + 1).padStart(2, "0")}`,
    }));
    const kept = cleanSyllabusDeadlines(many, 2026);
    expect(kept).toHaveLength(50);
    expect(kept[0]?.title).toBe("Problem set 1");
  });
});
