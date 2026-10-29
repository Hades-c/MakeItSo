/**
 * Moodle calendar import, the isomorphic part (no zod): the feed URL rules, the sync problems in words and the
 * lazy-sync age. The rest is server/moodle.
 *
 * The Moodle calendar feed a student connects on /syllabi (Moodle → Calendar → Import or export calendars → Export
 * calendar → Get calendar URL). The connect form checks a pasted URL with checkMoodleFeedUrl before sending, and
 * the server checks it again (server/moodle) before storing or fetching anything.
 *
 * Only Davidson's Moodle and only its token calendar export are accepted, exactly:
 *   https://moodle.davidson.edu/calendar/export_execute.php?userid=<digits>&authtoken=<hex>
 *     &preset_what=all|courses&preset_time=recentupcoming
 * No other host, port, path, credentials, fragment or query parameter, and each parameter once. The feed is
 * public to anyone holding its URL (the authtoken is a capability that reads the student's Moodle calendar), so
 * the server stores it encrypted and never shows it back.
 */

export const MOODLE_HOST = "moodle.davidson.edu";
export const MOODLE_EXPORT_PATH = "/calendar/export_execute.php";

/** "Events from": every course, or courses only (the other choices leave out assignment due dates). */
export const MOODLE_PRESET_WHAT = ["all", "courses"] as const;
/** "For": "Recent and next 60 days", the only window the sync's removal rule is written for. */
export const MOODLE_PRESET_TIME = ["recentupcoming"] as const;

const PARAMS = ["userid", "authtoken", "preset_what", "preset_time"] as const;

export type MoodleUrlCheck = { ok: true; url: string } | { ok: false; problem: string };

const PROBLEMS = {
  notUrl:
    "That is not a link. In Moodle, choose Get calendar URL and copy the whole address it shows.",
  notMoodle: `That is not a Davidson Moodle calendar link: it must start with https://${MOODLE_HOST}${MOODLE_EXPORT_PATH}.`,
  params:
    "That link is missing part of the calendar address (userid and authtoken). Copy the whole URL Moodle shows.",
  extra:
    "That link has something extra in it. Copy the calendar URL exactly as Moodle shows it, and nothing else.",
  presetWhat: 'In Moodle, set "Events from" to All courses (or Courses), then get the URL again.',
  presetTime: 'In Moodle, set the time to "Recent and next 60 days", then get the URL again.',
} as const;

/**
 * Check a pasted Moodle calendar URL; on success, the same URL rebuilt in a fixed parameter order (what is stored
 * and fetched). Every failure says what to do in words.
 */
export function checkMoodleFeedUrl(input: string): MoodleUrlCheck {
  const raw = input.trim();
  if (!raw || raw.length > 600 || /\s/.test(raw)) return { ok: false, problem: PROBLEMS.notUrl };
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return { ok: false, problem: PROBLEMS.notUrl };
  }
  if (
    url.protocol !== "https:" ||
    url.hostname !== MOODLE_HOST ||
    url.port !== "" ||
    url.username !== "" ||
    url.password !== "" ||
    url.pathname !== MOODLE_EXPORT_PATH
  ) {
    return { ok: false, problem: PROBLEMS.notMoodle };
  }
  if (url.hash !== "") return { ok: false, problem: PROBLEMS.extra };

  const keys = [...url.searchParams.keys()];
  if (keys.some((key) => !(PARAMS as readonly string[]).includes(key))) {
    return { ok: false, problem: PROBLEMS.extra };
  }
  if (new Set(keys).size !== keys.length) return { ok: false, problem: PROBLEMS.extra };

  const userid = url.searchParams.get("userid") ?? "";
  const authtoken = url.searchParams.get("authtoken") ?? "";
  if (!/^[1-9]\d{0,9}$/.test(userid) || !/^[0-9a-f]{32,64}$/i.test(authtoken)) {
    return { ok: false, problem: PROBLEMS.params };
  }
  const what = url.searchParams.get("preset_what");
  if (!(MOODLE_PRESET_WHAT as readonly (string | null)[]).includes(what)) {
    return { ok: false, problem: PROBLEMS.presetWhat };
  }
  const time = url.searchParams.get("preset_time");
  if (!(MOODLE_PRESET_TIME as readonly (string | null)[]).includes(time)) {
    return { ok: false, problem: PROBLEMS.presetTime };
  }

  const canonical = new URL(`https://${MOODLE_HOST}${MOODLE_EXPORT_PATH}`);
  canonical.searchParams.set("userid", userid);
  canonical.searchParams.set("authtoken", authtoken.toLowerCase());
  canonical.searchParams.set("preset_what", what!);
  canonical.searchParams.set("preset_time", time!);
  return { ok: true, url: canonical.toString() };
}

/** Why the last sync did not work (models/MoodleConnection.ts `problem`). */
export const MOODLE_PROBLEMS = ["auth", "unreachable", "invalid", "key_changed"] as const;
export type MoodleProblem = (typeof MOODLE_PROBLEMS)[number];

/** What each problem means for the student, and what to do. */
export const MOODLE_PROBLEM_MESSAGES: Readonly<Record<MoodleProblem, string>> = {
  auth: "Moodle no longer accepts this calendar link (a link can stop working, for example after a password change). Get a new calendar URL in Moodle and connect again.",
  unreachable:
    "Moodle did not answer the last time MakeItSo checked. Your imported deadlines are kept, and MakeItSo tries again later.",
  invalid:
    "Moodle sent something MakeItSo could not read as a calendar. Your imported deadlines are kept. Try again later, or get a new calendar URL.",
  key_changed:
    "MakeItSo can no longer read your saved Moodle link (its encryption key changed). Paste your calendar URL again to reconnect.",
};

/** How old the last sync attempt may be before opening Today or /syllabi syncs again in the background. */
export const MOODLE_SYNC_MAX_AGE_MS = 6 * 60 * 60_000;
