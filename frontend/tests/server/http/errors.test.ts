import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { ApiErrorBodySchema } from "@/lib/api/errors";
import { EnvError } from "@/server/env";
import { ApiError, notImplemented, toErrorResponse } from "@/server/http";
import { ExternalFetchError } from "@/server/http/external";

async function body(res: Response) {
  const json: unknown = await res.json();
  return ApiErrorBodySchema.parse(json).error;
}

describe("toErrorResponse (PLAN §2 API errors)", () => {
  it("turns ApiError into its status and a typed, uncached body", async () => {
    const res = toErrorResponse(new ApiError(401, "unauthorized", "Sign in to continue."));
    expect(res.status).toBe(401);
    expect(res.headers.get("cache-control")).toBe("private, no-store");
    expect(await body(res)).toEqual({ code: "unauthorized", message: "Sign in to continue." });
  });

  it("keeps extra headers such as Retry-After", () => {
    const res = toErrorResponse(
      new ApiError(429, "rate_limited", "Slow down", undefined, { "Retry-After": "30" }),
    );
    expect(res.headers.get("retry-after")).toBe("30");
  });

  it("turns ZodError into 400 validation_failed with issue paths", async () => {
    const schema = z.object({ year: z.number() });
    const res = toErrorResponse(schema.safeParse({ year: "2027" }).error);
    expect(res.status).toBe(400);
    const error = await body(res);
    expect(error.code).toBe("validation_failed");
    expect(error.issues).toEqual([{ path: "year", message: expect.any(String) }]);
  });

  it("maps mongoose CastError / ValidationError and duplicate keys", async () => {
    expect(toErrorResponse(Object.assign(new Error("x"), { name: "CastError" })).status).toBe(400);
    const validation = toErrorResponse(
      Object.assign(new Error("x"), {
        name: "ValidationError",
        errors: {
          credits: { message: "Path `credits` (9) is more than maximum allowed value (4)." },
        },
      }),
    );
    expect(validation.status).toBe(400);
    expect((await body(validation)).issues?.[0]?.path).toBe("credits");
    expect(toErrorResponse(Object.assign(new Error("E11000"), { code: 11000 })).status).toBe(409);
  });

  it("answers 503 for an upstream outage and 501 for a stub", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const upstream = toErrorResponse(
      new ExternalFetchError(
        "wildcatsync",
        "https://wildcatsync.davidson.edu/events.ics",
        "timeout",
        "Timed out",
      ),
    );
    expect(upstream.status).toBe(503);
    expect((await body(upstream)).code).toBe("unavailable");
    expect(log).toHaveBeenCalled();
    const stub = toErrorResponse(notImplemented("getPlan"));
    expect(stub.status).toBe(501);
    expect(await body(stub)).toEqual({
      code: "unavailable",
      message: "getPlan is not implemented yet.",
    });
  });

  it("hides configuration and unexpected errors behind a generic 500 and logs them", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    for (const error of [
      new Error("connection string mongodb://user:secret@host leaked?"),
      new EnvError(["NEXTAUTH_SECRET must be at least 32 characters"]),
    ]) {
      const res = toErrorResponse(error);
      expect(res.status).toBe(500);
      const { code, message } = await body(res);
      expect(code).toBe("internal");
      expect(message).not.toMatch(/secret|NEXTAUTH/i);
    }
    expect(log).toHaveBeenCalledTimes(2);
  });
});
