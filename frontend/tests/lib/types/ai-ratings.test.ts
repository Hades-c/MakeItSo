import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  AI_FAILURE_KINDS,
  AI_RESULT_STATUS,
  aiResultSchema,
  ColdEmailSchema,
} from "@/lib/types/ai";
import { FeedItemSchema } from "@/lib/types/feeds";
import { InstructorRatingSchema } from "@/lib/types/ratings";

describe("AI results (PLAN §4.1.8)", () => {
  const Result = aiResultSchema(ColdEmailSchema);

  it("is either ok with data and provenance flags, or a failure kind with a message", () => {
    const ok = {
      kind: "ok",
      data: { subject: "Hello", body: "Hi, I'm {{studentName}}" },
      servedModel: "claude-sonnet-5-5",
      fallbackUsed: false,
      cached: true,
    };
    expect(Result.parse(ok)).toEqual(ok);
    for (const kind of AI_FAILURE_KINDS) {
      expect(Result.parse({ kind, message: "x" }).kind).toBe(kind);
      expect(AI_RESULT_STATUS[kind]).toBeGreaterThanOrEqual(400);
    }
    expect(Result.safeParse({ kind: "ok", data: {} }).success).toBe(false);
    expect(Result.safeParse({ kind: "exploded", message: "x" }).success).toBe(false);
    expect(aiResultSchema(z.object({ n: z.number() })).safeParse({ kind: "quota" }).success).toBe(
      false,
    );
  });
});

describe("ratings (PLAN §4.1.7)", () => {
  const instructor = { first: "Fred", last: "Smith", isStaff: false };
  const rmp = {
    legacyId: 9000001,
    avgRating: 4.1,
    numRatings: 41,
    avgDifficulty: 3.2,
    wouldTakeAgainPct: null,
    department: "Economics",
    url: "https://www.ratemyprofessors.com/professor/9000001",
    asOf: "2026-09-30T12:00:00.000Z",
  };

  it("carries RMP data exactly when matched", () => {
    expect(InstructorRatingSchema.parse({ instructor, status: "matched", rmp }).rmp).toEqual(rmp);
    expect(InstructorRatingSchema.safeParse({ instructor, status: "matched" }).success).toBe(false);
    expect(InstructorRatingSchema.safeParse({ instructor, status: "review", rmp }).success).toBe(
      false,
    );
    expect(InstructorRatingSchema.parse({ instructor, status: "unmatched" }).status).toBe(
      "unmatched",
    );
  });
});

describe("feed items (PLAN §4.1.5)", () => {
  const item = {
    id: "wildcatsync:12460064",
    source: "wildcatsync",
    kind: "deadline",
    title: "Watson Fellowship Nomination Application Deadline",
    url: "https://wildcatsync.davidson.edu/event/12460064",
    startsAt: "2026-09-30T19:00:00.000Z",
    endsAt: "2026-09-30T19:01:00.000Z",
    allDay: false,
    location: "Online",
    summaryText: "The Watson Fellowship is a one-year grant.",
    fetchedAt: "2026-09-30T14:38:28.000Z",
  };

  it("accepts text-only https items from feed sources only", () => {
    expect(FeedItemSchema.parse(item)).toEqual(item);
    expect(FeedItemSchema.safeParse({ ...item, url: "http://x.example/" }).success).toBe(false);
    expect(FeedItemSchema.safeParse({ ...item, source: "handshake" }).success).toBe(false);
    expect(FeedItemSchema.safeParse({ ...item, summaryText: "x".repeat(501) }).success).toBe(false);
  });
});
