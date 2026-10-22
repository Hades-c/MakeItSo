import { describe, expect, it } from "vitest";
import {
  searchApi,
  SearchQuerySchema,
  SearchResponseSchema,
  SearchResultSchema,
} from "@/lib/api/search";

describe("search contract (GET /api/search)", () => {
  it("is exactly GET /api/search for signed-in users, never cached", () => {
    expect(searchApi.search).toMatchObject({
      method: "GET",
      path: "/api/search",
      auth: "user",
      cache: "private",
    });
  });

  it("normalises q and defaults limit to 8", () => {
    expect(SearchQuerySchema.parse({ q: "  csc   221 " })).toEqual({ q: "csc 221", limit: 8 });
    expect(SearchQuerySchema.parse({})).toEqual({ q: "", limit: 8 });
    expect(SearchQuerySchema.parse({ q: ["first", "second"], limit: "20" })).toEqual({
      q: "first",
      limit: 20,
    });
    expect(SearchQuerySchema.parse({ q: "x".repeat(500) }).q).toHaveLength(200);
  });

  it("rejects limits outside 1..20", () => {
    for (const limit of ["0", "21", "-3", "2.5", "lots"]) {
      expect(SearchQuerySchema.safeParse({ q: "a", limit }).success).toBe(false);
    }
  });

  it("accepts exactly the result shape the palette renders", () => {
    const result = {
      kind: "course",
      id: "202602:CSC 221",
      title: "CSC 221 · Data Structures",
      subtitle: "Spring 2027 · 2 sections",
      href: "/courses/202602/CSC-221",
      source: "course-schedule",
    };
    expect(SearchResponseSchema.parse({ results: [result] }).results[0]).toEqual(result);
    const { subtitle: _s, source: _src, ...minimal } = result;
    expect(SearchResultSchema.parse(minimal)).toEqual(minimal);
    expect(SearchResultSchema.safeParse({ ...result, kind: "job" }).success).toBe(false);
    expect(SearchResultSchema.safeParse({ ...result, score: 3 }).success).toBe(false);
    expect(SearchResultSchema.safeParse({ ...result, source: "linkedin" }).success).toBe(false);
    for (const href of ["https://evil.example/", "//evil.example/x", "courses/1", "/a b"]) {
      expect(SearchResultSchema.safeParse({ ...result, href }).success).toBe(false);
    }
  });
});
