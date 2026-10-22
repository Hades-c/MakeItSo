import { describe, expect, it, vi } from "vitest";
import { ApiError } from "@/server/http/errors";

/**
 * /courses on a cold start with every upstream down (hardening regression): the registration term was never
 * ingested, so browseTerm() and the search answer 503. The page shows its own "could not be searched" state (HTTP
 * 200) instead of the hub error boundary.
 */

const unavailable = () =>
  new ApiError(503, "unavailable", "Schedule data is temporarily unavailable.");

vi.mock("@/server/catalog", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  resolveTerms: async () => ({ current: "202601", registration: "202602", terms: [] }),
  browseTerm: async () => {
    throw unavailable();
  },
  searchCourses: async () => {
    throw unavailable();
  },
  getCatalogFilters: async () => {
    throw unavailable();
  },
}));
vi.mock("@/app/(hub)/courses/_lib/course", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  resolveCoursePage: async () => {
    throw unavailable();
  },
}));
vi.mock("@/server/auth/session", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  requireUser: async () => ({
    id: "0123456789abcdef01234567",
    email: "sam@davidson.edu",
    name: "Sam",
  }),
}));

describe("/courses while the schedule cannot be read", () => {
  it("falls back to the registration term with the search's error state", async () => {
    const { loadSearch } = await import("@/app/(hub)/courses/_lib/search");
    const { parseCoursesQuery } = await import("@/app/(hub)/courses/_lib/query");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const view = await loadSearch(parseCoursesQuery({}).query, null);
    expect(view.term).toBe("202602");
    expect(view.rows).toEqual([]);
    expect(view.error).toBe("Schedule data is temporarily unavailable.");
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
    error.mockRestore();
  });
});

describe("/courses/[term]/[code] while the schedule cannot be read", () => {
  it("says so on the page and titles it plainly, instead of the error boundary", async () => {
    const page = await import("@/app/(hub)/courses/[term]/[code]/page");
    const params = Promise.resolve({ term: "202602", code: "CSC-121" });
    await expect(page.generateMetadata({ params })).resolves.toEqual({ title: "Course" });
    const { renderToStaticMarkup } = await import("react-dom/server");
    const html = renderToStaticMarkup(
      await page.default({ params, searchParams: Promise.resolve({}) }),
    );
    expect(html).toContain("This course could not load");
    expect(html).toContain("temporarily unavailable");
  });
});
