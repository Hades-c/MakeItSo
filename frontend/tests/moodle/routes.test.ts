import mongoose from "mongoose";
import type { Session } from "next-auth";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { sessionFor, stubAuthEnv } from "../w3/helpers";
import { insertStudent, withPlanDb } from "../plan/helpers";
import { DELETE, GET, PUT } from "@/app/api/moodle/route";
import { POST as SYNC } from "@/app/api/moodle/sync/route";
import { moodleApi } from "@/lib/api/moodle";
import { isMoodleConnected } from "@/server/moodle";
import { MOODLE_SYNCS_PER_HOUR } from "@/server/moodle/records";

/**
 * app/api/moodle/**: signed-in only (401), the app Origin on every change (403), the flag (404 while off, except
 * disconnect), each student's own connection only, the hourly sync limit (429), and no feed URL in any answer.
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

withPlanDb({ catalog: false });

beforeEach(() => {
  auth.session = null;
  stubAuthEnv();
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
});

afterEach(async () => {
  vi.restoreAllMocks();
  await mongoose.connection.db?.collection("moodleconnections").deleteMany({});
});

const ORIGIN = "http://localhost";
const URL_GOOD =
  "https://moodle.davidson.edu/calendar/export_execute.php?userid=4242&authtoken=0123456789abcdef0123456789abcdef01234567&preset_what=all&preset_time=recentupcoming";

type Handler = (request: Request) => Promise<Response>;

function call(
  handler: Handler,
  method: string,
  path: string,
  { body, origin = true }: { body?: unknown; origin?: boolean } = {},
): Promise<Response> {
  const headers: Record<string, string> = {};
  if (origin) headers.origin = ORIGIN;
  if (body !== undefined) headers["content-type"] = "application/json";
  return handler(
    new Request(`${ORIGIN}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
  );
}

async function signIn(): Promise<string> {
  const id = await insertStudent();
  auth.session = await sessionFor({ id, email: "x@davidson.edu", name: "Sam Student" });
  return id;
}

async function answer(res: Response, status: number): Promise<unknown> {
  expect(res.headers.get("cache-control")).toBe("private, no-store");
  expect(res.status).toBe(status);
  const text = await res.text();
  expect(text).not.toMatch(/authtoken=|[0-9a-f]{40}/);
  return text ? JSON.parse(text) : null;
}

const ROUTES: [string, Handler, string, string, unknown?][] = [
  ["status", GET, "GET", "/api/moodle"],
  ["connect", PUT, "PUT", "/api/moodle", { url: URL_GOOD }],
  ["sync", SYNC, "POST", "/api/moodle/sync"],
  ["disconnect", DELETE, "DELETE", "/api/moodle?removeDeadlines=true"],
];

describe("app/api/moodle", () => {
  it.each(ROUTES)("%s: 401 signed out", async (_name, handler, method, path, body) => {
    const res = await call(handler, method, path, { body });
    expect(((await answer(res, 401)) as { error: { code: string } }).error.code).toBe(
      "unauthorized",
    );
  });

  it.each(ROUTES.filter(([, , method]) => method !== "GET"))(
    "%s: 403 without the app's Origin",
    async (_name, handler, method, path, body) => {
      await signIn();
      const res = await call(handler, method, path, { body, origin: false });
      await answer(res, 403);
    },
  );

  it("connects, reports and syncs the student's own feed, never echoing the URL", async () => {
    await signIn();
    const connected = moodleApi.connect.response.parse(
      await answer(await call(PUT, "PUT", "/api/moodle", { body: { url: URL_GOOD } }), 200),
    );
    expect(connected).toMatchObject({ connected: true, problem: null });
    expect(connected.deadlines.length).toBeGreaterThan(0);
    moodleApi.status.response.parse(await answer(await call(GET, "GET", "/api/moodle"), 200));
    moodleApi.sync.response.parse(await answer(await call(SYNC, "POST", "/api/moodle/sync"), 200));
  });

  it("answers 400 with what to do for a link that is not Moodle's", async () => {
    await signIn();
    const res = await call(PUT, "PUT", "/api/moodle", {
      body: { url: "https://example.com/calendar.ics" },
    });
    const body = (await answer(res, 400)) as { error: { message: string } };
    expect(body.error.message).toMatch(/Davidson Moodle calendar link/);
  });

  it("shows and changes only the signed-in student's connection", async () => {
    const a = await signIn();
    await answer(await call(PUT, "PUT", "/api/moodle", { body: { url: URL_GOOD } }), 200);
    await signIn();
    expect(await answer(await call(GET, "GET", "/api/moodle"), 200)).toMatchObject({
      connected: false,
      deadlines: [],
    });
    expect(
      await answer(await call(DELETE, "DELETE", "/api/moodle?removeDeadlines=true"), 200),
    ).toEqual({ removed: 0 });
    expect(await isMoodleConnected(a)).toBe(true);
  });

  it(`answers 429 past ${MOODLE_SYNCS_PER_HOUR} syncs an hour`, async () => {
    await signIn();
    await answer(await call(PUT, "PUT", "/api/moodle", { body: { url: URL_GOOD } }), 200);
    for (let i = 1; i < MOODLE_SYNCS_PER_HOUR; i++) {
      await answer(await call(SYNC, "POST", "/api/moodle/sync"), 200);
    }
    await answer(await call(SYNC, "POST", "/api/moodle/sync"), 429);
  });

  it("is a 404 while MOODLE_IMPORT_ENABLED is off, except disconnect", async () => {
    const id = await signIn();
    await answer(await call(PUT, "PUT", "/api/moodle", { body: { url: URL_GOOD } }), 200);
    vi.stubEnv("MOODLE_IMPORT_ENABLED", "false");
    await answer(await call(GET, "GET", "/api/moodle"), 404);
    await answer(await call(PUT, "PUT", "/api/moodle", { body: { url: URL_GOOD } }), 404);
    await answer(await call(SYNC, "POST", "/api/moodle/sync"), 404);
    expect(
      await answer(await call(DELETE, "DELETE", "/api/moodle?removeDeadlines=true"), 200),
    ).toEqual({ removed: 8 });
    expect(await isMoodleConnected(id)).toBe(false);
  });
});
