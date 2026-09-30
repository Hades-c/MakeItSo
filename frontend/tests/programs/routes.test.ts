import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { startTestDb, type TestDb } from "../helpers/db";
import { GET as cronGET } from "@/app/api/cron/programs/route";
import { GET as programGET } from "@/app/api/programs/[id]/route";
import { GET as listGET } from "@/app/api/programs/route";
import { ProgramResponseSchema, ProgramsResponseSchema } from "@/lib/api/programs";
import { ProgramSyncResultSchema } from "@/lib/types/catalog";
import { getDb } from "@/server/db";
import { isDefinedRoute, NO_STORE, PUBLIC_CATALOG_CACHE } from "@/server/http";
import { liveDeps } from "@/server/programs/service";

let testDb: TestDb;

beforeAll(async () => {
  testDb = await startTestDb();
  await getDb();
});

afterEach(async () => {
  await testDb.clear();
});

afterAll(async () => {
  await testDb.stop();
});

const ORIGIN = "http://localhost";

function list(query = "", init: RequestInit = {}) {
  return listGET(new Request(`${ORIGIN}/api/programs${query}`, init));
}

function program(id: string, init: RequestInit = {}) {
  return programGET(new Request(`${ORIGIN}/api/programs/${id}`, init), {
    params: Promise.resolve({ id }),
  });
}

function cron(headers: Record<string, string> = {}, method = "GET") {
  return cronGET(new Request(`${ORIGIN}/api/cron/programs`, { method, headers }));
}

async function errorOf(res: Response) {
  return ((await res.json()) as { error: { code: string; message: string } }).error;
}

describe("route modules", () => {
  it("are defineRoute handlers", () => {
    expect([listGET, programGET, cronGET].every(isDefinedRoute)).toBe(true);
  });
});

describe("GET /api/programs", () => {
  it("lists every program with its official names, cacheable by the CDN", async () => {
    const res = await list();
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe(PUBLIC_CATALOG_CACHE);
    const body = ProgramsResponseSchema.parse(await res.json());
    expect(body.catalogYear).toBe("2026-2027");
    expect(body.programs).toHaveLength(51);
    expect(body.programs.find((p) => p.acalogId === 172)).toEqual({
      acalogId: 172,
      name: "Computer Science",
      catalogYear: "2026-2027",
      offerings: [
        { kind: "major", name: "Major in Computer Science (B.S. Degree)" },
        { kind: "minor", name: "Minor in Computer Science" },
      ],
    });
  });

  it("filters by ?kind= (repeated or comma-separated)", async () => {
    const majors = ProgramsResponseSchema.parse(await (await list("?kind=major")).json());
    expect(majors.programs.flatMap((p) => p.offerings.map((o) => o.kind))).toSatisfy(
      (kinds: string[]) => kinds.every((kind) => kind === "major"),
    );
    const repeated = await (await list("?kind=minor&kind=interdisciplinary-minor")).json();
    const comma = await (await list("?kind=minor,interdisciplinary-minor")).json();
    expect(repeated).toEqual(comma);
    expect(
      ProgramsResponseSchema.parse(repeated).programs.some((p) => p.name === "Neuroscience"),
    ).toBe(true);
  });

  it("rejects an unknown kind with 400 and no caching", async () => {
    const res = await list("?kind=track");
    expect(res.status).toBe(400);
    expect(res.headers.get("Cache-Control")).toBe(NO_STORE);
    expect((await errorOf(res)).code).toBe("validation_failed");
  });

  it("answers GET only", async () => {
    const res = await list("", { method: "POST", headers: { origin: ORIGIN } });
    expect(res.status).toBe(405);
    expect(res.headers.get("Allow")).toBe("GET");
  });
});

describe("GET /api/programs/[id]", () => {
  it("returns one program with requirement text and course codes, cacheable by the CDN", async () => {
    const res = await program("174");
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe(PUBLIC_CATALOG_CACHE);
    const { program: economics } = ProgramResponseSchema.parse(await res.json());
    expect(economics.name).toBe("Economics");
    expect(economics.url).toBe(
      "https://catalog.davidson.edu/preview_program.php?catoid=28&poid=1801",
    );
    expect(economics.offerings[0]).toMatchObject({
      kind: "major",
      name: "Major in Economics (A.B. Degree)",
      degree: "A.B.",
      courseCodes: expect.arrayContaining(["ECO 101", "ECO 495"]),
    });
    expect(economics.offerings[0]?.requirementsText).toContain(
      "To complete a major in economics, you must complete ten economics courses",
    );
  });

  it("answers 404 for a program the catalog does not list", async () => {
    const res = await program("999999");
    expect(res.status).toBe(404);
    expect(res.headers.get("Cache-Control")).toBe(NO_STORE);
    expect(await errorOf(res)).toEqual({
      code: "not_found",
      message: "The 2026-2027 catalog has no program with id 999999.",
    });
  });

  it.each(["abc", "0", "-3", "1.5"])("answers 400 for the id %j", async (id) => {
    const res = await program(id);
    expect(res.status).toBe(400);
    expect((await errorOf(res)).code).toBe("validation_failed");
  });

  it.each(["0172", "1e3", "%20172", "172.0", "+172"])(
    "answers 400 for the non-canonical id %j, without reading the catalog",
    async (id) => {
      const fetcher = vi.spyOn(liveDeps, "fetcher");
      const res = await program(id);
      expect(res.status).toBe(400);
      expect(res.headers.get("Cache-Control")).toBe(NO_STORE);
      expect(fetcher).not.toHaveBeenCalled();
    },
  );

  it("answers 503 when a never-read page cannot be fetched", async () => {
    vi.spyOn(liveDeps, "fetcher").mockResolvedValue({
      status: 202,
      text: "",
      headers: new Headers({ "x-amzn-waf-action": "challenge" }),
    });
    const res = await program("188");
    expect(res.status).toBe(503);
    expect(res.headers.get("Cache-Control")).toBe(NO_STORE);
    expect(res.headers.get("Retry-After")).toBe("1800");
    expect((await errorOf(res)).code).toBe("unavailable");
  });
});

describe("GET /api/cron/programs", () => {
  it("is unavailable until CRON_SECRET is set", async () => {
    vi.stubEnv("CRON_SECRET", "");
    const res = await cron({ authorization: "Bearer anything" });
    expect(res.status).toBe(503);
  });

  it("needs the bearer secret", async () => {
    vi.stubEnv("CRON_SECRET", "cron-secret-for-tests");
    expect((await cron()).status).toBe(401);
    expect((await cron({ authorization: "Bearer wrong-secret-for-tests" })).status).toBe(401);
  });

  it("runs the sync and reports it", async () => {
    vi.stubEnv("CRON_SECRET", "cron-secret-for-tests");
    const res = await cron({ authorization: "Bearer cron-secret-for-tests" });
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe(NO_STORE);
    expect(ProgramSyncResultSchema.parse(await res.json())).toEqual({
      ok: true,
      count: 51,
      pages: { updated: 0, failed: 0, deferred: 0 },
    });
  });

  it("reports an upstream failure in the body (the run is recorded, the route itself worked)", async () => {
    vi.stubEnv("CRON_SECRET", "cron-secret-for-tests");
    vi.spyOn(liveDeps, "fetcher").mockResolvedValue({
      status: 200,
      text: "",
      headers: new Headers(),
    });
    const res = await cron({ authorization: "Bearer cron-secret-for-tests" });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      ok: false,
      count: 0,
      error: "Acalog sent an empty response",
    });
  });
});
