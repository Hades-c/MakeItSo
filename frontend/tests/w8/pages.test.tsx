import { render as rtlRender, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { TooltipProvider } from "@/components/ui/tooltip";
import type { SearchView } from "@/app/(hub)/courses/_lib/search";
import type { CoursePageData, ResolvedCoursePage } from "@/app/(hub)/courses/_lib/course";
import type { ResolvedTerms } from "@/lib/types/catalog";
import { course } from "./helpers";

/**
 * Route-level tests for /courses and /courses/[term]/[code]: URL params reach the services, the empty / error /
 * past-the-last-page states, and the course page's real 404s (notFound() before anything renders, also from
 * generateMetadata). The data loaders are replaced here; tests/w8/pages-data.test.ts runs them for real.
 */

const state = vi.hoisted(() => ({
  search: null as unknown,
  searchCalls: [] as unknown[],
  resolved: null as unknown,
  resolveCalls: [] as unknown[],
  page: null as unknown,
  loadCalls: [] as unknown[],
}));

vi.mock("next/navigation", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  useRouter: () => ({ refresh: vi.fn() }),
}));
vi.mock("@/server/auth/session", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  requireUser: async () => ({ id: "0123456789abcdef01234567", name: "S", email: "s@davidson.edu" }),
}));
vi.mock("@/app/(hub)/courses/_lib/student", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  loadStudentPlan: async () => null,
}));
vi.mock("@/app/(hub)/courses/_lib/search", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  loadSearch: async (query: unknown) => {
    state.searchCalls.push(query);
    return state.search;
  },
}));
vi.mock("@/app/(hub)/courses/_lib/course", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  resolveCoursePage: async (params: unknown) => {
    state.resolveCalls.push(params);
    return state.resolved;
  },
  loadCoursePage: async (page: unknown, options: unknown) => {
    state.loadCalls.push(options);
    return { ...(page as object), ...(state.page as object) };
  },
}));

const coursesPage = await import("@/app/(hub)/courses/page");
const coursePage = await import("@/app/(hub)/courses/[term]/[code]/page");

const render = (ui: React.ReactElement) => rtlRender(<TooltipProvider>{ui}</TooltipProvider>);
const NOT_FOUND = { digest: "NEXT_HTTP_ERROR_FALLBACK;404" };

function view(patch: Partial<SearchView> = {}): SearchView {
  return {
    term: "202602",
    termOptions: [{ code: "202602", label: "Spring 2027 (registration)" }],
    window: { current: "202601", registration: "202602" },
    filters: { term: "202602", departments: [], requirements: [] },
    result: { term: "202602", items: [], total: 0, page: 1, pageSize: 20, asOf: null },
    rows: [],
    error: null,
    ...patch,
  };
}

beforeEach(() => {
  state.searchCalls = [];
  state.resolveCalls = [];
  state.loadCalls = [];
});

const search = (params: Record<string, string | string[]>) => ({
  searchParams: Promise.resolve(params),
});

describe("/courses", () => {
  it("passes the URL's search to the catalog and says when nothing matches", async () => {
    state.search = view();
    render(await coursesPage.default(search({ q: "underwater basket weaving", dept: "CSC" })));
    expect(state.searchCalls[0]).toMatchObject({ q: "underwater basket weaving", dept: ["CSC"] });
    expect(
      screen.getByRole("heading", {
        name: "No Spring 2027 courses match “underwater basket weaving”",
      }),
    ).toBeVisible();
    expect(screen.getByRole("link", { name: "Clear filters" })).toHaveAttribute(
      "href",
      "/courses?term=202602",
    );
  });

  it("says which link params were ignored", async () => {
    state.search = view();
    render(await coursesPage.default(search({ after: "99:99" })));
    expect(screen.getByTestId("ignored-params")).toBeVisible();
  });

  it("shows the error state when the schedule cannot be searched", async () => {
    state.search = view({ result: null, error: "Schedule data is temporarily unavailable." });
    render(await coursesPage.default(search({})));
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Schedule data is temporarily unavailable.",
    );
    expect(screen.getByRole("link", { name: "Try again" })).toHaveAttribute(
      "href",
      "/courses?term=202602",
    );
  });

  it("past the last page, offers the first page", async () => {
    state.search = view({
      result: { term: "202602", items: [], total: 30, page: 9, pageSize: 20, asOf: null },
    });
    render(await coursesPage.default(search({ page: "9" })));
    expect(
      screen.getByRole("heading", { name: "There is no page 9 of these results" }),
    ).toBeVisible();
    expect(screen.getByRole("link", { name: "Go to the first page" })).toHaveAttribute(
      "href",
      "/courses?term=202602",
    );
  });

  it("lists results with a count and page links that keep the search", async () => {
    const summary = {
      termCode: "202602",
      code: "CSC 221",
      title: "Data Structures",
      topics: false,
      credits: [1],
      reqCodes: [],
      sectionCount: 2,
      openSeats: 48,
      instructorNames: [],
      crossListings: [],
      hasTba: false,
    };
    state.search = view({
      result: { term: "202602", items: [summary], total: 41, page: 2, pageSize: 20, asOf: null },
      rows: [
        {
          summary,
          href: "/courses/202602/CSC-221",
          reqs: [],
          sections: [],
          moreSections: 0,
          add: null,
        },
      ],
    });
    render(await coursesPage.default(search({ q: "data", page: "2" })));
    expect(screen.getByTestId("results-count")).toHaveTextContent(
      "21–40 of 41 courses in Spring 2027",
    );
    const pages = screen.getByRole("navigation", { name: "Result pages" });
    expect(within(pages).getByRole("link", { name: "Previous" })).toHaveAttribute(
      "href",
      "/courses?term=202602&q=data",
    );
    expect(within(pages).getByRole("link", { name: "Next" })).toHaveAttribute(
      "href",
      "/courses?term=202602&q=data&page=3",
    );
    expect(within(pages).getByText("Page 2 of 3")).toBeVisible();
  });
});

const params = (term: string, code: string) => ({ params: Promise.resolve({ term, code }) });

function resolved(): ResolvedCoursePage {
  const csc = course("202602", "CSC 221");
  return {
    params: { term: "202602", code: "CSC 221" },
    resolved: {
      terms: [],
      current: "202601",
      registration: "202602",
      asOf: null,
    } satisfies ResolvedTerms,
    course: csc,
    reference: csc,
    history: [{ termCode: "202602", status: "offered", sectionCount: 2 }],
    entry: { termCode: "202602", status: "offered", sectionCount: 2 },
    asOf: null,
  };
}

function pageData(): Partial<CoursePageData> {
  return {
    window: { current: "202601", registration: "202602" },
    departmentName: "Computer Science",
    chosen: course("202602", "CSC 221").sections[0]!,
    ratings: null,
    programs: null,
    week: null,
    add: {
      terms: [{ code: "202602", label: "Spring 2027", availability: "offered", sectionCount: 2 }],
      initialTerm: "202602",
      inPlanTerms: [],
      warnings: {},
      crns: { "202602": "20135" },
      sectionLabels: { "202602": "CSC 221 A" },
      unpublishedNote: null,
    },
    aboutGate: null,
  };
}

describe("/courses/[term]/[code]", () => {
  it("is a 404 for a malformed term or code without reading the catalog", async () => {
    await expect(
      coursePage.default({ ...params("000001", "CSC-221"), searchParams: Promise.resolve({}) }),
    ).rejects.toMatchObject(NOT_FOUND);
    await expect(
      coursePage.default({
        ...params("202602", "not-a-course"),
        searchParams: Promise.resolve({}),
      }),
    ).rejects.toMatchObject(NOT_FOUND);
    await expect(coursePage.generateMetadata(params("2026", "CSC-221"))).rejects.toMatchObject(
      NOT_FOUND,
    );
    expect(state.resolveCalls).toEqual([]);
  });

  it("is a 404 when the catalog has no such course", async () => {
    state.resolved = null;
    await expect(
      coursePage.default({ ...params("202602", "XYZ-999"), searchParams: Promise.resolve({}) }),
    ).rejects.toMatchObject(NOT_FOUND);
    expect(state.resolveCalls).toEqual([{ term: "202602", code: "XYZ 999" }]);
  });

  it("renders the course, passing ?crn= through, with metadata", async () => {
    state.resolved = resolved();
    state.page = pageData();
    await expect(coursePage.generateMetadata(params("202602", "csc-221"))).resolves.toEqual({
      title: "CSC 221 · Spring 2027",
      description: "Data Structures",
    });
    render(
      await coursePage.default({
        ...params("202602", "CSC-221"),
        searchParams: Promise.resolve({ crn: "20136" }),
      }),
    );
    expect(state.loadCalls[0]).toMatchObject({ requestedCrn: "20136" });
    expect(screen.getByRole("heading", { level: 1, name: "Data Structures" })).toBeVisible();
    const crumbs = screen.getByRole("navigation", { name: "Breadcrumb" });
    expect(within(crumbs).getByRole("link", { name: "Computer Science" })).toHaveAttribute(
      "href",
      "/courses?term=202602&dept=CSC",
    );
    expect(screen.getByRole("region", { name: "Add to plan" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Add to Spring 2027" })).toBeVisible();
    expect(screen.getByRole("region", { name: /Sections/ })).toBeVisible();
    expect(screen.getByRole("region", { name: "Other terms" })).toBeVisible();
    // AI off or not configured: no panel at all.
    expect(screen.queryByTestId("course-about-ai")).toBeNull();
  });

  it("ignores a malformed ?crn=", async () => {
    state.resolved = resolved();
    state.page = pageData();
    render(
      await coursePage.default({
        ...params("202602", "CSC-221"),
        searchParams: Promise.resolve({ crn: "<script>" }),
      }),
    );
    expect(state.loadCalls[0]).toMatchObject({ requestedCrn: null });
  });

  it("shows the AI panel's gate when AI is on but the student must verify", async () => {
    state.resolved = resolved();
    state.page = { ...pageData(), aboutGate: "unverified" };
    render(
      await coursePage.default({
        ...params("202602", "CSC-221"),
        searchParams: Promise.resolve({}),
      }),
    );
    expect(screen.getByTestId("course-about-ai")).toHaveTextContent("Verify your Davidson email");
  });
});
