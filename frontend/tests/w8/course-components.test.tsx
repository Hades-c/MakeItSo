import { render as rtlRender, screen, within } from "@testing-library/react";
import { TooltipProvider } from "@/components/ui/tooltip";
import { describe, expect, it, vi } from "vitest";
import { CourseSections, SectionItem } from "@/app/(hub)/courses/_components/course-sections";
import {
  InstructorRatings,
  ratedInstructors,
} from "@/app/(hub)/courses/_components/instructor-ratings";
import {
  CourseAboutCard,
  CourseHeader,
  CourseWeekCard,
  OtherTermsCard,
} from "@/app/(hub)/courses/_components/course-cards";
import { CourseRow } from "@/app/(hub)/courses/_components/course-row";
import { CourseFilters } from "@/app/(hub)/courses/_components/course-filters";
import { parseCoursesQuery } from "@/app/(hub)/courses/_lib/query";
import { ratingsLookup } from "@/app/(hub)/courses/_lib/ratings";
import { weekView } from "@/app/(hub)/courses/_lib/week";
import { requirementGroups } from "@/app/(hub)/courses/_lib/format";
import { registerAsLink } from "@/app/(hub)/courses/_lib/sections";
import type { CourseRow as Row } from "@/app/(hub)/courses/_lib/search";
import type { Availability } from "@/lib/types/catalog";
import { detectConflicts } from "@/server/plan";
import { seenText, spokenText } from "../helpers/text";
import { course, planItem, section, withSection } from "./helpers";

/** The app wraps every page in a TooltipProvider (some course components use tooltips). */
const render = (ui: React.ReactElement) => rtlRender(<TooltipProvider>{ui}</TooltipProvider>);

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }));

/** The course pages' server-rendered parts, on real fixture sections (PLAN §5 "Sections" rules). */

describe("SectionItem", () => {
  const csc = course("202602", "CSC 221");

  it("shows CRN, meetings, room, instructors, seats and the notes verbatim", () => {
    const a = csc.sections[0]!;
    render(<SectionItem section={a} course={csc} chosen={false} sectionHref="/x" />);
    const item = screen.getByRole("article", { name: "Section A, CRN 20135" });
    expect(within(item).getByText("Mon · Wed · Fri 10:30a–11:20a")).toBeVisible();
    expect(within(item).getByText("Watson Life Sciences Building 247")).toBeVisible();
    expect(within(item).getByText("Katy Williams")).toBeVisible();
    expect(within(item).getByText(/of 24 open/)).toBeVisible();
    expect(within(item).getByTestId("section-notes").textContent).toBe(a.notes.join(""));
    expect(
      within(item).getByRole("link", { name: /^Show in my week\s*\(section A\)$/ }),
    ).toHaveAttribute("href", "/x");
  });

  it("marks the chosen section and drops its link", () => {
    render(<SectionItem section={csc.sections[0]!} course={csc} chosen sectionHref="/x" />);
    expect(screen.getByText("Shown in your week")).toBeVisible();
    expect(screen.queryByRole("link", { name: /Show in my week/ })).toBeNull();
  });

  it("says Time TBA, Staff (TBA) and Over-enrolled", () => {
    const rus = course("202602", "RUS 496");
    const s = withSection(rus.sections[0]!, {
      meetings: [],
      enrollment: { current: 14, max: 12, remaining: -2 },
    });
    render(<SectionItem section={s} course={rus} chosen={false} sectionHref="/x" />);
    expect(screen.getByText("Time TBA")).toBeVisible();
    expect(screen.getByText("Staff (TBA)")).toBeVisible();
    expect(screen.getByText("Over-enrolled")).toBeVisible();
  });

  it("sends a max-0 cross-listing to its sibling and flags restrictions", () => {
    const env = course("202601", "ENV 214");
    const a = env.sections.find((s) => s.section === "A")!;
    const phy = section("202601", "PHY 214", "A");
    render(
      <SectionItem
        section={a}
        course={env}
        chosen={false}
        sectionHref="/x"
        registerAs={registerAsLink(phy)}
      />,
    );
    expect(screen.getByTestId("register-as")).toHaveTextContent(
      `Register as PHY 214 A (CRN ${phy.crn})`,
    );
    expect(screen.getByRole("link", { name: "PHY 214 A" })).toHaveAttribute(
      "href",
      `/courses/202601/PHY-214?crn=${phy.crn}`,
    );
    expect(screen.getByText("No seats in this listing")).toBeVisible();
  });

  it("lists the hidden registration sections (CHE 430 A → BIO 395 A)", () => {
    const che = course("202602", "CHE 430");
    render(<SectionItem section={che.sections[0]!} course={che} chosen={false} sectionHref="/x" />);
    expect(screen.getByTestId("registration-sections")).toHaveTextContent(
      "Also registrable as BIO 395 A (CRN 20083)",
    );
  });

  it("shows restriction flags from the notes", () => {
    const art = course("202602", "ART 101");
    render(<SectionItem section={art.sections[0]!} course={art} chosen={false} sectionHref="/x" />);
    expect(
      within(screen.getByRole("list", { name: "Restrictions" })).getByText(
        "First-years and sophomores only until the first day of class",
      ),
    ).toBeVisible();
  });

  const rmp = {
    legacyId: 1234,
    avgRating: 4.2,
    numRatings: 17,
    avgDifficulty: 3,
    wouldTakeAgainPct: 80,
    department: "Computer Science",
    url: "https://www.ratemyprofessors.com/professor/1234",
    asOf: "2026-09-28T10:00:00.000Z",
    topTags: [
      { tag: "Participation matters", count: 12 },
      { tag: "Get ready to read", count: 9 },
      { tag: "Caring", count: 8 },
      { tag: "Respected", count: 5 },
    ],
    tagRatingsCounted: 17,
    // Counted the day after the roster's asOf: the tags line says its own date.
    tagsAsOf: "2026-09-29T10:05:00.000Z",
  } as const;

  it("lists a section's instructors by name only, even with a matched rating", () => {
    const instructor = csc.sections[0]!.instructors[0]!;
    render(
      <CourseSections
        course={csc}
        chosenCrn={null}
        ratings={ratingsLookup([
          { instructor, status: "matched", rmp: { ...rmp, topTags: [...rmp.topTags] } },
        ])}
        sectionHref={(crn) => `/c?crn=${crn}`}
        asOf={null}
      />,
    );
    for (const row of screen.getAllByRole("article")) {
      const names = within(row).getByRole("list", { name: "Instructors" });
      expect(seenText(names)).toBe("Katy Williams");
      // No rating, difficulty, RMP tag or link on the row: all of it is in the block, once.
      expect(row.querySelector('[data-aggregated="ratemyprofessors"]')).toBeNull();
      expect(row.querySelector('[data-source="ratemyprofessors"]')).toBeNull();
      expect(row).not.toHaveTextContent(/ratings|Difficulty|RateMyProfessors|RMP/);
    }
  });

  it("renders every section in a tagged card", () => {
    render(
      <CourseSections
        course={csc}
        chosenCrn="20136"
        ratings={null}
        sectionHref={(crn) => `/c?crn=${crn}`}
        asOf={null}
      />,
    );
    const card = screen.getByRole("region", { name: /Sections/ });
    expect(card).toHaveAttribute("data-aggregated", "course-schedule");
    expect(within(card).getAllByRole("article")).toHaveLength(2);
    expect(
      within(card).getByRole("link", { name: /^Show in my week\s*\(section A\)$/ }),
    ).toHaveAttribute("href", "/c?crn=20135");
    // No ratings (RMP_ENABLED off): the footnote does not promise them.
    expect(card).toHaveTextContent("Seats and notes as the Registrar publishes them.");
    expect(card).not.toHaveTextContent(/RateMyProfessors/);
  });

  it("lists each rated instructor once under the sections, with what RMP says about them", () => {
    const instructor = csc.sections[0]!.instructors[0]!;
    expect(csc.sections.every((s) => s.instructors.some((i) => i.last === instructor.last))).toBe(
      true,
    );
    render(
      <CourseSections
        course={csc}
        chosenCrn={null}
        ratings={ratingsLookup([
          { instructor, status: "matched", rmp: { ...rmp, topTags: [...rmp.topTags] } },
        ])}
        sectionHref={(crn) => `/c?crn=${crn}`}
        asOf={null}
      />,
    );
    const list = screen.getByRole("list", { name: "Instructors on RateMyProfessors" });
    const items = within(list).getAllByRole("listitem");
    expect(items).toHaveLength(1);
    const item = items[0]!;
    expect(item).toHaveAttribute("data-aggregated", "ratemyprofessors");
    expect(within(item).getByText(`${instructor.first} ${instructor.last}`)).toBeVisible();
    // The source is said once per instructor: one provenance line, the date and the profile link.
    expect(seenText(item)).toBe(
      "Katy Williams 4.2 / 5 17 ratings · Difficulty 3.0 of 5 · 80% would take again " +
        "Most common tags (from 17 ratings, as of Sep 29, 2026): Participation matters (12), " +
        "Get ready to read (9), Caring (8) as of Sep 28, 2026 · RateMyProfessors",
    );
    expect(spokenText(item)).toContain(
      "Rating 4.2 out of 5 17 ratings for Katy Williams, Difficulty 3.0 of 5, 80% would take again " +
        "Most common tags (from 17 ratings, as of Sep 29, 2026): Participation matters (12 ratings), " +
        "Get ready to read (9 ratings), Caring (8 ratings) as of Sep 28, 2026, " +
        "Source: RateMyProfessors",
    );
    expect(within(item).getByText("as of Sep 28, 2026")).toBeVisible();
    expect(item.querySelectorAll('[data-source="ratemyprofessors"]')).toHaveLength(1);
    expect(within(item).getAllByRole("link")).toHaveLength(1);
    expect(
      within(item).getByRole("link", {
        name: "Source: RateMyProfessors, Katy Williams’s page (opens in a new tab)",
      }),
    ).toHaveAttribute("href", rmp.url);
    // Both sections are hers, and the rating appears once on the page, in the block.
    expect(document.querySelectorAll("[data-rating]")).toHaveLength(1);
    expect(screen.getAllByText(/would take again/)).toHaveLength(1);
    expect(document.querySelectorAll('[data-aggregated="ratemyprofessors"]')).toHaveLength(1);
    // The matching rule, once, under the sections.
    expect(screen.getAllByText(/matches the instructor’s full name/)).toHaveLength(1);
  });

  it("is its own block, fed a de-duplicated instructor list, so the page can move it", () => {
    // Two sections taught by the same instructor, one by a second, one by Staff: two entries, in section order.
    const katy = csc.sections[0]!.instructors[0]!;
    const sam = { first: "Sam", last: "Okafor", isStaff: false };
    const staff = { first: "Staff", last: "", isStaff: true };
    const sections = [
      { ...csc.sections[0]!, instructors: [katy] },
      { ...csc.sections[1]!, instructors: [sam, katy] },
      { ...csc.sections[0]!, crn: "20999", instructors: [staff] },
    ];
    const lookup = ratingsLookup([
      { instructor: katy, status: "matched", rmp: { ...rmp, topTags: [...rmp.topTags] } },
      { instructor: sam, status: "matched", rmp: { ...rmp, legacyId: 99, topTags: [] } },
    ]);
    const rated = ratedInstructors(sections, lookup);
    expect(rated.map((r) => r.instructor.last)).toEqual([katy.last, "Okafor"]);
    expect(ratedInstructors(sections, null)).toEqual([]);
    const { container } = render(<InstructorRatings instructors={rated} className="mt-9" />);
    const block = screen.getByTestId("instructor-ratings");
    expect(block).toHaveClass("mt-9");
    expect(within(block).getAllByRole("listitem")).toHaveLength(2);
    // Placed twice (per section row, say), each list is named by its own heading.
    const twice = render(
      <>
        <InstructorRatings instructors={rated.slice(0, 1)} />
        <InstructorRatings instructors={rated.slice(1)} />
      </>,
    );
    const lists = within(twice.container).getAllByRole("list", {
      name: "Instructors on RateMyProfessors",
    });
    expect(lists).toHaveLength(2);
    expect(lists[0]!.getAttribute("aria-labelledby")).not.toBe(
      lists[1]!.getAttribute("aria-labelledby"),
    );
    expect(within(lists[1]!).getAllByRole("listitem")).toHaveLength(1);
    twice.unmount();
    // Nothing at all without a rated instructor.
    container.remove();
    const empty = render(<InstructorRatings instructors={[]} />);
    expect(empty.container).toBeEmptyDOMElement();
  });

  it("lists no instructors without a shown rating", () => {
    const instructor = csc.sections[0]!.instructors[0]!;
    render(
      <CourseSections
        course={csc}
        chosenCrn={null}
        ratings={ratingsLookup([
          { instructor, status: "matched", rmp: { ...rmp, numRatings: 0, topTags: [] } },
        ])}
        sectionHref={(crn) => `/c?crn=${crn}`}
        asOf={null}
      />,
    );
    expect(screen.queryByTestId("instructor-ratings")).toBeNull();
  });

  it("mentions ratings only when ratings are shown", () => {
    render(
      <CourseSections
        course={csc}
        chosenCrn={null}
        ratings={ratingsLookup([])}
        sectionHref={(crn) => `/c?crn=${crn}`}
        asOf={null}
      />,
    );
    expect(screen.getByRole("region", { name: /Sections/ })).toHaveTextContent(
      "ratings only where a RateMyProfessors profile matches the instructor’s full name.",
    );
  });
});

describe("course cards", () => {
  const csc = course("202602", "CSC 221");

  it("header: the index card with the chosen section's facts and seats", () => {
    render(
      <CourseHeader
        course={csc}
        term="202602"
        chosen={csc.sections[1]!}
        departmentName="Computer Science"
        asOf="2026-09-30T16:00:00.000Z"
        offered
      />,
    );
    expect(screen.getByRole("heading", { level: 1, name: "Data Structures" })).toBeVisible();
    expect(screen.getByText("CSC 221 B")).toBeVisible();
    expect(screen.getByText("CRN 20136")).toBeVisible();
    expect(screen.getByText("Mon · Wed · Fri 11:30a–12:20p")).toBeVisible();
    expect(screen.getByText("1 course credit")).toBeVisible();
    expect(screen.getByText("Prerequisites listed below")).toBeVisible();
    expect(screen.getByText(/of 24 seats open/)).toBeVisible();
    expect(screen.getByRole("link", { name: "Add to plan" })).toHaveAttribute(
      "href",
      "#add-to-plan",
    );
  });

  it("header: a course already planned for this term jumps to the plan state instead of offering Add to plan", () => {
    render(
      <CourseHeader
        course={csc}
        term="202602"
        chosen={csc.sections[0]!}
        departmentName="Computer Science"
        asOf={null}
        offered
        inPlan
      />,
    );
    expect(screen.queryByRole("link", { name: "Add to plan" })).toBeNull();
    expect(screen.getByRole("link", { name: "In your plan · Spring 2027" })).toHaveAttribute(
      "href",
      "#add-to-plan",
    );
  });

  it("header: says when the course is not on this term's schedule", () => {
    render(
      <CourseHeader
        course={course("202601", "HIS 357")}
        term="202602"
        chosen={null}
        departmentName="History"
        asOf={null}
        offered={false}
      />,
    );
    expect(screen.getByTestId("not-offered-here")).toHaveTextContent(
      "Not on the Spring 2027 schedule. Shown from Fall 2026.",
    );
  });

  it("about: official description, requirements, prerequisites and programs", () => {
    render(
      <CourseAboutCard
        course={csc}
        requirements={[{ code: "MQRQ", name: "Mathematical and Quantitative Thought" }]}
        programs={{
          matches: [
            {
              name: "Major in Computer Science (B.S. Degree)",
              kind: "major",
              url: "https://catalog.davidson.edu/preview_program.php?catoid=4&poid=1",
            },
          ],
          pagesRead: 3,
          pagesTotal: 52,
        }}
        disclaimer="Unofficial — verify in Degree Works"
        asOf={null}
      />,
    );
    expect(screen.getByTestId("course-description")).toHaveTextContent(/abstract data types/);
    expect(screen.getByTestId("course-prerequisites")).toHaveTextContent(
      "CSC/DIG 120, CSC 121, BIO/CSC 209, PHY 240, or permission of instructor.",
    );
    expect(screen.getByTestId("course-requirements")).toHaveTextContent(
      "Mathematical and Quantitative Thought MQRQ",
    );
    const programs = screen.getByTestId("also-counts-for");
    expect(
      within(programs).getByRole("link", { name: /Major in Computer Science/ }),
    ).toHaveAttribute("rel", "noopener noreferrer");
    expect(programs).toHaveTextContent("Based on 3 of 52 program pages");
  });

  it("about: makes no negative 'Also counts for' claim until every program page has been read", () => {
    const his = course("202601", "HIS 357");
    const { rerender } = render(
      <CourseAboutCard
        course={his}
        requirements={[]}
        programs={{ matches: [], pagesRead: 1, pagesTotal: 51 }}
        disclaimer="d"
        asOf={null}
      />,
    );
    const programs = screen.getByTestId("also-counts-for");
    expect(screen.getByTestId("programs-incomplete")).toHaveTextContent(
      "Not every program page in the catalog has been read yet.",
    );
    expect(programs).not.toHaveTextContent(/names this course/);
    expect(programs).toHaveTextContent("Based on 1 of 51 program pages");
    rerender(
      <CourseAboutCard
        course={his}
        requirements={[]}
        programs={{ matches: [], pagesRead: 51, pagesTotal: 51 }}
        disclaimer="d"
        asOf={null}
      />,
    );
    expect(screen.getByTestId("also-counts-for")).toHaveTextContent(
      "No major or minor in the catalog names this course.",
    );
  });

  it("about: no prerequisites, no requirement data, no programs", () => {
    const his = course("202601", "HIS 357");
    render(
      <CourseAboutCard course={his} requirements={[]} programs={null} disclaimer="d" asOf={null} />,
    );
    expect(screen.getByTestId("course-prerequisites")).toHaveTextContent("None listed");
    expect(screen.getByTestId("course-requirements")).toHaveTextContent(
      "No requirement data in the schedule",
    );
    expect(screen.getByTestId("also-counts-for")).toHaveTextContent("can’t be read right now");
  });

  it("other terms: newest first, links offered terms, never a bare Offered for unpublished", () => {
    const history: Availability[] = [
      { termCode: "202601", status: "offered", sectionCount: 2 },
      { termCode: "202602", status: "offered", sectionCount: 2 },
      {
        termCode: "202701",
        status: "not-yet-published",
        usually: { season: "Fall", basedOn: ["202501", "202601"] },
      },
      { termCode: "202502", status: "not-offered" },
    ];
    render(<OtherTermsCard code="CSC 221" term="202602" history={history} />);
    const rows = within(screen.getByTestId("other-terms")).getAllByRole("listitem");
    expect(rows.map((row) => row.getAttribute("data-term"))).toEqual([
      "202701",
      "202602",
      "202601",
      "202502",
    ]);
    expect(rows[0]).toHaveTextContent("Not yet published");
    expect(rows[0]).toHaveTextContent("Usually offered in Fall (based on Fall 2025 and Fall 2026)");
    expect(rows[0]).not.toHaveTextContent(/Offered ·/);
    expect(rows[1]).toHaveTextContent("(this page)");
    expect(within(rows[2]!).getByRole("link", { name: "Fall 2026" })).toHaveAttribute(
      "href",
      "/courses/202601/CSC-221",
    );
    expect(within(rows[3]!).queryByRole("link")).toBeNull();
  });

  it("week: the grid with the chosen section, conflicts and unplaced items", () => {
    const a = csc.sections[0]!;
    const bio = section("202602", "BIO 201", "A");
    const view = weekView({ planned: [bio], chosen: a, conflicts: detectConflicts([bio, a]) });
    render(
      <CourseWeekCard
        code="CSC 221"
        term="202602"
        chosen={a}
        week={{
          view,
          unplaced: [planItem({ courseCode: "ECO 101" })],
          plannedOtherSection: null,
        }}
      />,
    );
    const card = screen.getByTestId("course-week");
    expect(card).toHaveAttribute("data-aggregated", "my-plan");
    expect(within(card).getByText("1 conflict")).toBeVisible();
    expect(card).toHaveTextContent("with CSC 221 A dashed (not in your plan yet)");
    expect(within(card).getAllByTestId("week-grid")).toHaveLength(1);
    expect(within(card).getByRole("link", { name: "ECO 101" })).toHaveAttribute(
      "href",
      "/courses/202602/ECO-101",
    );
  });

  it("week: no conflicts", () => {
    const a = csc.sections[0]!;
    render(
      <CourseWeekCard
        code="CSC 221"
        term="202602"
        chosen={a}
        week={{
          view: weekView({ planned: [a], chosen: a, conflicts: [] }),
          unplaced: [],
          plannedOtherSection: "CSC 221 B",
        }}
      />,
    );
    expect(screen.getByText("No conflicts")).toBeVisible();
    expect(screen.getByText(/Your plan has CSC 221 B/)).toBeVisible();
  });
});

describe("review fixes: course page parts", () => {
  const csc = course("202602", "CSC 221");

  it("week: 'No conflicts among chosen sections' while some courses have no section", () => {
    const a = csc.sections[0]!;
    render(
      <CourseWeekCard
        code="CSC 221"
        term="202602"
        chosen={a}
        week={{
          view: weekView({ planned: [a], chosen: a, conflicts: [] }),
          unplaced: [planItem({ courseCode: "BIO 201" })],
          plannedOtherSection: null,
        }}
      />,
    );
    expect(screen.getByText("No conflicts among chosen sections")).toBeVisible();
    expect(screen.queryByText("No conflicts")).toBeNull();
    expect(screen.getByText(/not checked for conflicts/)).toBeVisible();
    // The heading is a focus target for "Show in my week".
    expect(screen.getByRole("heading", { name: "Your week with CSC 221" })).toHaveAttribute(
      "tabindex",
      "-1",
    );
  });

  it("about: lists requirements per section when NONE and 'no data' sections differ", () => {
    const mus = course("202601", "MUS 357");
    const groups = requirementGroups(mus.sections).map((group) => ({
      sections: group.sections,
      reqs: group.reqCodes?.map((code) => ({ code, name: `name of ${code}` })) ?? null,
    }));
    render(
      <CourseAboutCard
        course={mus}
        requirements={[{ code: "NONE", name: "name of NONE" }]}
        requirementsBySection={groups}
        programs={{ matches: [], pagesRead: 0, pagesTotal: 51 }}
        disclaimer="d"
        asOf={null}
      />,
    );
    const list = screen.getByTestId("requirements-by-section");
    expect(list).toHaveTextContent("Section Aname of NONE NONE");
    expect(list).toHaveTextContent("Sections B, CNo requirement data in the schedule");
    // No program pages read yet: say so instead of a negative answer.
    expect(screen.getByTestId("programs-not-read")).toHaveTextContent(
      "The catalog’s program pages haven’t been read yet.",
    );
    expect(screen.getByTestId("also-counts-for")).not.toHaveTextContent(/names this course/);
  });

  it("chips holding free text wrap instead of overflowing", () => {
    render(
      <CourseAboutCard
        course={csc}
        requirements={[{ code: "NONE", name: "Not approved for any Ways of Knowing requirement" }]}
        programs={null}
        disclaimer="d"
        asOf={null}
      />,
    );
    const chip = screen.getByText(/Not approved for any Ways/).closest("span.rounded-full")!;
    expect(chip.className).toMatch(/whitespace-normal/);
    expect(chip.className).not.toMatch(/whitespace-nowrap/);
  });

  it("registration-only listing: names the course's title", () => {
    const base = csc.sections[0]!;
    const reg = withSection(base, { regFor: "CHE 430" });
    render(
      <SectionItem
        section={reg}
        course={csc}
        chosen={false}
        sectionHref="/x"
        regForTitle="Advanced Biochemistry"
      />,
    );
    expect(screen.getByRole("link", { name: "Advanced Biochemistry (CHE 430)" })).toHaveAttribute(
      "href",
      "/courses/202602/CHE-430",
    );
  });
});

describe("/courses parts", () => {
  const row: Row = {
    summary: {
      termCode: "202602",
      code: "WRI 101",
      title: "Writing Program: topics vary by section",
      topics: true,
      credits: [1],
      reqCodes: ["COMP"],
      sectionCount: 5,
      openSeats: 0,
      instructorNames: ["A B"],
      crossListings: [],
      hasTba: false,
    },
    href: "/courses/202602/WRI-101",
    reqs: [{ code: "COMP", name: "Writing (Composition)" }],
    sections: [
      {
        crn: "20500",
        section: "A",
        title: "Sports Betting and Society",
        times: ["MWF 9:30a–10:20a"],
        instructors: ["A B"],
        registerAs: null,
        flags: ["Closed if you have met the writing requirement"],
      },
    ],
    moreSections: 4,
    add: {
      terms: [{ code: "202602", label: "Spring 2027", availability: "offered", sectionCount: 5 }],
      initialTerm: "202602",
      inPlanTerms: [],
      warnings: { "202602": ["Already completed in Fall 2025 — plan a retake?"] },
      unpublishedNote: null,
    },
  };

  it("a result row: topics, requirement names, seats, sections, warnings, tagged", () => {
    render(<CourseRow row={row} currentTerm="202601" planHref="/plan" loginHref="/login" />);
    const article = screen.getByRole("article", {
      name: /Writing Program: topics vary by section/,
    });
    expect(article).toHaveAttribute("data-aggregated", "course-schedule");
    expect(within(article).getByText("Sports Betting and Society")).toBeVisible();
    expect(within(article).getByText("Writing (Composition)")).toBeVisible();
    expect(within(article).getByTestId("row-seats")).toHaveTextContent("No open seats");
    expect(
      within(article).getByText("Closed if you have met the writing requirement"),
    ).toBeVisible();
    expect(within(article).getByText("+ 4 sections more on the course page")).toBeVisible();
    expect(within(article).getByTestId("add-warnings")).toHaveTextContent("plan a retake?");
    expect(within(article).getByRole("link", { name: /Writing Program/ })).toHaveAttribute(
      "href",
      "/courses/202602/WRI-101",
    );
  });

  it("a row whose availability cannot be read says so", () => {
    render(
      <CourseRow
        row={{ ...row, add: null }}
        currentTerm="202601"
        planHref="/plan"
        loginHref="/l"
      />,
    );
    expect(screen.getByTestId("availability-unknown")).toBeVisible();
  });

  it("the filters form: a GET form over every URL param, open while filters are set", () => {
    const { query } = parseCoursesQuery({
      q: "data",
      dept: ["CSC", "MAT"],
      days: "M",
      openOnly: "true",
    });
    render(
      <CourseFilters
        query={query}
        term="202602"
        termOptions={[
          { code: "202602", label: "Spring 2027 (registration)" },
          { code: "202601", label: "Fall 2026 (current)" },
        ]}
        filters={{
          term: "202602",
          departments: [
            { code: "CSC", name: "Computer Science" },
            { code: "MAT", name: "Mathematics" },
          ],
          requirements: [{ code: "MQRQ", name: "Math & Quantitative Thought" }],
        }}
      />,
    );
    const form = screen.getByRole("form", { name: "Course search" });
    expect(form).toHaveAttribute("method", "get");
    expect(form).toHaveAttribute("action", "/courses");
    expect(screen.getByLabelText("Search the schedule")).toHaveValue("data");
    expect(screen.getByLabelText("Term")).toHaveValue("202602");
    expect(screen.getByLabelText("Department")).toHaveValue("CSC");
    expect(form.querySelector('input[type="hidden"][name="dept"]')).toHaveValue("MAT");
    expect(screen.getByRole("checkbox", { name: "Monday" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Open seats only" })).toBeChecked();
    expect(form.querySelector("details")).toHaveAttribute("open");
    const active = screen.getByTestId("active-filters");
    expect(within(active).getByRole("link", { name: /Mathematics/ })).toHaveAttribute(
      "href",
      "/courses?term=202602&q=data&dept=CSC&days=M&openOnly=true",
    );
    expect(within(active).getByRole("link", { name: "Clear all" })).toHaveAttribute(
      "href",
      "/courses?term=202602",
    );
  });
});
