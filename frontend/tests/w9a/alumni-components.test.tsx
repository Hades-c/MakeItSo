import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SUPPORT_CONTACT } from "@/app/(auth)/_lib/support";
import { AlumniFilters } from "@/app/(hub)/alumni/_components/alumni-filters";
import { AlumniGateNotice } from "@/app/(hub)/alumni/_components/alumni-gate-notice";
import { AlumnusCard } from "@/app/(hub)/alumni/_components/alumnus-card";
import { ProvenanceLine } from "@/app/(hub)/alumni/_components/provenance-line";
import { NO_ALUMNI_FILTERS } from "@/app/(hub)/alumni/_lib/directory";
import type { Alumnus } from "@/lib/types/content";

/** Made-up records for the card's rules (the real list lives in server/content/alumni.ts). */
const FULL: Alumnus = {
  id: "casey-example",
  name: "Casey Example",
  classYear: 2019,
  majors: ["Economics", "Mathematics"],
  role: "Data Analyst",
  organization: "Example Health",
  roleAsOf: "2026-08-15",
  linkedinUrl: "https://www.linkedin.com/in/casey-example/",
  careerPathSlugs: ["data-science"],
  contactable: true,
  sources: [
    "https://www.davidson.edu/news/2019/05/20/example",
    "https://example.org/team/casey",
    "https://www.linkedin.com/in/casey-example/",
  ],
  fieldSources: {
    classYear: ["https://www.davidson.edu/news/2019/05/20/example"],
    majors: ["https://www.davidson.edu/news/2019/05/20/example"],
    role: ["https://example.org/team/casey"],
    organization: ["https://example.org/team/casey"],
  },
  verifiedAt: "2026-09-30",
};

const SPARSE: Alumnus = {
  ...FULL,
  id: "robin-sparse",
  name: "Robin Sparse",
  majors: null,
  role: null,
  organization: null,
  roleAsOf: null,
  careerPathSlugs: [],
  fieldSources: { classYear: FULL.fieldSources.classYear },
};

const NOTABLE: Alumnus = { ...FULL, id: "pat-notable", name: "Pat Notable", contactable: false };

describe("AlumnusCard", () => {
  it("shows the sourced fields, the career path and the LinkedIn profile", () => {
    render(
      <AlumnusCard
        alumnus={FULL}
        careers={[{ slug: "data-science", name: "Data Science & Analytics" }]}
      />,
    );
    const card = screen.getByRole("article", { name: "Casey Example" });
    expect(card).toHaveAttribute("id", "casey-example");
    expect(card).toHaveAttribute("data-contactable", "true");
    expect(within(card).getByText("2019")).toBeVisible();
    expect(within(card).getByText("Economics, Mathematics")).toBeVisible();
    expect(within(card).getByText("Data Analyst")).toBeVisible();
    expect(within(card).getByText("Example Health")).toBeVisible();
    expect(card).toHaveTextContent("Role and organization as of Aug 2026");
    expect(within(card).getByRole("link", { name: "Data Science & Analytics" })).toHaveAttribute(
      "href",
      "/careers/data-science",
    );
    const linkedin = within(card).getByRole("link", { name: /Connect on LinkedIn/ });
    expect(linkedin).toHaveAccessibleName("Connect on LinkedIn: Casey Example");
    expect(linkedin).toHaveAttribute("href", FULL.linkedinUrl);
    expect(linkedin).toHaveAttribute("rel", "noopener noreferrer");
    expect(linkedin).toHaveAttribute("data-contact", "linkedin");
    expect(linkedin.querySelector("svg[data-icon=linkedin]")).toHaveAttribute("aria-hidden");
    expect(within(card).queryByText("Notable alumni")).toBeNull();
  });

  it("lists its public sources (never the LinkedIn profile) and when it was checked", () => {
    render(<AlumnusCard alumnus={FULL} />);
    const card = screen.getByRole("article", { name: "Casey Example" });
    expect(card).toHaveTextContent("Sources (2) · checked Sep 30, 2026");
    const sources = within(card)
      .getAllByRole("link")
      .filter((link) => link.closest("details"));
    expect(sources.map((link) => link.getAttribute("href"))).toEqual([
      "https://www.davidson.edu/news/2019/05/20/example",
      "https://example.org/team/casey",
    ]);
    expect(sources[0]).toHaveTextContent("davidson.edu/news/2019/05/20/example");
    for (const link of sources) expect(link).toHaveAttribute("rel", "noopener noreferrer");
  });

  it("says “see LinkedIn” for every field whose only source is LinkedIn", () => {
    render(<AlumnusCard alumnus={SPARSE} />);
    const card = screen.getByRole("article", { name: "Robin Sparse" });
    expect(within(card).getAllByText("see LinkedIn")).toHaveLength(3);
    expect(within(card).getByText("2019")).toBeVisible();
    expect(card).not.toHaveTextContent(/as of/);
    expect(card).not.toHaveTextContent(/Career path/);
  });

  it("names what the as-of date covers", () => {
    const { rerender } = render(<AlumnusCard alumnus={{ ...FULL, role: null }} />);
    expect(screen.getByRole("article")).toHaveTextContent("Organization as of Aug 2026");
    rerender(<AlumnusCard alumnus={{ ...FULL, organization: null }} />);
    expect(screen.getByRole("article")).toHaveTextContent("Role as of Aug 2026");
  });

  it("gives Notable alumni (contactable: false) no contact affordance", () => {
    render(<AlumnusCard alumnus={NOTABLE} />);
    const card = screen.getByRole("article", { name: "Pat Notable" });
    expect(card).toHaveAttribute("data-contactable", "false");
    expect(within(card).getByText("Notable alumni")).toBeVisible();
    expect(card).toHaveTextContent(/not for cold outreach/);
    expect(within(card).queryByRole("link", { name: /Connect/ })).toBeNull();
    expect(card.querySelector("[data-contact]")).toBeNull();
    // The profile link stays: it is where “see LinkedIn” points.
    expect(
      within(card).getByRole("link", { name: "LinkedIn profile: Pat Notable" }),
    ).toHaveAttribute("href", NOTABLE.linkedinUrl);
  });

  it("can leave the notable note to a section heading and relabel the career links", () => {
    render(
      <AlumnusCard
        alumnus={NOTABLE}
        notableNote={false}
        careers={[{ slug: "data-science", name: "Data Science & Analytics" }]}
        careersLabel="Also on"
      />,
    );
    const card = screen.getByRole("article", { name: "Pat Notable" });
    expect(card).not.toHaveTextContent(/cold outreach/);
    expect(card).toHaveTextContent("Also on: Data Science & Analytics");
  });
});

describe("ProvenanceLine", () => {
  it("says where the data comes from, when it was checked and how to ask for a change", () => {
    render(<ProvenanceLine checkedAt="2026-09-30" />);
    const line = screen.getByTestId("alumni-provenance");
    expect(line).toHaveTextContent(
      "Compiled from public sources · checked Sep 30, 2026 · Request removal/correction",
    );
    const link = screen.getByRole("link", { name: "Request removal/correction" });
    expect(link).toHaveAttribute("href", SUPPORT_CONTACT.url);
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
    expect(line.querySelector("time")).toHaveAttribute("datetime", "2026-09-30");
  });
});

describe("AlumniGateNotice", () => {
  it("explains and offers the one next step (page)", () => {
    render(
      <AlumniGateNotice
        title="Verify your Davidson email to see alumni"
        message="Limited to verified accounts."
        action={{ href: "/verify?reason=davidson&next=%2Falumni", label: "Verify your email" }}
      />,
    );
    expect(
      screen.getByRole("heading", { level: 2, name: "Verify your Davidson email to see alumni" }),
    ).toBeVisible();
    expect(screen.getByRole("link", { name: "Verify your email" })).toHaveAttribute(
      "href",
      "/verify?reason=davidson&next=%2Falumni",
    );
  });

  it("is a short block inside a card, and has no button without an action", () => {
    render(
      <AlumniGateNotice
        title="Alumni are for verified Davidson accounts"
        message="Limited."
        action={null}
        variant="inline"
      />,
    );
    expect(screen.getByRole("heading", { level: 3 })).toHaveTextContent(
      "Alumni are for verified Davidson accounts",
    );
    expect(screen.queryByRole("link")).toBeNull();
  });
});

describe("AlumniFilters", () => {
  const facets = {
    careers: [{ value: "law", label: "Law", count: 2 }],
    years: [
      { value: 2022, label: "2022", count: 3 },
      { value: 2017, label: "2017", count: 1 },
    ],
    industries: [{ value: "Law & Government" as const, label: "Law & Government", count: 2 }],
  };

  it("is a GET form over the URL filters, with labelled controls", () => {
    render(<AlumniFilters filters={NO_ALUMNI_FILTERS} facets={facets} />);
    const form = screen.getByRole("form", { name: "Filter alumni" });
    expect(form).toHaveAttribute("method", "get");
    expect(form).toHaveAttribute("action", "/alumni");
    expect(screen.getByLabelText("Search")).toHaveAttribute("name", "q");
    const career = screen.getByLabelText("Career path");
    expect(career).toHaveAttribute("name", "career");
    expect(
      within(career)
        .getAllByRole("option")
        .map((o) => o.textContent),
    ).toEqual(["All career paths", "Law (2)"]);
    expect(within(screen.getByLabelText("Class year")).getAllByRole("option")).toHaveLength(3);
    const industry = screen.getByLabelText("Industry");
    expect(within(industry).getByRole("option", { name: "Law & Government (2)" })).toHaveAttribute(
      "value",
      "law-and-government",
    );
    expect(screen.getByRole("button", { name: "Apply" })).toHaveAttribute("type", "submit");
    expect(screen.queryByRole("link", { name: "Clear filters" })).toBeNull();
  });

  it("shows the current filters and a way to clear them", () => {
    render(
      <AlumniFilters
        filters={{ career: "law", year: 2017, industry: "Law & Government", q: "counsel" }}
        facets={facets}
      />,
    );
    expect(screen.getByLabelText("Search")).toHaveValue("counsel");
    expect(screen.getByLabelText("Career path")).toHaveValue("law");
    expect(screen.getByLabelText("Class year")).toHaveValue("2017");
    expect(screen.getByLabelText("Industry")).toHaveValue("law-and-government");
    expect(screen.getByRole("link", { name: "Clear filters" })).toHaveAttribute("href", "/alumni");
  });
});
