import mongoose from "mongoose";
import { describe, expect, it, vi } from "vitest";
import { insertStudent, withPlanDb } from "../plan/helpers";
import { AddPlanItemBodySchema, type AddPlanItemBody } from "@/lib/api/plan";
import User from "@/models/User";
import { syncFeeds } from "@/server/feeds";
import { MissingFixtureError } from "@/server/http/fixtures";
import { addDeadline, addItem } from "@/server/plan";
import {
  attempt,
  buildAgenda,
  buildDueSoon,
  contentDeadlines,
  degreeMapTerms,
  dueSoonRange,
  loadCampusEvents,
  loadFeedItems,
  loadPlan,
  loadProfile,
  loadProgress,
  loadSchedule,
  loadTerms,
  nextClassDay,
  scheduleTermLabel,
  standingOf,
  stripCount,
  stripDays,
  todaySummary,
  type SummaryParts,
} from "@/server/today";

/**
 * Today's loaders against the fixture catalog and an in-memory database (the fixtures day: Wed 2026-09-30 12:00
 * ET): a first-year with three Fall 2026 sections (CSC 221 A MWF 10:30, ECO 232 A MWF 11:30, ENV 237 A MW 14:30),
 * the day summary built from what the server loaded, the strip, Due soon, the degree map and the campus feeds.
 */

withPlanDb();

const NOON = new Date("2026-09-30T12:00:00-04:00");

const add = (userId: string, body: AddPlanItemBody) =>
  addItem(userId, AddPlanItemBodySchema.parse({ status: "in-progress", ...body }));

async function onboard(userId: string): Promise<void> {
  await User.collection.updateOne(
    { _id: new mongoose.Types.ObjectId(userId) },
    { $set: { onboardedAt: new Date("2026-09-01T12:00:00Z") } },
  );
}

/** The mockup student: class of 2030, started Fall 2026, three sections chosen, one course planned for spring. */
async function mockupStudent(): Promise<string> {
  const user = await insertStudent({ graduationYear: 2030, firstTerm: "202601" });
  await onboard(user);
  await add(user, { termCode: "202601", courseCode: "CSC 221", crn: "10144" });
  await add(user, { termCode: "202601", courseCode: "ECO 232", crn: "10181" });
  await add(user, { termCode: "202601", courseCode: "ENV 237", crn: "10230" });
  await add(user, { termCode: "202602", courseCode: "HIS 357", status: "planned" });
  return user;
}

async function parts(user: string, at: Date, feeds = false): Promise<SummaryParts> {
  const day = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(at);
  const [profile, terms, schedule, plan] = await Promise.all([
    loadProfile(user),
    loadTerms(),
    loadSchedule(user, day),
    loadPlan(user),
  ]);
  const feedItems = feeds ? await loadFeedItems(day, day) : null;
  return {
    now: at,
    onboarded: profile.ok ? profile.value.onboardedAt !== null : true,
    standing: standingOf(profile),
    schedule: schedule.ok ? schedule.value : null,
    termLabel: scheduleTermLabel(schedule, terms),
    studentDeadlines: plan.ok ? plan.value.deadlines : [],
    feedItems: feedItems?.ok ? feedItems.value : [],
  };
}

describe("the day summary from the server's data", () => {
  it("is the mockup student's Wednesday at noon", async () => {
    const user = await mockupStudent();
    const summary = todaySummary(await parts(user, NOON));
    expect(summary.sentence).toBe(
      "You're in ECO 232 until 12:20 PM, then one more class, and nothing is due in the next three days.",
    );
    expect(summary).toMatchObject({ classesToday: 3, classesLeft: 2 });
  });

  it("names the student's own deadline", async () => {
    const user = await mockupStudent();
    await addDeadline(user, {
      title: "Problem set",
      courseCode: "CSC 221",
      dueAt: "2026-10-01T23:59:00-04:00",
    });
    expect(todaySummary(await parts(user, NOON)).sentence).toBe(
      "You're in ECO 232 until 12:20 PM, then one more class, and Problem set (CSC 221) is due tomorrow at 11:59 PM.",
    );
  });

  it("counts the seniors' minor declaration deadline only for a senior", async () => {
    const senior = await insertStudent({ graduationYear: 2027, firstTerm: "202301" });
    await onboard(senior);
    await add(senior, { termCode: "202601", courseCode: "CSC 121", crn: "10141" }); // MWF 09:30
    expect(todaySummary(await parts(senior, NOON)).sentence).toBe(
      "Classes are done for today, and Minor Declaration Deadline for Seniors is due tomorrow.",
    );
  });

  it("adds the campus events later today once the feeds are stored", async () => {
    const user = await mockupStudent();
    await syncFeeds();
    const p = await parts(user, new Date("2026-09-30T16:00:00-04:00"), true);
    expect(p.feedItems.length).toBeGreaterThan(0);
    expect(todaySummary(p).sentence).toMatch(
      /^Classes are done for today, and (?:.+ is at|\w+ campus events later today, starting at) \d{1,2}:\d{2} PM\.$/,
    );
  });

  it("says Fall Break on Fall Break and the weekend on a Saturday", async () => {
    const user = await mockupStudent();
    expect(todaySummary(await parts(user, new Date("2026-09-21T11:00:00-04:00"))).sentence).toBe(
      "No classes today for Fall Break and nothing due in the next three days.",
    );
    expect(todaySummary(await parts(user, new Date("2026-10-03T11:00:00-04:00"))).sentence).toBe(
      "No classes this weekend and nothing due in the next three days.",
    );
  });

  it("names WebTree opening on Oct 12", async () => {
    const user = await mockupStudent();
    expect(todaySummary(await parts(user, new Date("2026-10-12T06:30:00-04:00"))).sentence).toBe(
      "Three classes today, starting with CSC 221 at 10:30 AM, and WebTree opens today at 7:00 AM.",
    );
  });

  it("asks to add sections when none are chosen, and to finish setup before onboarding", async () => {
    const noSections = await insertStudent({ graduationYear: 2030, firstTerm: "202601" });
    await onboard(noSections);
    await add(noSections, { termCode: "202601", courseCode: "CSC 221" });
    expect(todaySummary(await parts(noSections, NOON)).sentence).toBe(
      "No Fall 2026 class sections in your plan yet and nothing due in the next three days.",
    );

    const fresh = await insertStudent({ graduationYear: 2030 });
    expect(todaySummary(await parts(fresh, NOON)).sentence).toBe(
      "Finish setting up MakeItSo to see your classes, deadlines and campus events here.",
    );
  });
});

describe("the panels' data", () => {
  it("builds the timeline, the next class day and the strip", async () => {
    const user = await mockupStudent();
    const schedule = await loadSchedule(user, "2026-09-30");
    expect(schedule.ok).toBe(true);
    if (!schedule.ok) return;
    const agenda = buildAgenda({
      day: "2026-09-30",
      schedule: schedule.value,
      studentDeadlines: [],
      contentDeadlines: contentDeadlines("2026-09-30", "2026-09-30"),
      feedItems: [],
      now: NOON,
    });
    expect(agenda.items.map((i) => `${i.code} ${i.start}-${i.end} ${i.location}`)).toEqual([
      "CSC 221 10:30-11:20 Watson Life Sciences Building 132",
      "ECO 232 11:30-12:20 Watson Life Sciences Building 243",
      "ENV 237 14:30-15:45 Watson Life Sciences Building 247",
    ]);
    expect(agenda).toMatchObject({ startHour: 9, endHour: 16 });

    // Thursday has no class for this student; Friday has CSC 221 and ECO 232.
    const next = await nextClassDay("2026-09-30", (d) => loadSchedule(user, d));
    expect(next?.day).toBe("2026-10-02");
    expect(next?.schedule.entries[0]).toMatchObject({ courseCode: "CSC 221", start: "10:30" });

    const counts = await Promise.all(
      stripDays("2026-09-30").map(async (day) => {
        const loaded = await loadSchedule(user, day);
        return stripCount({ day, schedule: loaded.ok ? loaded.value : null }, [], "first-year");
      }),
    );
    expect(counts).toEqual([3, 0, 3, 0, 2]);
  });

  it("has no next class day for a student without sections", async () => {
    const user = await insertStudent({ graduationYear: 2030 });
    expect(await nextClassDay("2026-09-30", (d) => loadSchedule(user, d))).toBeNull();
  });

  it("lists Due soon with the WebTree window and the student's own deadline", async () => {
    const user = await mockupStudent();
    await addDeadline(user, { title: "Essay", dueAt: "2026-10-05T17:00:00-04:00" });
    const [plan, profile] = await Promise.all([loadPlan(user), loadProfile(user)]);
    expect(plan.ok && profile.ok).toBe(true);
    if (!plan.ok) return;
    const { from, to } = dueSoonRange(NOON);
    const items = buildDueSoon({
      now: NOON,
      standing: standingOf(profile),
      contentDeadlines: contentDeadlines(from, to),
      studentDeadlines: plan.value.deadlines,
    });
    expect(standingOf(profile)).toBe("first-year");
    expect(items.map((i) => i.id)).toContain("calendar:f26-webtree-spring27");
    expect(items.find((i) => i.kind === "student")).toMatchObject({
      title: "Essay",
      day: "2026-10-05",
      source: "my-plan",
    });
  });

  it("maps degree progress: four Fall 2026 credits under way, one planned", async () => {
    const user = await mockupStudent();
    const [progress, plan, profile, terms] = await Promise.all([
      loadProgress(user),
      loadPlan(user),
      loadProfile(user),
      loadTerms(),
    ]);
    expect(progress.ok && plan.ok && profile.ok && terms.ok).toBe(true);
    if (!progress.ok || !plan.ok || !profile.ok || !terms.ok) return;
    expect(progress.value).toMatchObject({ creditsDone: 0, creditsPlanned: 4, required: 32 });
    expect(terms.value).toMatchObject({ current: "202601", registration: "202602" });
    const map = degreeMapTerms({
      items: plan.value.items,
      firstTerm: "202601",
      graduationYear: profile.value.graduationYear,
      currentTerm: terms.value.current,
    });
    expect(map[0]).toMatchObject({ termCode: "202601", isCurrent: true });
    expect(map[0]?.slots.map((s) => `${s.status} ${s.code}`)).toEqual([
      "in-progress CSC 221",
      "in-progress ECO 232",
      "in-progress ENV 237",
    ]);
    expect(map[1]?.slots).toEqual([{ status: "planned", code: "HIS 357", credits: 1 }]);
    expect(map[map.length - 1]?.termCode).toBe("202902");
  });

  it("reads this week's campus events from the stored feeds", async () => {
    await syncFeeds();
    const events = await loadCampusEvents(NOON.toISOString(), 7, 5);
    expect(events.ok).toBe(true);
    if (!events.ok) return;
    expect(events.value.length).toBeGreaterThan(0);
    expect(events.value.length).toBeLessThanOrEqual(5);
    for (const item of events.value) {
      expect(item.kind).toBe("event");
      expect(item.url).toMatch(/^https:\/\//);
    }
  });
});

describe("degrading instead of failing", () => {
  it("turns a failure into { ok: false } and logs it", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    expect(
      await attempt("a broken source", async () => {
        throw new Error("boom");
      }),
    ).toEqual({ ok: false });
    expect(log).toHaveBeenCalledWith("[today] could not load a broken source:", expect.any(Error));
  });

  it("never hides a missing test fixture", async () => {
    await expect(
      attempt("fixtures", async () => {
        throw new MissingFixtureError("course-schedule", "GET", "https://example.invalid/");
      }),
    ).rejects.toBeInstanceOf(MissingFixtureError);
  });

  it("reports an unknown account's profile and a bad date as unavailable", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const ghost = new mongoose.Types.ObjectId().toHexString();
    expect(await loadProfile(ghost)).toEqual({ ok: false });
    expect(await loadSchedule(ghost, "2026-02-30")).toEqual({ ok: false });
  });
});
