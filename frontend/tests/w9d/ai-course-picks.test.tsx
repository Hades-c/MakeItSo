import { screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  AiCoursePicks,
  careerTermLines,
  PAST_OFFERINGS_TEXT,
  pickTermText,
  titleTermOf,
} from "@/app/(hub)/careers/[slug]/_components/ai-course-picks";
import type { Availability } from "@/lib/types/catalog";
import { course, draft, renderFresh, stubFetch } from "./helpers";

/** The career plan's course picks: official titles and live availability from the catalog routes. */

const HISTORY: Availability[] = [
  { termCode: "202501", status: "offered", sectionCount: 2 },
  { termCode: "202502", status: "not-offered" },
  { termCode: "202601", status: "offered", sectionCount: 1 },
  { termCode: "202602", status: "offered", sectionCount: 3 },
  {
    termCode: "202701",
    status: "not-yet-published",
    usually: { season: "Fall", basedOn: ["202501", "202601"] },
  },
];

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("titleTermOf", () => {
  it("prefers the pick's own term when offered, else the latest offered term, else none", () => {
    expect(titleTermOf(HISTORY, "202602")).toBe("202602");
    expect(titleTermOf(HISTORY, "202701")).toBe("202602");
    expect(titleTermOf(HISTORY, "202502")).toBe("202602");
    expect(titleTermOf([{ termCode: "202602", status: "not-offered" }], "202602")).toBeNull();
    expect(titleTermOf([], "202602")).toBeNull();
  });
});

describe("pickTermText", () => {
  it("offered (with sections) / not offered", () => {
    expect(pickTermText(HISTORY, "202602")).toBe("Offered in Spring 2027 (3 sections)");
    expect(pickTermText(HISTORY, "202601")).toBe("Offered in Fall 2026 (1 section)");
    expect(pickTermText(HISTORY, "202502")).toBe("Not offered in Spring 2026");
  });

  it("an unpublished term is never a bare 'Offered'; past-offerings basis and 'usually offered' are said", () => {
    expect(pickTermText(HISTORY, "202701", "past-offerings")).toBe(
      `Fall 2027: ${PAST_OFFERINGS_TEXT}. Usually offered in Fall (based on Fall 2025 and Fall 2026)`,
    );
    expect(pickTermText(HISTORY, "202701")).toBe(
      "Fall 2027 isn’t published yet. Usually offered in Fall (based on Fall 2025 and Fall 2026)",
    );
    // A term past the history window (e.g. Fall 2028): no claim beyond the basis.
    expect(pickTermText(HISTORY, "202801", "past-offerings")).toBe(
      `Fall 2028: ${PAST_OFFERINGS_TEXT}`,
    );
    expect(pickTermText(HISTORY, "202801")).toBe("Fall 2028 isn’t published yet");
    expect(pickTermText(HISTORY, "202701")).not.toMatch(/^Offered/);
  });
});

describe("careerTermLines", () => {
  it("one line per career term the history reports; unknown terms left out", () => {
    expect(careerTermLines(HISTORY, ["202601", "202602", "202701", "202702"])).toEqual([
      "Fall 2026: Offered (1 section)",
      "Spring 2027: Offered (3 sections)",
      "Fall 2027: Not yet published",
    ]);
  });
});

describe("AiCoursePicks", () => {
  const picks = [
    { courseCode: "CSC 221", termCode: "202602", reason: "Core data structures." },
    { courseCode: "CSC 353", termCode: "202701", reason: "Systems background." },
    { courseCode: "MAT 150", termCode: "202602", reason: "Math foundations." },
  ];

  it("shows each pick's official catalog title, term status and source tag; never a model title", async () => {
    const calls = stubFetch((url) => {
      if (url.pathname === "/api/catalog/availability") {
        const code = url.searchParams.get("code");
        if (code === "CSC 221") return [200, { code, availability: HISTORY }];
        if (code === "CSC 353") {
          return [
            200,
            {
              code,
              availability: [
                { termCode: "202601", status: "offered", sectionCount: 1 },
                { termCode: "202602", status: "not-offered" },
                { termCode: "202701", status: "not-yet-published" },
              ],
            },
          ];
        }
        return [503, { error: { code: "unavailable", message: "down" } }];
      }
      if (url.pathname === "/api/catalog/courses/202602/CSC-221")
        return [200, course("202602", "CSC 221", "Data Structures")];
      if (url.pathname === "/api/catalog/courses/202601/CSC-353")
        return [200, course("202601", "CSC 353", "Operating Systems")];
      return undefined;
    });
    renderFresh(
      <AiCoursePicks
        picks={picks}
        draft={draft(
          picks.map((p) => ({
            ...p,
            basis: p.termCode === "202701" ? "past-offerings" : "scheduled",
          })),
        )}
        careerTerms={["202601", "202602", "202701"]}
      />,
    );

    const rows = await screen.findAllByTestId("ai-course-pick");
    expect(rows).toHaveLength(3);
    const csc221 = rows[0]!;
    expect(await within(csc221).findByRole("link", { name: "Data Structures" })).toHaveAttribute(
      "href",
      "/courses/202602/CSC-221",
    );
    expect(within(csc221).getByTestId("ai-course-term")).toHaveTextContent(
      "Offered in Spring 2027 (3 sections)",
    );
    expect(within(csc221).getByText("Source:", { exact: false })).toBeInTheDocument();
    expect(within(csc221).getByRole("list", { name: "Availability by term" })).toHaveTextContent(
      "Fall 2026: Offered (1 section)",
    );

    const csc353 = rows[1]!;
    expect(await within(csc353).findByRole("link", { name: "Operating Systems" })).toHaveAttribute(
      "href",
      "/courses/202601/CSC-353",
    );
    expect(within(csc353).getByTestId("ai-course-term")).toHaveTextContent(
      `Fall 2027: ${PAST_OFFERINGS_TEXT}`,
    );

    // The catalog failed for MAT 150: said in words, no title invented.
    const mat = rows[2]!;
    expect(
      await within(mat).findByText("The schedule for this course couldn’t be loaded."),
    ).toBeInTheDocument();
    expect(within(mat).queryByTestId("ai-course-title")).toBeNull();
    expect(within(mat).getByText("Math foundations.")).toBeInTheDocument();

    // Only the public catalog routes were read.
    expect(calls.every((c) => c.method === "GET" && c.path.startsWith("/api/catalog/"))).toBe(true);
  });
});
