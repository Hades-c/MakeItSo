import { describe, expect, it } from "vitest";
import { checkMoodleFeedUrl } from "@/lib/moodle";

/** lib/moodle.ts checkMoodleFeedUrl: Davidson's Moodle token calendar export, exactly, and nothing else. */

const TOKEN = "0123456789abcdef0123456789abcdef01234567";
const GOOD = `https://moodle.davidson.edu/calendar/export_execute.php?userid=4242&authtoken=${TOKEN}&preset_what=all&preset_time=recentupcoming`;

describe("checkMoodleFeedUrl", () => {
  it("accepts the URL Moodle's Get calendar URL gives, rebuilt in a fixed order", () => {
    expect(checkMoodleFeedUrl(GOOD)).toEqual({ ok: true, url: GOOD });
    expect(
      checkMoodleFeedUrl(
        `  https://MOODLE.davidson.edu/calendar/export_execute.php?preset_time=recentupcoming&preset_what=courses&authtoken=${TOKEN.toUpperCase()}&userid=4242\n`,
      ),
    ).toEqual({ ok: true, url: GOOD.replace("preset_what=all", "preset_what=courses") });
  });

  it.each([
    ["empty", ""],
    ["not a URL", "moodle calendar"],
    ["a space inside", GOOD.replace("userid=4242", "userid= 4242")],
    ["http", GOOD.replace("https://", "http://")],
    ["another host", GOOD.replace("moodle.davidson.edu", "moodle.example.edu")],
    ["a look-alike host", GOOD.replace("moodle.davidson.edu", "moodle.davidson.edu.evil.test")],
    ["a subdomain", GOOD.replace("moodle.davidson.edu", "x.moodle.davidson.edu")],
    ["a trailing-dot host", GOOD.replace("moodle.davidson.edu", "moodle.davidson.edu.")],
    ["a port", GOOD.replace("moodle.davidson.edu", "moodle.davidson.edu:8443")],
    ["credentials", GOOD.replace("https://", "https://user:pass@")],
    ["another path", GOOD.replace("export_execute.php", "export.php")],
    ["a path with a trailing slash", GOOD.replace("export_execute.php", "export_execute.php/")],
    ["a fragment", `${GOOD}#top`],
    ["an extra parameter", `${GOOD}&redirect=https://example.com`],
    ["a repeated parameter", `${GOOD}&userid=1`],
    ["HTML-escaped ampersands", GOOD.replaceAll("&", "&amp;")],
    ["no userid", GOOD.replace("userid=4242&", "")],
    ["a non-numeric userid", GOOD.replace("userid=4242", "userid=abc")],
    ["no authtoken", GOOD.replace(`authtoken=${TOKEN}&`, "")],
    ["a short authtoken", GOOD.replace(TOKEN, "abc123")],
    ["a non-hex authtoken", GOOD.replace(TOKEN, "z".repeat(40))],
    ["no preset_what", GOOD.replace("preset_what=all&", "")],
    ["user events only", GOOD.replace("preset_what=all", "preset_what=user")],
    ["no preset_time", GOOD.replace("&preset_time=recentupcoming", "")],
    ["this week only", GOOD.replace("recentupcoming", "weeknow")],
    ["a custom range", GOOD.replace("recentupcoming", "custom")],
    ["a very long string", `${GOOD}${"a".repeat(600)}`],
  ])("rejects %s with words saying what to do", (_case, input) => {
    const result = checkMoodleFeedUrl(input);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.problem).toMatch(/Moodle|link/);
  });

  it("names the Moodle setting to change for the wrong choices", () => {
    expect(checkMoodleFeedUrl(GOOD.replace("recentupcoming", "weeknow"))).toMatchObject({
      problem: expect.stringMatching(/Recent and next 60 days/),
    });
    expect(checkMoodleFeedUrl(GOOD.replace("preset_what=all", "preset_what=user"))).toMatchObject({
      problem: expect.stringMatching(/All courses/),
    });
  });
});
