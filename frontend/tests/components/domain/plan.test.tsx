import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import {
  AddToPlanControl,
  type AddToPlanControlProps,
  type AddToPlanTerm,
} from "@/components/domain/add-to-plan-control";
import { PlanMap, type PlanMapTerm } from "@/components/domain/plan-map";
import { RatingSummary, safeRmpUrl } from "@/components/domain/rating-summary";
import { RequirementSlots, type RequirementSlot } from "@/components/domain/requirement-slots";
import { SeatBar, seatSummary } from "@/components/domain/seat-bar";
import { TooltipProvider } from "@/components/ui/tooltip";

const done = (code: string) => ({ status: "done" as const, code, credits: 1 });
const now = (code: string) => ({ status: "in-progress" as const, code, credits: 1 });

/** The Lakeside mockup plan: 8 done, 4 this term (Fall 2026), HIS 357 planned for Fall 2027. */
const PLAN: PlanMapTerm[] = [
  {
    termCode: "202501",
    label: "Fall 2025",
    slots: ["WRI 101", "CSC 121", "MAT 112", "ECO 101"].map(done),
  },
  {
    termCode: "202502",
    label: "Spring 2026",
    slots: ["MAT 113", "CHE 115", "ART 101", "SPA 101"].map(done),
  },
  {
    termCode: "202601",
    label: "Fall 2026",
    isCurrent: true,
    slots: ["CSC 221", "ECO 232", "ENG 260", "ENV 237"].map(now),
  },
  { termCode: "202602", label: "Spring 2027", slots: [] },
  {
    termCode: "202701",
    label: "Fall 2027",
    slots: [{ status: "planned", code: "HIS 357", credits: 1 }],
  },
  { termCode: "202702", label: "Spring 2028", slots: [] },
  { termCode: "202801", label: "Fall 2028", slots: [] },
  { termCode: "202802", label: "Spring 2029", slots: [] },
];

function rowView(container: HTMLElement) {
  return within(container.querySelector<HTMLElement>('[data-layout="row"]')!);
}
function yearsView(container: HTMLElement) {
  return within(container.querySelector<HTMLElement>('[data-layout="years"]')!);
}

describe("PlanMap", () => {
  it("totals credits and reads the progress bar out", () => {
    render(<PlanMap terms={PLAN} requiredCredits={32} />);
    expect(screen.getByText("12").parentElement).toHaveTextContent("12 of 32 credits");
    const bar = screen.getByRole("img", {
      name: "12 of 32 credits: 8 done, 4 in progress, 1 planned",
    });
    const [doneSeg, nowSeg, plannedSeg] = [...bar.children] as HTMLElement[];
    expect(doneSeg!.style.width).toBe("25%");
    expect(nowSeg!.style.width).toBe("12.5%");
    expect(plannedSeg!.style.width).toBe("3.125%");
  });

  it("shows every term in one row with status in words, never by hue alone", () => {
    const { container } = render(<PlanMap terms={PLAN} requiredCredits={32} />);
    const row = rowView(container);
    const current = row.getByRole("list", { name: "Fall 2026, current term" });
    expect(
      within(current)
        .getAllByRole("listitem")
        .map((li) => li.textContent),
    ).toEqual([
      "CSC 221CSC 221, in progress",
      "ECO 232ECO 232, in progress",
      "ENG 260ENG 260, in progress",
      "ENV 237ENV 237, in progress",
    ]);
    const cell = within(current).getAllByRole("listitem")[0]!;
    expect(cell).toHaveAttribute("data-status", "in-progress");
    expect(cell).toHaveClass("bg-course-lake-wash", "border-course-lake");
    const fall27 = row.getByRole("list", { name: "Fall 2027" });
    expect(fall27).toHaveTextContent("HIS 357, planned");
    expect(fall27).toHaveTextContent("3 open slots");
    expect(within(fall27).getAllByRole("listitem")[0]).toHaveClass(
      "border-dashed",
      "border-course-teal",
    );
    expect(row.getByRole("list", { name: "Fall 2025" })).toHaveTextContent("WRI 101, done");
    expect(row.getByRole("list", { name: "Spring 2027" })).toHaveTextContent("4 open slots");
    expect(screen.getByRole("list", { name: "Key" })).toHaveTextContent(
      "DoneIn progressPlannedOpen",
    );
  });

  it("groups terms into academic-year rows for narrow screens", () => {
    const { container } = render(<PlanMap terms={PLAN} requiredCredits={32} />);
    const years = yearsView(container);
    expect(years.getByText("2025–26")).toBeInTheDocument();
    expect(years.getByText("2028–29")).toBeInTheDocument();
    // Full labels on phones, "F25" on the one-row layout.
    expect(years.getByText("Fall 2025")).toBeInTheDocument();
    expect(rowView(container).getByText("F25")).toBeInTheDocument();
    expect(rowView(container).getByText(/F26 · now/)).toBeInTheDocument();
    // Two slots per line in the year rows.
    const fall25 = years.getByRole("list", { name: "Fall 2025" });
    expect(fall25.style.gridTemplateColumns).toBe("repeat(2, minmax(0, 1fr))");
  });

  it("spans 2-credit courses over two slots and lists 0-credit courses instead of slotting them", () => {
    const { container } = render(
      <PlanMap
        requiredCredits={32}
        terms={[
          {
            termCode: "202501",
            label: "Fall 2025",
            slots: [
              { status: "done", code: "HUM 103", credits: 2 },
              done("MAT 112"),
              { status: "done", code: "MUS 010", credits: 0 },
            ],
          },
          { termCode: "202503", label: "Summer 2026", slots: [done("ENV 201")] },
        ]}
      />,
    );
    const fall = rowView(container).getByRole("list", { name: "Fall 2025" });
    const hum = within(fall).getByText("HUM 103, done, 2 credits").closest("li")!;
    expect(hum.style.height).toBe("4.0625rem"); // two 1.875rem slots and the gap between them
    expect(fall).toHaveTextContent("1 open slot");
    expect(fall).not.toHaveTextContent("MUS 010");
    expect(screen.getByTestId("plan-unslotted")).toHaveTextContent(
      "No credit, not slotted: MUS 010 (Fall 2025, done)",
    );
    expect(screen.getByText("4").parentElement).toHaveTextContent("4 of 32 credits");
    // The summer sits under its year, across both columns, with four slots per line.
    const summer = yearsView(container).getByRole("list", { name: "Summer 2026" });
    expect(summer.style.gridTemplateColumns).toBe("repeat(4, minmax(0, 1fr))");
    expect(within(summer).getAllByRole("listitem")[0]!.style.gridColumn).toBe("span 1");
    const yearFall = yearsView(container).getByRole("list", { name: "Fall 2025" });
    expect(
      within(yearFall).getByText("HUM 103, done, 2 credits").closest("li")!.style.gridColumn,
    ).toBe("span 2");
  });

  it("renders a compact preview as one labelled image", () => {
    render(
      <PlanMap
        variant="compact"
        terms={PLAN}
        requiredCredits={32}
        highlightTermCode="202701"
        label="Plan preview"
      />,
    );
    expect(
      screen.getByRole("img", {
        name: "Plan preview: 8 done, 4 in progress, 1 planned of 32 credits. Fall 2027 selected.",
      }),
    ).toBeInTheDocument();
    expect(screen.getByText("F27")).toHaveClass("text-primary");
    expect(screen.queryByText("CSC 221")).not.toBeInTheDocument();
  });
});

const SLOTS: RequirementSlot[] = [
  { id: "vprq", code: "VPRQ", label: "Visual and Performing Arts", status: "done" },
  {
    id: "ltrq",
    code: "LTRQ",
    label: "Literary Studies",
    status: "this-term",
    course: { code: "ENG 260", termLabel: "Fall 2026" },
  },
  {
    id: "htrq",
    code: "HTRQ",
    label: "Historical Thought",
    status: "open",
    course: { code: "HIS 357", termLabel: "Fall 2027" },
  },
  {
    id: "cult",
    code: "CULT",
    label: "Cultural Diversity",
    status: "planned",
    course: { code: "REL 201", termLabel: "Spring 2027" },
  },
  { id: "prrq", code: "PRRQ", label: "Philosophical and Religious Perspectives", status: "open" },
];

describe("RequirementSlots", () => {
  it("names every slot and its status in words, with the unofficial note", () => {
    render(<RequirementSlots slots={SLOTS} note="Each course fills one slot." />);
    const items = within(screen.getByRole("list", { name: "Requirements" })).getAllByRole(
      "listitem",
    );
    expect(items.map((li) => li.textContent)).toEqual([
      "VPRQ (Visual and Performing Arts)done: Done",
      "LTRQ (Literary Studies)this term: ENG 260",
      "HTRQ (Historical Thought)open: Open",
      "CULT (Cultural Diversity)planned: REL 201 · Spring 2027",
      "PRRQ (Philosophical and Religious Perspectives)open: Open",
    ]);
    expect(items[0]).toHaveClass("bg-surface-2");
    expect(items[1]).toHaveClass("bg-primary-wash");
    expect(items[3]).toHaveClass("border-dashed", "border-primary");
    expect(
      screen.getByText("Unofficial — verify in Degree Works.").parentElement,
    ).toHaveTextContent("Unofficial — verify in Degree Works. Each course fills one slot.");
    expect(screen.getByRole("list", { name: "Key" })).toHaveTextContent("DoneThis termPlannedOpen");
  });

  it("highlights the slots a candidate course would fill in its course colour", () => {
    render(<RequirementSlots slots={SLOTS} candidate="HIS 357" />);
    const htrq = screen.getByText(/HTRQ/).closest("li")!;
    expect(htrq).toHaveAttribute("data-status", "candidate");
    expect(htrq).toHaveClass("border-course-teal", "bg-course-teal-wash");
    expect(htrq).toHaveTextContent("would be filled: HIS 357 fills");
    expect(screen.getByRole("list", { name: "Key" })).toHaveTextContent("Filled by HIS 357");
    // Unofficial note is always there, even without extra text.
    expect(screen.getByText("Unofficial — verify in Degree Works.")).toBeInTheDocument();
  });
});

const TERMS: AddToPlanTerm[] = [
  {
    code: "202601",
    label: "Fall 2026",
    availability: "offered",
    sectionCount: 1,
    note: "5th course",
  },
  { code: "202602", label: "Spring 2027", availability: "not-offered" },
  { code: "202701", label: "Fall 2027", availability: "not-yet-published" },
];

function Controlled(props: Partial<AddToPlanControlProps> & { onAdd?: (code: string) => void }) {
  const [value, setValue] = useState<string | null>(props.value ?? "202601");
  return (
    <AddToPlanControl
      terms={TERMS}
      courseCode="HIS 357"
      pending={false}
      {...props}
      value={value}
      onChange={(code) => {
        setValue(code);
        props.onChange?.(code);
      }}
      onAdd={props.onAdd ?? (() => {})}
    />
  );
}

describe("AddToPlanControl", () => {
  it("is a radio group whose options explain their availability", () => {
    render(<Controlled />);
    const group = screen.getByRole("group", { name: "Term to add HIS 357 to" });
    const radios = within(group).getAllByRole("radio");
    expect(radios.map((r) => (r as HTMLInputElement).checked)).toEqual([true, false, false]);
    expect(radios[0]).toHaveAccessibleName("Fall 2026");
    expect(radios[0]).toHaveAccessibleDescription("5th course");
    expect(radios[1]).toBeDisabled();
    expect(radios[1]).toHaveAccessibleDescription("Not offered");
    expect(radios[2]).toHaveAccessibleDescription("Not yet published");
    expect(screen.getByText("Not on the published schedule for Spring 2027.")).toBeInTheDocument();
    expect(screen.getByTestId("add-to-plan-explanation")).toHaveTextContent(
      "Offered in Fall 2026 · 1 section.",
    );
    expect(screen.getByRole("button", { name: "Add to Fall 2026" })).toBeEnabled();
  });

  it("moves with the arrow keys, skipping terms that cannot be chosen", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Controlled onChange={onChange} />);
    const [fall26, , fall27] = screen.getAllByRole("radio");
    fall26!.focus();
    await user.keyboard("{ArrowRight}");
    expect(fall27).toBeChecked();
    expect(fall27).toHaveFocus();
    expect(onChange).toHaveBeenLastCalledWith("202701");
    expect(screen.getByTestId("add-to-plan-explanation")).toHaveTextContent(
      "The Fall 2027 schedule isn’t published yet — we’ll flag it if HIS 357 isn’t offered.",
    );
    await user.keyboard("{ArrowLeft}");
    expect(fall26).toBeChecked();
  });

  it("adds to the chosen term, then reports pending and added states in text", async () => {
    const user = userEvent.setup();
    const onAdd = vi.fn();
    const { rerender } = render(
      <AddToPlanControl
        terms={TERMS}
        value="202701"
        onChange={() => {}}
        onAdd={onAdd}
        pending={false}
        courseCode="HIS 357"
      />,
    );
    await user.click(screen.getByRole("button", { name: "Add to Fall 2027" }));
    expect(onAdd).toHaveBeenCalledWith("202701");

    rerender(
      <AddToPlanControl
        terms={TERMS}
        value="202701"
        onChange={() => {}}
        onAdd={onAdd}
        pending
        courseCode="HIS 357"
      />,
    );
    const busy = screen.getByRole("button", { name: "Adding to Fall 2027…" });
    expect(busy).toHaveAttribute("aria-disabled", "true");
    expect(busy).toHaveAttribute("aria-busy", "true");
    await user.click(busy);
    expect(onAdd).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("status")).toHaveTextContent("Adding HIS 357 to Fall 2027");

    rerender(
      <AddToPlanControl
        terms={TERMS}
        value="202701"
        onChange={() => {}}
        onAdd={onAdd}
        pending={false}
        added
        courseCode="HIS 357"
      />,
    );
    await user.click(screen.getByRole("button", { name: "In your plan for Fall 2027" }));
    expect(onAdd).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("status")).toHaveTextContent("HIS 357 is in your plan for Fall 2027");
  });

  it("explains why a not-offered or missing term cannot be added", async () => {
    const user = userEvent.setup();
    const onAdd = vi.fn();
    const { rerender } = render(
      <AddToPlanControl
        terms={TERMS}
        value="202602"
        onChange={() => {}}
        onAdd={onAdd}
        pending={false}
      />,
    );
    const button = screen.getByRole("button", { name: "Not offered in Spring 2027" });
    expect(button).toHaveAttribute("aria-disabled", "true");
    await user.click(button);
    expect(onAdd).not.toHaveBeenCalled();
    expect(screen.getByTestId("add-to-plan-explanation")).toHaveTextContent(
      "This course isn’t on the Spring 2027 schedule, so it can’t be added to that term.",
    );
    rerender(
      <AddToPlanControl
        terms={TERMS}
        value={null}
        onChange={() => {}}
        onAdd={onAdd}
        pending={false}
      />,
    );
    expect(screen.getByRole("button", { name: "Choose a term" })).toHaveAttribute(
      "aria-disabled",
      "true",
    );
  });
});

describe("SeatBar", () => {
  it.each([
    [16, 24, 8, "open", 8, 2 / 3],
    [24, 24, 0, "full", 0, 1],
    [26, 24, -2, "over-enrolled", 0, 1],
    [0, 0, 0, "no-seats", 0, 0],
    [3, 0, -3, "no-seats", 0, 0],
    [0, 12, 12, "open", 12, 0],
  ])("summarises %i/%i (remaining %i) as %s", (current, max, remaining, state, open, fill) => {
    const s = seatSummary(current, max, remaining);
    expect(s.state).toBe(state);
    expect(s.open).toBe(open);
    expect(s.fill).toBeCloseTo(fill, 10);
  });

  it("reads '8 of 24 seats open · 16 enrolled' with a course-coloured bar", () => {
    const { container } = render(
      <SeatBar current={16} max={24} remaining={8} courseCode="HIS 357" />,
    );
    expect(container).toHaveTextContent("8 of 24 seats open 16 enrolled");
    const fill = container.querySelector<HTMLElement>("[aria-hidden] > div")!;
    expect(fill).toHaveClass("bg-course-teal");
    expect(fill.style.width).toBe("66.6667%");
  });

  it("says Over-enrolled when remaining is negative, never a negative seat count", () => {
    const { container } = render(<SeatBar current={26} max={24} remaining={-2} />);
    expect(container).toHaveTextContent("0 of 24 seats open Over-enrolled 26 enrolled");
    expect(container).not.toHaveTextContent("-2");
    expect(container.firstElementChild).toHaveAttribute("data-state", "over-enrolled");
  });

  it("handles a full section, a max-0 listing and the compact size", () => {
    const { container, rerender } = render(<SeatBar current={24} max={24} remaining={0} />);
    expect(container).toHaveTextContent("Full");
    rerender(<SeatBar current={0} max={0} remaining={0} />);
    expect(container).toHaveTextContent("No seats in this listing");
    expect(container).not.toHaveTextContent("0 of 0");
    rerender(<SeatBar current={9} max={30} remaining={21} size="sm" />);
    expect(container).toHaveTextContent("21 of 30 open 9 enrolled");
  });
});

describe("RatingSummary", () => {
  const RMP = "https://www.ratemyprofessors.com/professor/123456";

  it("shows the rating, count, an RMP source tag, the sync date as text, and a safe link", () => {
    render(
      <RatingSummary
        status="matched"
        avgRating={3.66}
        numRatings={21}
        asOf="2026-09-30T13:00:00Z"
        url={RMP}
        instructorName="Daniel Aldridge"
        timeZone="America/New_York"
      />,
      { wrapper: TooltipProvider },
    );
    expect(screen.getByText("3.7")).toBeInTheDocument();
    expect(screen.getByText("21 ratings for Daniel Aldridge")).toBeInTheDocument();
    const tag = screen.getByText("RateMyProfessors", {
      selector: "[data-source] *, [data-source]",
    });
    expect(tag.closest("[data-source]")).toHaveAttribute("data-source", "ratemyprofessors");
    // The date is printed, not hidden in a hover/focus tooltip (phones can see it), and the tag is not a tab stop.
    const asOf = screen.getByText("as of Sep 30, 2026");
    expect(asOf).toBeVisible();
    expect(asOf.closest(".sr-only")).toBeNull();
    expect(tag.closest("[data-source]")).not.toHaveAttribute("tabindex");
    const link = screen.getByRole("link", { name: /RateMyProfessors: Daniel Aldridge’s page/ });
    expect(link).toHaveAttribute("href", RMP);
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
  });

  it("renders nothing, or a quiet 'No rating', without a match", () => {
    for (const status of ["unmatched", "staff", "disabled", "review"] as const) {
      const { container, unmount } = render(
        <RatingSummary status={status} avgRating={4.2} numRatings={12} />,
      );
      expect(container).toBeEmptyDOMElement();
      unmount();
    }
    const { rerender } = render(<RatingSummary status="staff" empty="quiet" />);
    expect(screen.getByText("No rating")).toBeInTheDocument();
    rerender(<RatingSummary status="matched" avgRating={4} numRatings={0} empty="quiet" />);
    expect(screen.getByText("No ratings yet")).toBeInTheDocument();
  });

  it("has a compact form with the date and a short RMP link", () => {
    render(
      <RatingSummary
        status="matched"
        avgRating={4.6}
        numRatings={1}
        size="sm"
        asOf="2026-09-29T09:00:00Z"
        url={RMP}
        instructorName="Daniel Aldridge"
        timeZone="America/New_York"
      />,
    );
    expect(screen.getByText(/1 rating/)).toHaveTextContent(
      "1 rating for Daniel Aldridge · as of Sep 29, 2026",
    );
    const link = screen.getByRole("link", { name: /^RMP: Daniel Aldridge on RateMyProfessors/ });
    expect(link).toHaveAttribute("href", RMP);
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
    expect(link).toHaveAttribute("target", "_blank");
    // A 44px target on phones.
    expect(link).toHaveClass("max-md:min-h-11");
  });

  it("never renders a non-RMP link", () => {
    render(
      <RatingSummary
        status="matched"
        avgRating={4.6}
        numRatings={1}
        size="sm"
        url="https://evil.example/rmp"
      />,
    );
    expect(screen.getByText("1 rating")).toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    expect(safeRmpUrl("javascript:alert(1)")).toBeNull();
    expect(safeRmpUrl("http://www.ratemyprofessors.com/professor/1")).toBeNull();
    expect(safeRmpUrl("https://www.ratemyprofessors.com.evil.example/")).toBeNull();
    expect(safeRmpUrl(RMP)).toBe(RMP);
  });
});
