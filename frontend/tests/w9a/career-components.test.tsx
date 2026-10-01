import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CareerCard, OfferedLine } from "@/app/(hub)/careers/_components/career-card";
import { CareerFilters } from "@/app/(hub)/careers/_components/career-filters";
import { ProgramsList } from "@/app/(hub)/careers/_components/career-programs";
import {
  DavidsonResourcesCard,
  ExternalResourcesCard,
  HandshakeCard,
  PayCard,
  WhatYouDoCard,
} from "@/app/(hub)/careers/_components/career-sections";
import { CareerAiPanelsSlot } from "@/app/(hub)/careers/_components/ai-slot";
import type { ResolvedResource } from "@/app/(hub)/careers/_lib/resources";
import { getCareer } from "@/server/content/careers";

const SE = getCareer("software-engineering")!;

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("CareerCard", () => {
  it("links the career, shows the summary and the BLS pay with its period, occupation and source", () => {
    render(<CareerCard career={SE} offered={<p>slot</p>} />);
    const card = screen.getByRole("article", { name: "Software Engineering" });
    expect(within(card).getByRole("link", { name: "Software Engineering" })).toHaveAttribute(
      "href",
      "/careers/software-engineering",
    );
    expect(card).toHaveTextContent(SE.summary);
    const pay = within(card).getByTestId("career-card-pay");
    expect(pay).toHaveTextContent(`$135,980 median pay (${SE.pay!.period})`);
    expect(within(card).getByTestId("career-card-occupation")).toHaveTextContent(
      "BLS occupation: Software developers · Source",
    );
    const bls = within(card).getByRole("link", {
      name: "Source: BLS Occupational Outlook Handbook, Software developers",
    });
    expect(bls).toHaveAttribute("href", SE.pay!.url);
    expect(bls).toHaveAttribute("rel", "noopener noreferrer");
    // Above the whole-card link, and a 44px target on phones.
    expect(bls).toHaveClass("relative", "z-10", "min-h-11", "md:min-h-0");
    expect(within(card).getByText("slot")).toBeVisible();
  });

  it("names the occupation a proxy figure is for, not the career", () => {
    const ib = getCareer("investment-banking")!;
    expect(ib.pay!.occupation).toMatch(
      /^Securities, commodities, and financial services sales agents \(/,
    );
    render(<CareerCard career={ib} />);
    const card = screen.getByRole("article", { name: "Investment Banking" });
    expect(within(card).getByTestId("career-card-pay")).toHaveTextContent(
      "$78,660 median pay (May 2025)",
    );
    expect(within(card).getByTestId("career-card-occupation")).toHaveTextContent(
      "BLS occupation: Securities, commodities, and financial services sales agents · Source",
    );
    const bls = within(card).getByRole("link", { name: /^Source: BLS/ });
    expect(bls).toHaveAccessibleName(
      "Source: BLS Occupational Outlook Handbook, Securities, commodities, and financial services sales agents",
    );
    // No OOH page is named after the career itself.
    expect(bls).not.toHaveAccessibleName(/Investment Banking/);
  });

  it("shows no pay line without pay data", () => {
    render(<CareerCard career={{ ...SE, pay: null }} />);
    expect(screen.queryByTestId("career-card-pay")).toBeNull();
  });
});

describe("OfferedLine", () => {
  it("counts the courses on the registration schedule, with its source tag", () => {
    render(<OfferedLine offered={5} total={8} termLabel="Spring 2027" />);
    const line = screen.getByTestId("career-card-offered");
    expect(line).toHaveTextContent("5 of 8 courses offered in Spring 2027");
    expect(line).toHaveAttribute("data-aggregated", "course-schedule");
    expect(within(line).getByText("Course schedule")).toHaveAttribute(
      "data-source",
      "course-schedule",
    );
  });

  it("uses the singular for one course", () => {
    render(<OfferedLine offered={1} total={1} termLabel="Spring 2027" />);
    expect(screen.getByTestId("career-card-offered")).toHaveTextContent("1 of 1 course offered");
  });
});

describe("CareerFilters", () => {
  const clusters = [
    { cluster: "Technology" as const, count: 5 },
    { cluster: "Business & Finance" as const, count: 6 },
  ];

  it("marks the current cluster and keeps the search text in every cluster link", () => {
    render(
      <CareerFilters
        filters={{ cluster: "Technology", q: "data" }}
        clusters={clusters}
        total={24}
      />,
    );
    const nav = screen.getByRole("navigation", { name: "Career clusters" });
    const links = within(nav).getAllByRole("link");
    expect(links.map((l) => [l.textContent, l.getAttribute("href")])).toEqual([
      ["All 24", "/careers?q=data"],
      ["Technology 5", "/careers?cluster=technology&q=data"],
      ["Business & Finance 6", "/careers?cluster=business-and-finance&q=data"],
    ]);
    expect(within(nav).getByRole("link", { name: /Technology/ })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(within(nav).getByRole("link", { name: /All/ })).not.toHaveAttribute("aria-current");
  });

  it("searches with a GET form that keeps the cluster", () => {
    const { container } = render(
      <CareerFilters
        filters={{ cluster: "Business & Finance", q: "" }}
        clusters={clusters}
        total={24}
      />,
    );
    const form = container.querySelector("form")!;
    expect(form).toHaveAttribute("method", "get");
    expect(form).toHaveAttribute("action", "/careers");
    expect(form).toHaveAttribute("autocomplete", "off");
    expect(screen.getByLabelText("Search careers")).toHaveAttribute("name", "q");
    expect(container.querySelector("input[type=hidden][name=cluster]")).toHaveValue(
      "business-and-finance",
    );
  });

  it("mutes a cluster with nothing to show and still says 0", () => {
    render(
      <CareerFilters
        filters={{ cluster: null, q: "law" }}
        clusters={[
          { cluster: "Technology", count: 0 },
          { cluster: "Business & Finance", count: 1 },
        ]}
        total={3}
      />,
    );
    const nav = screen.getByRole("navigation", { name: "Career clusters" });
    const tech = within(nav).getByRole("link", { name: /Technology/ });
    expect(tech).toHaveTextContent("Technology 0");
    expect(tech).toHaveClass("border-dashed", "text-fg-3");
    expect(within(nav).getByRole("link", { name: /Business/ })).not.toHaveClass("border-dashed");
    expect(within(nav).getByRole("link", { name: /All/ })).toHaveTextContent("All 3");
  });

  it("shows the URL's text after a chip navigation, not words typed and never submitted", async () => {
    const user = userEvent.setup();
    const { rerender } = render(
      <CareerFilters filters={{ cluster: null, q: "" }} clusters={clusters} total={24} />,
    );
    await user.type(screen.getByLabelText("Search careers"), "law");
    expect(screen.getByLabelText("Search careers")).toHaveValue("law");
    // A chip is a client-side navigation: the server renders the filters of the new URL.
    rerender(
      <CareerFilters filters={{ cluster: "Health", q: "" }} clusters={clusters} total={24} />,
    );
    expect(screen.getByLabelText("Search careers")).toHaveValue("");
    rerender(
      <CareerFilters filters={{ cluster: "Health", q: "nurse" }} clusters={clusters} total={24} />,
    );
    expect(screen.getByLabelText("Search careers")).toHaveValue("nurse");
  });
});

describe("career page sections", () => {
  it("lists what the work is", () => {
    render(<WhatYouDoCard career={SE} />);
    expect(screen.getAllByRole("listitem")).toHaveLength(SE.whatYouDo.length);
  });

  it("shows BLS pay with the period, growth and source", () => {
    render(<PayCard pay={SE.pay} />);
    const pay = screen.getByTestId("career-pay");
    expect(pay).toHaveTextContent("$135,980");
    expect(pay).toHaveTextContent(`median pay per year (${SE.pay!.period})`);
    expect(pay).toHaveTextContent(SE.pay!.projectedGrowth);
    expect(
      screen.getByRole("link", { name: /Source: BLS Occupational Outlook Handbook/ }),
    ).toHaveAttribute("href", SE.pay!.url);
  });

  it("says so when there is no pay data", () => {
    render(<PayCard pay={null} />);
    expect(screen.getByText(/No federal pay data/)).toBeVisible();
  });

  it("shows office programs with their tags and published amounts and deadlines", () => {
    const resources: ResolvedResource[] = [
      {
        name: "Try It Fund",
        url: "https://www.davidson.edu/try-it",
        description: "Small grants.",
        source: "hurt-hub-programs",
        untagged: null,
        officeName: null,
        program: {
          slug: "try-it-fund",
          name: "Try It Fund",
          named: true,
          url: "https://www.davidson.edu/try-it/",
          amount: "Up to $500",
          deadlineText: "Rolling",
          verifiedAt: "2026-09-30",
        },
      },
      {
        name: "Travel Grants",
        url: "https://www.davidson.edu/fellows",
        description: "A fellowship.",
        source: "davidson-offices",
        untagged: null,
        officeName: "Mulliss Center for Civic Engagement",
        program: {
          slug: "fellows",
          name: "Travel Grants",
          named: true,
          url: "https://www.davidson.edu/fellows/application-process",
          amount: null,
          deadlineText: "Winter Break: by October 1",
          verifiedAt: "2026-09-30",
        },
      },
      {
        name: "Department research",
        url: "https://www.davidson.edu/academic-departments/dept",
        description: "Research.",
        source: null,
        untagged: "davidson-web",
        officeName: null,
        program: null,
      },
      {
        name: "Law School Resources (Prelaw)",
        url: "https://www.davidson.edu/prelaw/resources",
        description: "Resources.",
        source: "davidson-offices",
        untagged: null,
        officeName: "Prelaw Advising",
        program: {
          slug: "fee-grant",
          name: "Law school application fee grant",
          named: false,
          url: "https://www.davidson.edu/prelaw/resources",
          amount: "$500",
          deadlineText: null,
          verifiedAt: "2026-09-30",
        },
      },
    ];
    render(<DavidsonResourcesCard resources={resources} verifiedAt="2026-09-30" />);
    const items = screen.getAllByRole("listitem");
    expect(items[0]).toHaveAttribute("data-aggregated", "hurt-hub-programs");
    expect(within(items[0]!).getByText("Hurt Hub programs")).toHaveAttribute(
      "data-source",
      "hurt-hub-programs",
    );
    expect(items[0]).toHaveTextContent("AmountUp to $500");
    expect(items[0]).toHaveTextContent("DeadlinesRolling");
    // Same page (a trailing slash apart): no second link, no "Program" line.
    expect(within(items[0]!).getAllByRole("link")).toHaveLength(1);
    expect(items[0]).not.toHaveTextContent("Program");

    expect(within(items[1]!).getByText("Davidson offices")).toHaveAttribute(
      "data-source",
      "davidson-offices",
    );
    expect(items[1]).toHaveTextContent("Mulliss Center for Civic Engagement");
    expect(items[1]).not.toHaveTextContent("Amount");
    expect(items[1]).toHaveTextContent("DeadlinesWinter Break: by October 1");
    // The deadline is published on another page: it is linked.
    expect(
      within(items[1]!).getByRole("link", { name: "Where this is published" }),
    ).toHaveAttribute("href", "https://www.davidson.edu/fellows/application-process");

    // Untagged only with its exemption, in plain words (no tag).
    expect(items[2]).toHaveAttribute("data-aggregated", "untagged");
    expect(items[2]).toHaveAttribute("data-untagged", "davidson-web");
    expect(items[2]!.querySelector("[data-source]")).toBeNull();
    expect(items[2]).toHaveTextContent("davidson.edu page");

    // Facts of a program the resource's name does not say: the program is named.
    expect(items[3]).toHaveTextContent("ProgramLaw school application fee grant");
    expect(items[3]).toHaveTextContent("Amount$500");

    for (const link of screen.getAllByRole("link")) {
      expect(link).toHaveAttribute("rel", "noopener noreferrer");
    }
    expect(screen.getByText(/checked/)).toHaveTextContent("checked Sep 30, 2026");
  });

  it("marks an untagged item without an exemption so expectAllTagged fails on it", () => {
    render(
      <DavidsonResourcesCard
        verifiedAt="2026-09-30"
        resources={[
          {
            name: "Somewhere",
            url: "https://example.org/",
            description: "?",
            source: null,
            untagged: null,
            officeName: null,
            program: null,
          },
        ]}
      />,
    );
    const item = screen.getByRole("listitem");
    expect(item).toHaveAttribute("data-aggregated", "untagged");
    expect(item).toHaveAttribute("data-untagged", "");
  });

  it("links Handshake by its base URL with words to copy (no invented search URL)", async () => {
    // user-event installs its own clipboard on setup(): spy on it afterwards.
    const user = userEvent.setup();
    const writeText = vi.spyOn(navigator.clipboard, "writeText").mockResolvedValue(undefined);
    render(
      <HandshakeCard baseUrl="https://davidson.joinhandshake.com/" query="software engineer" />,
    );
    expect(screen.getByRole("link", { name: "Open Handshake" })).toHaveAttribute(
      "href",
      "https://davidson.joinhandshake.com/",
    );
    expect(screen.getByTestId("handshake-query")).toHaveTextContent("software engineer");
    expect(screen.getByText("Handshake")).toHaveAttribute("data-source", "handshake");
    await user.click(screen.getByRole("button", { name: "Copy search words" }));
    expect(writeText).toHaveBeenCalledWith("software engineer");
    expect(await screen.findByRole("button", { name: "Copied search words" })).toBeVisible();
  });

  it("says how to copy by hand when the browser refuses", async () => {
    const user = userEvent.setup();
    vi.spyOn(navigator.clipboard, "writeText").mockRejectedValue(new Error("denied"));
    render(<HandshakeCard baseUrl="https://davidson.joinhandshake.com/" query="law clerk" />);
    await user.click(screen.getByRole("button", { name: "Copy search words" }));
    expect(await screen.findByText(/copy them yourself/)).toBeVisible();
  });

  it("lists outside resources, and nothing when there are none", () => {
    const { rerender, container } = render(
      <ExternalResourcesCard resources={SE.externalResources} />,
    );
    expect(screen.getAllByRole("link")).toHaveLength(SE.externalResources.length);
    rerender(<ExternalResourcesCard resources={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("shows departments (into the catalog) and official programs with the catalog tag", () => {
    render(
      <ProgramsList
        departments={SE.departments}
        catalogYear="2026-2027"
        programs={[
          {
            acalogId: 172,
            name: "Major in Computer Science (B.S. Degree)",
            kind: "major",
            url: "https://catalog.davidson.edu/preview_program.php?catoid=28&poid=1799",
            official: true,
          },
          { acalogId: 188, name: "Mathematics minor", kind: "minor", url: null, official: false },
        ]}
      />,
    );
    expect(
      screen.getByRole("link", { name: "CSC Computer Science: browse courses" }),
    ).toHaveAttribute("href", "/courses?dept=CSC");
    const major = screen.getByRole("link", { name: "Major in Computer Science (B.S. Degree)" });
    expect(major).toHaveAttribute("href", expect.stringContaining("preview_program.php"));
    expect(major.closest("li")).toHaveAttribute("data-aggregated", "catalog");
    const fallback = screen.getByText("Mathematics minor").closest("li")!;
    expect(fallback).not.toHaveAttribute("data-aggregated");
    expect(within(fallback).queryByRole("link")).toBeNull();
    // Mixed: only the tagged names are claimed as official.
    expect(screen.getByTestId("programs-note")).toHaveTextContent(
      "Tagged names are official, from the 2026–2027 Davidson catalog; the others are from the career guide.",
    );
  });

  it("claims official catalog names only when every name is the catalog's", () => {
    const official = {
      acalogId: 172,
      name: "Major in Computer Science (B.S. Degree)",
      kind: "major" as const,
      url: "https://catalog.davidson.edu/preview_program.php?catoid=28&poid=1799",
      official: true,
    };
    const { rerender } = render(
      <ProgramsList departments={[]} catalogYear="2026-2027" programs={[official]} />,
    );
    expect(screen.getByTestId("programs-note")).toHaveTextContent(
      "Official names from the 2026–2027 Davidson catalog, where the requirements are.",
    );
    // The catalog could not be read: the career guide's names, and no claim they are official.
    rerender(
      <ProgramsList
        departments={[]}
        catalogYear="2026-2027"
        programs={[
          { acalogId: 1, name: "Economics major", kind: "major", url: null, official: false },
        ]}
      />,
    );
    const note = screen.getByTestId("programs-note");
    expect(note).toHaveTextContent(
      "Program names from the career guide; see the 2026–2027 Davidson catalog for the official names and requirements.",
    );
    expect(note).not.toHaveTextContent(/^Official names/);
  });

  it("keeps the AI panels' slot empty on this branch", () => {
    const { container } = render(<CareerAiPanelsSlot career={SE} />);
    expect(container).toBeEmptyDOMElement();
  });
});
