import { beforeEach, describe, expect, it, vi } from "vitest";
import RmpTeacher from "@/models/RmpTeacher";
import type * as ExternalModule from "@/server/http/external";
import { fetchExternal } from "@/server/http/external";
import * as rmp from "@/server/rmp";
import { instructor } from "./helpers";

// Wrap fetchExternal to prove RMP_ENABLED=false never calls RateMyProfessors.
vi.mock("@/server/http/external", async (importOriginal) => {
  const actual = await importOriginal<typeof ExternalModule>();
  return { ...actual, fetchExternal: vi.fn(actual.fetchExternal) };
});

describe("server/rmp service surface (PLAN §4.1.7, frozen)", () => {
  it("exports exactly getRatings and syncRoster", () => {
    const functions = Object.entries(rmp as Record<string, unknown>)
      .filter(([, value]) => typeof value === "function")
      .map(([key]) => key)
      .sort();
    expect(functions).toEqual(["getRatings", "syncRoster"]);
  });
});

describe("RMP_ENABLED=false", () => {
  beforeEach(() => {
    vi.stubEnv("RMP_ENABLED", "false");
    // No database in this file: touching it would throw.
    vi.stubEnv("MONGODB_URI", "");
    vi.mocked(fetchExternal).mockClear();
  });

  it("syncRoster does nothing: no request, no database, nothing recorded", async () => {
    expect(await rmp.syncRoster()).toEqual({
      ok: false,
      count: 0,
      rejectedOtherSchool: 0,
      error: "RateMyProfessors ratings are turned off (RMP_ENABLED=false).",
    });
    expect(fetchExternal).not.toHaveBeenCalled();
  });

  it("getRatings answers 'disabled' for every instructor (Staff included) without any I/O", async () => {
    const find = vi.spyOn(RmpTeacher, "find");
    const people = [instructor("Fred", "Smith"), instructor("S", "Staff", true)];
    expect(await rmp.getRatings(people, { subject: "ECO" })).toEqual([
      { instructor: people[0], status: "disabled" },
      { instructor: people[1], status: "disabled" },
    ]);
    expect(find).not.toHaveBeenCalled();
    expect(fetchExternal).not.toHaveBeenCalled();
  });
});
