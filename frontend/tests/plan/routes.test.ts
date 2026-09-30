import mongoose from "mongoose";
import type { Session } from "next-auth";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { sessionFor, stubAuthEnv } from "../w3/helpers";
import { insertStudent, planDoc, withPlanDb } from "./helpers";
import { DELETE as deleteDeadline } from "@/app/api/plan/deadlines/[id]/route";
import { GET as listDeadlines, POST as addDeadline } from "@/app/api/plan/deadlines/route";
import { PATCH as patchDraft } from "@/app/api/plan/drafts/[id]/route";
import { GET as listDrafts } from "@/app/api/plan/drafts/route";
import { DELETE as deleteItem, PATCH as patchItem } from "@/app/api/plan/items/[id]/route";
import { POST as addItem } from "@/app/api/plan/items/route";
import { PATCH as patchManual } from "@/app/api/plan/manual/route";
import { GET as progress } from "@/app/api/plan/progress/route";
import { GET as getPlan } from "@/app/api/plan/route";
import { GET as schedule } from "@/app/api/plan/schedule/route";
import { DELETE as deleteSummer, PATCH as patchSummer } from "@/app/api/plan/summer/[id]/route";
import { GET as listSummer, POST as addSummer } from "@/app/api/plan/summer/route";
import { GET as getWebTree, PUT as putWebTree } from "@/app/api/plan/webtree/route";
import { planApi } from "@/lib/api/plan";
import { saveDraft } from "@/server/plan";

/**
 * Route integration tests for app/api/plan/** (PLAN §4.1.9): defineRoute with auth "user" (401 signed out), the
 * app Origin on mutations (403), JSON bodies (415), strict schemas (400), the service's 404/409, the contract's
 * response schemas, and `Cache-Control: private, no-store` on every answer. The real session code runs; only
 * NextAuth's cookie decoding is replaced (as in tests/w3).
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

withPlanDb();

beforeEach(() => {
  auth.session = null;
  stubAuthEnv();
});

const ORIGIN = "http://localhost";
type Handler = (
  request: Request,
  context?: { params?: Promise<Record<string, string>> },
) => Promise<Response>;

function request(
  method: string,
  path: string,
  {
    body,
    origin = true,
    contentType = "application/json",
  }: { body?: unknown; origin?: boolean; contentType?: string } = {},
): Request {
  const headers: Record<string, string> = {};
  if (origin) headers.origin = ORIGIN;
  if (body !== undefined) headers["content-type"] = contentType;
  return new Request(`${ORIGIN}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body),
  });
}

function call(
  handler: Handler,
  method: string,
  path: string,
  options: Parameters<typeof request>[2] & { params?: Record<string, string> } = {},
) {
  const { params, ...rest } = options;
  return handler(
    request(method, path, rest),
    params ? { params: Promise.resolve(params) } : undefined,
  );
}

async function signIn(): Promise<string> {
  const id = await insertStudent({
    email: `route-${new mongoose.Types.ObjectId().toHexString()}@davidson.edu`,
  });
  auth.session = await sessionFor({ id, email: "x@davidson.edu", name: "Sam Student" });
  return id;
}

async function json(res: Response, status: number): Promise<unknown> {
  expect(res.headers.get("cache-control")).toBe("private, no-store");
  expect(res.status).toBe(status);
  return res.status === 204 ? null : res.json();
}

async function errorCode(res: Response, status: number): Promise<string> {
  const body = (await json(res, status)) as { error: { code: string } };
  return body.error.code;
}

const ID = "650000000000000000000abc";

/** [name, handler, method, path, params?, body?] for every route in lib/api/plan.ts. */
const ROUTES: [string, Handler, string, string, Record<string, string>?, unknown?][] = [
  ["getPlan", getPlan, "GET", "/api/plan"],
  [
    "addItem",
    addItem,
    "POST",
    "/api/plan/items",
    undefined,
    { termCode: "202602", courseCode: "CSC 221" },
  ],
  ["updateItem", patchItem, "PATCH", `/api/plan/items/${ID}`, { id: ID }, { status: "completed" }],
  ["removeItem", deleteItem, "DELETE", `/api/plan/items/${ID}`, { id: ID }],
  ["updateManual", patchManual, "PATCH", "/api/plan/manual", undefined, { languageExempt: true }],
  ["progress", progress, "GET", "/api/plan/progress"],
  ["daySchedule", schedule, "GET", "/api/plan/schedule"],
  ["getWebTree", getWebTree, "GET", "/api/plan/webtree"],
  [
    "saveWebTree",
    putWebTree,
    "PUT",
    "/api/plan/webtree",
    undefined,
    { termCode: "202602", choices: [] },
  ],
  ["listDeadlines", listDeadlines, "GET", "/api/plan/deadlines"],
  [
    "addDeadline",
    addDeadline,
    "POST",
    "/api/plan/deadlines",
    undefined,
    { title: "Essay", dueAt: "2026-10-02T17:00:00-04:00" },
  ],
  ["removeDeadline", deleteDeadline, "DELETE", `/api/plan/deadlines/${ID}`, { id: ID }],
  ["listSummer", listSummer, "GET", "/api/plan/summer"],
  [
    "addSummer",
    addSummer,
    "POST",
    "/api/plan/summer",
    undefined,
    { termCode: "202603", title: "REU", kind: "research" },
  ],
  ["updateSummer", patchSummer, "PATCH", `/api/plan/summer/${ID}`, { id: ID }, { title: "x" }],
  ["removeSummer", deleteSummer, "DELETE", `/api/plan/summer/${ID}`, { id: ID }],
  ["listDrafts", listDrafts, "GET", "/api/plan/drafts"],
  [
    "updateDraft",
    patchDraft,
    "PATCH",
    `/api/plan/drafts/${ID}`,
    { id: ID },
    { status: "dismissed" },
  ],
];

describe("every plan route", () => {
  it("covers lib/api/plan.ts exactly", () => {
    expect(ROUTES.map(([name]) => name).sort()).toEqual(Object.keys(planApi).sort());
    for (const [name, , method, path] of ROUTES) {
      const spec = planApi[name as keyof typeof planApi];
      expect(spec.method).toBe(method);
      expect(path.replace(ID, "[id]")).toBe(spec.path);
      expect(spec.auth).toBe("user");
    }
  });

  it.each(ROUTES)(
    "%s answers 401 when signed out",
    async (_name, handler, method, path, params, body) => {
      expect(await errorCode(await call(handler, method, path, { params, body }), 401)).toBe(
        "unauthorized",
      );
    },
  );

  it.each(ROUTES.filter(([, , method]) => method !== "GET"))(
    "%s answers 403 without the app's Origin",
    async (_name, handler, method, path, params, body) => {
      await signIn();
      expect(
        await errorCode(await call(handler, method, path, { params, body, origin: false }), 403),
      ).toBe("forbidden");
    },
  );

  it.each(ROUTES.filter(([, , , , , body]) => body !== undefined))(
    "%s answers 415 for a non-JSON body and 400 for unknown fields",
    async (_name, handler, method, path, params, body) => {
      await signIn();
      expect(
        (await call(handler, method, path, { params, body: "x=1", contentType: "text/plain" }))
          .status,
      ).toBe(415);
      const extra = { ...(body as object), hacked: true };
      expect(await errorCode(await call(handler, method, path, { params, body: extra }), 400)).toBe(
        "validation_failed",
      );
    },
  );

  it.each(ROUTES.filter(([, , , , params]) => params !== undefined))(
    "%s answers 400 for a malformed id",
    async (_name, handler, method, path, _params, body) => {
      await signIn();
      const res = await call(handler, method, path.replace(ID, "nope"), {
        params: { id: "nope" },
        body,
      });
      expect(await errorCode(res, 400)).toBe("validation_failed");
    },
  );
});

describe("plan items", () => {
  it("adds (201 + warnings), reads, patches and removes (204)", async () => {
    await signIn();
    const created = (await json(
      await call(addItem, "POST", "/api/plan/items", {
        body: { termCode: "202602", courseCode: "csc221", crn: "20135" },
      }),
      201,
    )) as { item: { id: string } };
    planApi.addItem.response.parse(created);
    expect(created).toMatchObject({
      item: { courseCode: "CSC 221", title: "Data Structures", crn: "20135" },
      warnings: [],
    });
    const plan = planApi.getPlan.response.parse(
      await json(await call(getPlan, "GET", "/api/plan"), 200),
    );
    expect(plan.plan.items.map((i) => i.id)).toEqual([created.item.id]);
    const patched = planApi.updateItem.response.parse(
      await json(
        await call(patchItem, "PATCH", `/api/plan/items/${created.item.id}`, {
          params: { id: created.item.id },
          body: { status: "registered", note: "  lab on Monday " },
        }),
        200,
      ),
    );
    expect(patched.item).toMatchObject({ status: "registered", note: "lab on Monday" });
    expect(
      await json(
        await call(deleteItem, "DELETE", `/api/plan/items/${created.item.id}`, {
          params: { id: created.item.id },
        }),
        204,
      ),
    ).toBeNull();
    expect(
      await json(
        await call(deleteItem, "DELETE", `/api/plan/items/${created.item.id}`, {
          params: { id: created.item.id },
        }),
        204,
      ),
    ).toBeNull();
  });

  it("answers 409 for a duplicate, 404 for an unknown item and 400 for bad input", async () => {
    await signIn();
    const body = { termCode: "202602", courseCode: "CSC 221" };
    await json(await call(addItem, "POST", "/api/plan/items", { body }), 201);
    const dup = (await json(await call(addItem, "POST", "/api/plan/items", { body }), 409)) as {
      error: { message: string };
    };
    expect(dup.error.message).toBe("CSC 221 is already in your Spring 2027 plan.");
    expect(
      await errorCode(
        await call(patchItem, "PATCH", `/api/plan/items/${ID}`, {
          params: { id: ID },
          body: { status: "completed" },
        }),
        404,
      ),
    ).toBe("not_found");
    expect(
      await errorCode(
        await call(patchItem, "PATCH", `/api/plan/items/${ID}`, { params: { id: ID }, body: {} }),
        400,
      ),
    ).toBe("validation_failed");
    for (const bad of [
      { termCode: "2026", courseCode: "CSC 221" },
      { termCode: "202602", courseCode: "not a code" },
      { termCode: "202602", courseCode: "CSC 221", credits: 4 },
      { termCode: "202602", courseCode: "CSC 221", manualCredits: 9 },
      { termCode: "202602", courseCode: "CSC 221", status: "graded" },
    ]) {
      expect(
        await errorCode(await call(addItem, "POST", "/api/plan/items", { body: bad }), 400),
      ).toBe("validation_failed");
    }
    expect(
      await errorCode(await call(addItem, "POST", "/api/plan/items", { body: "{not json" }), 400),
    ).toBe("bad_request");
  });

  it("answers 413 above 16 KB", async () => {
    await signIn();
    const res = await call(addItem, "POST", "/api/plan/items", {
      body: { termCode: "202602", courseCode: "CSC 221", note: "x".repeat(20_000) },
    });
    expect(res.status).toBe(413);
  });
});

describe("progress, schedule, WebTree", () => {
  it("serves the progress with the disclaimer", async () => {
    await signIn();
    const body = await json(await call(progress, "GET", "/api/plan/progress"), 200);
    expect(planApi.progress.response.parse(body).progress.required).toBe(32);
    expect(body).toMatchObject({ progress: { disclaimer: "Unofficial — verify in Degree Works" } });
  });

  it("serves today's schedule by default and a given date", async () => {
    await signIn();
    const today = planApi.daySchedule.response.parse(
      await json(await call(schedule, "GET", "/api/plan/schedule"), 200),
    );
    expect(today.schedule).toMatchObject({
      date: "2026-09-30",
      termCode: "202601",
      empty: "no-sections",
    });
    const weekend = planApi.daySchedule.response.parse(
      await json(await call(schedule, "GET", "/api/plan/schedule?date=2026-10-03"), 200),
    );
    expect(weekend.schedule.empty).toBe("weekend");
    expect(
      await errorCode(await call(schedule, "GET", "/api/plan/schedule?date=tomorrow"), 400),
    ).toBe("validation_failed");
  });

  it("saves (PUT) and reads (GET) the WebTree list with its report", async () => {
    await signIn();
    const list = {
      termCode: "202602",
      choices: [{ rank: 1, crn: "20135", courseCode: "CSC 221", alternates: ["20136"] }],
    };
    const saved = await json(
      await call(putWebTree, "PUT", "/api/plan/webtree", { body: list }),
      200,
    );
    expect(planApi.saveWebTree.response.parse(saved).list).toEqual(list);
    expect(saved).toMatchObject({
      copyText: expect.stringContaining("1. CRN 20135  CSC 221 A  Data Structures"),
    });
    const read = await json(await call(getWebTree, "GET", "/api/plan/webtree"), 200);
    expect(planApi.getWebTree.response.parse(read)).toMatchObject({
      list,
      conflicts: [],
      warnings: [],
    });
    expect((read as { deadlines: unknown[] }).deadlines).toHaveLength(5);
    const other = planApi.getWebTree.response.parse(
      await json(await call(getWebTree, "GET", "/api/plan/webtree?term=202701"), 200),
    );
    expect(other.list).toEqual({ termCode: "202701", choices: [] });
    const bad = (await json(
      await call(putWebTree, "PUT", "/api/plan/webtree", {
        body: {
          termCode: "202602",
          choices: [{ rank: 1, crn: "99999", courseCode: "CSC 221", alternates: [] }],
        },
      }),
      400,
    )) as { error: { issues: unknown[] } };
    expect(bad.error.issues).toEqual([
      { path: "choices.0.crn", message: "CRN 99999 is not a Spring 2027 section." },
    ]);
    expect(
      await errorCode(await call(getWebTree, "GET", "/api/plan/webtree?term=000001"), 400),
    ).toBe("validation_failed");
  });
});

describe("manual inputs, deadlines, summer, drafts", () => {
  it("patches the manual inputs", async () => {
    await signIn();
    const body = planApi.updateManual.response.parse(
      await json(
        await call(patchManual, "PATCH", "/api/plan/manual", {
          body: { pe: { lifetimeActivities: 1, teamSport: true } },
        }),
        200,
      ),
    );
    expect(body.manual).toEqual({
      languageExempt: false,
      pe: { lifetimeActivities: 1, teamSport: true },
    });
    expect(
      await errorCode(
        await call(patchManual, "PATCH", "/api/plan/manual", {
          body: { pe: { lifetimeActivities: 3, teamSport: true } },
        }),
        400,
      ),
    ).toBe("validation_failed");
  });

  it("adds, lists and removes deadlines", async () => {
    await signIn();
    const created = planApi.addDeadline.response.parse(
      await json(
        await call(addDeadline, "POST", "/api/plan/deadlines", {
          body: { title: "Essay", dueAt: "2026-10-02T17:00:00-04:00" },
        }),
        201,
      ),
    );
    expect(
      planApi.listDeadlines.response.parse(
        await json(await call(listDeadlines, "GET", "/api/plan/deadlines"), 200),
      ).deadlines,
    ).toEqual([created.deadline]);
    await json(
      await call(deleteDeadline, "DELETE", `/api/plan/deadlines/${created.deadline.id}`, {
        params: { id: created.deadline.id },
      }),
      204,
    );
    expect(
      await errorCode(
        await call(addDeadline, "POST", "/api/plan/deadlines", {
          body: { title: "", dueAt: "soon" },
        }),
        400,
      ),
    ).toBe("validation_failed");
  });

  it("adds, patches, lists and removes summer activities", async () => {
    await signIn();
    const created = planApi.addSummer.response.parse(
      await json(
        await call(addSummer, "POST", "/api/plan/summer", {
          body: { termCode: "202603", title: "REU", kind: "research" },
        }),
        201,
      ),
    );
    const id = created.activity.id;
    const patched = planApi.updateSummer.response.parse(
      await json(
        await call(patchSummer, "PATCH", `/api/plan/summer/${id}`, {
          params: { id },
          body: { organization: "Davidson" },
        }),
        200,
      ),
    );
    expect(patched.activity.organization).toBe("Davidson");
    expect(
      planApi.listSummer.response.parse(
        await json(await call(listSummer, "GET", "/api/plan/summer"), 200),
      ).activities,
    ).toEqual([patched.activity]);
    await json(
      await call(deleteSummer, "DELETE", `/api/plan/summer/${id}`, { params: { id } }),
      204,
    );
    expect(
      await errorCode(
        await call(addSummer, "POST", "/api/plan/summer", {
          body: { termCode: "202601", title: "Fall", kind: "job" },
        }),
        400,
      ),
    ).toBe("validation_failed");
    expect(
      await errorCode(
        await call(patchSummer, "PATCH", `/api/plan/summer/${ID}`, {
          params: { id: ID },
          body: { title: "x" },
        }),
        404,
      ),
    ).toBe("not_found");
  });

  it("lists drafts and accepts one", async () => {
    const user = await signIn();
    const draft = await saveDraft(user, {
      kind: "plan-suggestions",
      promptVersion: "plan-suggestions@1",
      items: [{ termCode: "202602", courseCode: "CSC 221", reason: "Next in the CS sequence." }],
    });
    expect(
      planApi.listDrafts.response.parse(
        await json(await call(listDrafts, "GET", "/api/plan/drafts"), 200),
      ).drafts,
    ).toEqual([draft]);
    const accepted = planApi.updateDraft.response.parse(
      await json(
        await call(patchDraft, "PATCH", `/api/plan/drafts/${draft.id}`, {
          params: { id: draft.id },
          body: { status: "accepted" },
        }),
        200,
      ),
    );
    expect(accepted.draft.status).toBe("accepted");
    expect(accepted.added.map((i) => i.courseCode)).toEqual(["CSC 221"]);
    expect(
      await errorCode(
        await call(patchDraft, "PATCH", `/api/plan/drafts/${draft.id}`, {
          params: { id: draft.id },
          body: { status: "pending" },
        }),
        400,
      ),
    ).toBe("validation_failed");
    expect(
      await errorCode(
        await call(patchDraft, "PATCH", `/api/plan/drafts/${ID}`, {
          params: { id: ID },
          body: { status: "accepted" },
        }),
        404,
      ),
    ).toBe("not_found");
  });

  it("a signed-in student only ever touches their own plan", async () => {
    const other = await insertStudent();
    await signIn();
    await json(
      await call(addItem, "POST", "/api/plan/items", {
        body: { termCode: "202602", courseCode: "CSC 221" },
      }),
      201,
    );
    expect(await planDoc(other)).toBeNull();
  });
});
