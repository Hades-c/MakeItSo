import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
  checkedWords,
  OnCampusCard,
  summerLabel,
  SummersCard,
} from "@/app/(hub)/careers/_components/career-activities";
import { resolveSummers, verifiedRange } from "@/app/(hub)/careers/_lib/activities";
import type { CareerOnCampus, CareerSummer } from "@/lib/types/content";
import { getCareer } from "@/server/content/careers";
import { getProgram, OFFICES, PROGRAMS } from "@/server/content/offices";

/**
 * The career page's "On campus" and "Summers" cards (owner request, 2026-10-29): quiet provenance per the adopted
 * rule (one SourceLine for a single-source list, "via …" per run of rows in a mixed one), new-tab links that say so,
 * office programs shown with their own published audience and deadlines, and no card when a path has none.
 */

const SE = getCareer("software-engineering")!;

describe("resolveSummers", () => {
  it("resolves an office program to its own record and keeps an outside program's fields", () => {
    const views = resolveSummers(SE.summer, PROGRAMS, OFFICES);
    expect(views.length).toBe(SE.summer!.length);
    const locke = views.find((v) => v.key === "program:locke-white-jr-internship-fund")!;
    const program = getProgram("locke-white-jr-internship-fund")!;
    expect(locke).toMatchObject({
      name: program.name,
      url: program.url,
      audience: program.audience,
      source: "matthews-center",
      officeName: null,
      by: null,
      verifiedAt: program.verifiedAt,
    });
    const reu = views.find((v) => v.name.startsWith("NSF Research Experiences"))!;
    expect(reu).toMatchObject({
      source: null,
      by: "National Science Foundation",
      timing: { label: "Timing", text: expect.stringContaining("January–March") },
    });
  });

  it("names the office for a DAVIDSON OFFICES program and shows its deadlines as published", () => {
    const entries: CareerSummer[] = [
      { kind: "program", program: "abernethy-endowment-grant", description: "Research grant." },
    ];
    const [view] = resolveSummers(entries, PROGRAMS, OFFICES);
    expect(view).toMatchObject({
      source: "davidson-offices",
      officeName: "Undergraduate Research",
      timing: { label: "Deadlines", text: getProgram("abernethy-endowment-grant")!.deadlineText },
    });
    expect(summerLabel(view!)).toBe("via Undergraduate Research");
  });

  it("renders nothing for a slug no program has, and nothing for no entries", () => {
    expect(
      resolveSummers(
        [{ kind: "program", program: "no-such-program", description: "x" }],
        PROGRAMS,
        OFFICES,
      ),
    ).toEqual([]);
    expect(resolveSummers(undefined, PROGRAMS, OFFICES)).toEqual([]);
  });

  it("states one check day, or the range", () => {
    expect(verifiedRange([])).toBeNull();
    expect(checkedWords([{ verifiedAt: "2026-10-29" }, { verifiedAt: "2026-10-29" }])).toBe(
      "checked Oct 29, 2026",
    );
    expect(checkedWords([{ verifiedAt: "2026-10-29" }, { verifiedAt: "2026-09-30" }])).toBe(
      "checked between Sep 30, 2026 and Oct 29, 2026",
    );
  });
});

describe("OnCampusCard", () => {
  it("lists WildcatSync organizations under one source line, links opening in a new tab", () => {
    render(<OnCampusCard entries={SE.onCampus} />);
    const card = screen.getByRole("region", { name: "On campus" });
    expect(within(card).getByRole("heading", { level: 2, name: "On campus" })).toHaveClass(
      "font-display",
    );
    const rows = within(card).getByTestId("career-on-campus").querySelectorAll("li");
    expect(rows).toHaveLength(SE.onCampus!.length);
    for (const row of rows) {
      expect(row).toHaveAttribute("data-source", "wildcatsync");
      // Single source: no per-row note.
      expect(row.querySelector("[data-source] [data-source]")).toBeNull();
    }
    const acm = within(card).getByRole("link", {
      name: /^Davidson College ACM Student Chapter\s?\(opens in a new tab\)$/,
    });
    expect(acm).toHaveAttribute("href", "https://wildcatsync.davidson.edu/organization/acm");
    expect(acm).toHaveAttribute("target", "_blank");
    expect(acm).toHaveAttribute("rel", "noopener noreferrer");
    // 44px on phones, inline from 720px.
    expect(acm).toHaveClass("min-h-11", "md:min-h-0");
    expect(card.querySelector("[data-provenance]")).toHaveAttribute(
      "data-provenance",
      "wildcatsync",
    );
    expect(within(card).getByTestId("on-campus-source")).toHaveTextContent(
      "From WildcatSync, Davidson’s student organization directory · checked Oct 29, 2026",
    );
  });

  it("names the source per run in a mixed list", () => {
    const entries: CareerOnCampus[] = [
      { ...SE.onCampus![0]! },
      { ...SE.onCampus![1]! },
      {
        name: "Some office group",
        url: "https://www.davidson.edu/offices-and-services/student-activities",
        description: "An office-run group.",
        source: "davidson-offices",
        verifiedAt: "2026-10-29",
      },
    ];
    render(<OnCampusCard entries={entries} />);
    const card = screen.getByRole("region", { name: "On campus" });
    expect(card.querySelector("[data-provenance]")).toBeNull();
    const notes = [...card.querySelectorAll("li [data-source]")];
    expect(notes.map((n) => n.textContent)).toEqual([
      "Source: via WildcatSync",
      "Source: via WildcatSync",
      "Source: via Davidson offices",
    ]);
    expect(notes[1]).toHaveClass("sr-only");
    expect(notes[2]).not.toHaveClass("sr-only");
  });

  it("is left out when a path has none", () => {
    const { container } = render(<OnCampusCard entries={undefined} />);
    expect(container).toBeEmptyDOMElement();
    render(<OnCampusCard entries={[]} />);
    expect(screen.queryByRole("region", { name: "On campus" })).toBeNull();
  });
});

describe("SummersCard", () => {
  it("says each row's source in a mixed list, once per run, with audience and timing", () => {
    const arts = getCareer("arts-museum-curation")!;
    render(<SummersCard views={resolveSummers(arts.summer, PROGRAMS, OFFICES)} />);
    const card = screen.getByRole("region", { name: "Summers" });
    expect(within(card).getByRole("heading", { level: 2, name: "Summers" })).toHaveClass(
      "font-display",
    );
    const rows = [
      ...within(card).getByTestId("career-summers").querySelectorAll<HTMLElement>(":scope > li"),
    ];
    expect(rows).toHaveLength(arts.summer!.length);
    // Three Matthews Center grants: the first says it, the next two only to screen readers; then Getty's own.
    const visible = rows.map((row) =>
      [...row.querySelectorAll("span")]
        .filter((s) => /^Source: /.test(s.textContent ?? "") && !s.classList.contains("sr-only"))
        .map((s) => s.textContent),
    );
    expect(visible).toEqual([
      ["Source: via Matthews Center"],
      [],
      [],
      ["Source: via Getty Foundation"],
    ]);
    expect(
      rows[1]!.querySelector('[data-source="matthews-center"][data-source-run]'),
    ).not.toBeNull();
    // The outside program carries no source id (none covers it), only its words.
    expect(rows[3]).not.toHaveAttribute("data-source");
    expect(rows[0]).toHaveAttribute("data-source", "matthews-center");
    expect(within(rows[3]!).getByText("For")).toBeInTheDocument();
    expect(rows[3]).toHaveTextContent("Timing");
    for (const link of within(card).getAllByRole("link")) {
      expect(link).toHaveAttribute("target", "_blank");
      expect(link).toHaveAccessibleName(/\(opens in a new tab\)$/);
    }
    expect(card).toHaveTextContent("Confirm on the program’s page before you apply.");
  });

  it("says a single source once, in a source line", () => {
    const marketing = getCareer("marketing")!;
    render(<SummersCard views={resolveSummers(marketing.summer, PROGRAMS, OFFICES)} />);
    const card = screen.getByRole("region", { name: "Summers" });
    expect(card.querySelector("[data-provenance]")).toHaveAttribute(
      "data-provenance",
      "matthews-center",
    );
    expect(card.querySelectorAll("li [data-source]")).toHaveLength(0);
    expect(within(card).getByTestId("summers-source")).toHaveTextContent(
      /^From Matthews Center · checked Sep 30, 2026\./,
    );
  });

  it("says an outside-only list's organization once", () => {
    const ib = getCareer("investment-banking")!;
    render(<SummersCard views={resolveSummers(ib.summer, PROGRAMS, OFFICES)} />);
    const card = screen.getByRole("region", { name: "Summers" });
    expect(within(card).getByTestId("summers-source")).toHaveTextContent(
      /^From Sponsors for Educational Opportunity · checked Oct 29, 2026\./,
    );
    expect(card.querySelector("[data-provenance]")).toBeNull();
  });

  it("is left out when a path has none", () => {
    expect(getCareer("sports-management")!.summer).toBeUndefined();
    const { container } = render(<SummersCard views={[]} />);
    expect(container).toBeEmptyDOMElement();
  });
});
