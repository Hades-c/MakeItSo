import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { ApiError, parseJsonBody, withApi } from "@/server/http";

async function body(res: Response) {
  return (await res.json()) as { error: { code: string; message: string; issues?: unknown } };
}

describe("withApi", () => {
  it("passes successful responses through", async () => {
    const handler = withApi(async () => Response.json({ ok: true }));
    const res = await handler();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  it("turns ApiError into its status and a typed body", async () => {
    const res = await withApi(async () => {
      throw new ApiError(401, "unauthorized", "Sign in to continue.");
    })();
    expect(res.status).toBe(401);
    expect(await body(res)).toEqual({
      error: { code: "unauthorized", message: "Sign in to continue." },
    });
  });

  it("turns ZodError into 400 validation_failed with issue paths", async () => {
    const schema = z.object({ year: z.number() });
    const res = await withApi(async () => {
      schema.parse({ year: "2027" });
      return new Response();
    })();
    expect(res.status).toBe(400);
    const { error } = await body(res);
    expect(error.code).toBe("validation_failed");
    expect(error.issues).toEqual([{ path: "year", message: expect.any(String) }]);
  });

  it("hides unexpected errors behind a generic 500 and logs them", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const res = await withApi(async () => {
      throw new Error("connection string mongodb://user:secret@host leaked?");
    })();
    expect(res.status).toBe(500);
    const { error } = await body(res);
    expect(error.code).toBe("internal");
    expect(error.message).not.toContain("secret");
    expect(log).toHaveBeenCalled();
  });
});

describe("parseJsonBody", () => {
  const schema = z.object({ code: z.string() }).strict();

  it("returns validated data", async () => {
    const req = new Request("http://x", {
      method: "POST",
      body: JSON.stringify({ code: "CSC 121" }),
    });
    await expect(parseJsonBody(req, schema)).resolves.toEqual({ code: "CSC 121" });
  });

  it("rejects malformed JSON with ApiError(400) and unknown keys with ZodError", async () => {
    const bad = new Request("http://x", { method: "POST", body: "{" });
    await expect(parseJsonBody(bad, schema)).rejects.toMatchObject({ status: 400 });

    const extra = new Request("http://x", {
      method: "POST",
      body: JSON.stringify({ code: "CSC 121", isAdmin: true }),
    });
    await expect(parseJsonBody(extra, schema)).rejects.toBeInstanceOf(z.ZodError);
  });
});
