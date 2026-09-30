import { describe, expect, it } from "vitest";
import { FLAG_ENV_VARS, getFlags } from "@/lib/flags";
import { EnvError } from "@/server/env";

describe("getFlags (PLAN §4.1.14)", () => {
  it("defaults everything on except RMP summaries", () => {
    expect(getFlags({})).toEqual({
      careers: true,
      events: true,
      alumni: true,
      ai: true,
      rmp: true,
      rmpSummaries: false,
    });
  });

  it("reads each flag from its variable", () => {
    expect(
      getFlags({
        FEATURE_CAREERS: "false",
        FEATURE_EVENTS: "0",
        FEATURE_ALUMNI: "off",
        AI_ENABLED: "false",
        RMP_ENABLED: "true",
        RMP_SUMMARIES_ENABLED: "true",
      }),
    ).toEqual({
      careers: false,
      events: false,
      alumni: false,
      ai: false,
      rmp: true,
      rmpSummaries: true,
    });
    expect(Object.keys(FLAG_ENV_VARS).sort()).toEqual(
      ["ai", "alumni", "careers", "events", "rmp", "rmpSummaries"].sort(),
    );
  });

  it("never enables review summaries without ratings", () => {
    expect(getFlags({ RMP_ENABLED: "false", RMP_SUMMARIES_ENABLED: "true" }).rmpSummaries).toBe(
      false,
    );
  });

  it("does not need the rest of the environment, and names a malformed flag", () => {
    expect(() => getFlags({ FEATURE_EVENTS: "sometimes" })).toThrow(EnvError);
    expect(() => getFlags({ FEATURE_EVENTS: "sometimes" })).toThrow(/FEATURE_EVENTS/);
  });
});
