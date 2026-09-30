import { afterEach, describe, expect, it, vi } from "vitest";
import { apiUrl, ApiClientError, callApi } from "@/lib/api/client";
import { planApi } from "@/lib/api/plan";
import { searchApi } from "@/lib/api/search";

afterEach(() => {
  vi.unstubAllGlobals();
});

function stubFetch(response: Response) {
  const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => response);
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("callApi", () => {
  it("builds the URL from the spec", () => {
    expect(apiUrl(searchApi.search, { query: { q: "data", limit: 5 } })).toBe(
      "/api/search?q=data&limit=5",
    );
    expect(apiUrl(planApi.removeItem, { params: { id: "0123456789abcdef01234567" } })).toBe(
      "/api/plan/items/0123456789abcdef01234567",
    );
  });

  it("sends JSON and validates the response", async () => {
    const fetchMock = stubFetch(Response.json({ results: [] }));
    await expect(callApi(searchApi.search, { query: { q: "x" } })).resolves.toEqual({
      results: [],
    });
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("/api/search?q=x");
    expect(init?.method).toBe("GET");
    expect(init?.credentials).toBe("same-origin");

    stubFetch(new Response(null, { status: 204 }));
    await expect(
      callApi(planApi.removeItem, { params: { id: "0123456789abcdef01234567" } }),
    ).resolves.toBeNull();
  });

  it("turns error bodies into ApiClientError", async () => {
    stubFetch(
      Response.json(
        {
          error: {
            code: "validation_failed",
            message: "Bad",
            issues: [{ path: "q", message: "x" }],
          },
        },
        { status: 400 },
      ),
    );
    const error = await callApi(searchApi.search, {}).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiClientError);
    expect(error).toMatchObject({ status: 400, code: "validation_failed", message: "Bad" });
  });

  it("flags a response that breaks the contract", async () => {
    stubFetch(Response.json({ results: [{ kind: "nope" }] }));
    await expect(callApi(searchApi.search, {})).rejects.toMatchObject({ code: "invalid_response" });
  });

  it("reports network failures", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Promise.reject(new TypeError("offline"))),
    );
    await expect(callApi(searchApi.search, {})).rejects.toMatchObject({
      code: "network",
      status: 0,
    });
  });
});
