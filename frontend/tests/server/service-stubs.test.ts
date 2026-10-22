import { describe, expect, it } from "vitest";
import { ApiError } from "@/server/http";

/**
 * The frozen service surfaces (PLAN §4.1.3–7). Until each workstream lands, every export is a typed stub that
 * throws ApiError(501, "unavailable"). This test pins the export names so a rename is a visible contract change.
 * Implemented services leave this list and pin their surface in their own tests (server/catalog:
 * tests/catalog/service.test.ts; server/rmp: tests/rmp/service.test.ts; server/feeds: tests/w4a/surface.test.ts;
 * server/programs: tests/programs/service.test.ts; server/plan: tests/plan/service.test.ts). None is left today; the
 * mechanism stays for services added later.
 */
const SURFACES: Readonly<Record<string, readonly [unknown, readonly string[]]>> = {};

describe("service stubs", () => {
  it("lists no stub today: every frozen service pins its surface in its own tests", () => {
    expect(Object.keys(SURFACES)).toEqual([]);
  });

  for (const [name, [module, exports]] of Object.entries(SURFACES)) {
    it(`server/${name} exports exactly its frozen functions, each a 501 until implemented`, async () => {
      const functions = Object.entries(module as Record<string, unknown>).filter(
        ([, value]) => typeof value === "function",
      );
      expect(functions.map(([key]) => key).sort()).toEqual([...exports].sort());
      for (const [key, fn] of functions) {
        let error: unknown;
        try {
          await (fn as (...args: unknown[]) => unknown)();
        } catch (e) {
          error = e;
        }
        expect(error, key).toBeInstanceOf(ApiError);
        expect(error).toMatchObject({ status: 501, code: "unavailable" });
        expect((error as Error).message).toBe(`${key} is not implemented yet.`);
      }
    });
  }
});
