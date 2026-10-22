import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { DayTimeline, type TimelineItem } from "@/components/domain/day-timeline";
import { FiveDayStrip } from "@/components/domain/five-day-strip";
import { WeekGrid, type WeekGridBlock } from "@/components/domain/week-grid";

/** Davidson public schedule, Fall 2026 (the Lakeside mockup week), HIS 357 A tentative. */
function week(extra: WeekGridBlock[] = []): WeekGridBlock[] {
  const meet = (
    code: string,
    title: string,
    days: WeekGridBlock["day"][],
    start: string,
    end: string,
    room: string,
    flags: Partial<WeekGridBlock> = {},
  ) => days.map((day) => ({ id: `${code}-${day}`, code, title, day, start, end, room, ...flags }));
  return [
    ...meet("CSC 221 A", "Data Structures", ["M", "W", "F"], "10:30", "11:20", "Watson 132"),
    ...meet("ECO 232 A", "Economics of Migration", ["M", "W", "F"], "11:30", "12:20", "Watson 243"),
    ...meet(
      "ENG 260 A",
      "British Literature Since 1800",
      ["T", "R"],
      "09:40",
      "10:55",
      "Chambers 3084",
    ),
    ...meet(
      "ENV 237 A",
      "Intro to Interdisciplinary GIS",
      ["M", "W"],
      "14:30",
      "15:45",
      "Watson 247",
    ),
    ...meet(
      "HIS 357 A",
      "The Civil Rights Movement",
      ["T", "R"],
      "12:15",
      "13:30",
      "Chambers 1027",
      {
        tentative: true,
      },
    ),
    ...extra,
  ];
}

function gridView(container: HTMLElement) {
  return within(container.querySelector<HTMLElement>('[data-layout="grid"]')!);
}
function tabsView(container: HTMLElement) {
  return within(container.querySelector<HTMLElement>('[data-layout="tabs"]')!);
}

describe("WeekGrid", () => {
  it("places each class on its day with course colour and a full description", () => {
    const { container } = render(
      <WeekGrid startHour={9} endHour={16} blocks={week()} label="Your week with HIS 357" />,
    );
    const grid = gridView(container);
    expect(grid.getByRole("group", { name: "Your week with HIS 357, 9a–4p" })).toBeInTheDocument();
    const monday = grid.getByRole("list", { name: "Monday" });
    const items = within(monday).getAllByRole("listitem");
    expect(items.map((li) => li.textContent)).toEqual([
      "CSC 221CSC 221 A, Data Structures, Monday 10:30a to 11:20a, Watson 132",
      "ECO 232ECO 232 A, Economics of Migration, Monday 11:30a to 12:20p, Watson 243",
      "ENV 237ENV 237 A, Intro to Interdisciplinary GIS, Monday 2:30p to 3:45p, Watson 247",
    ]);
    expect(items[0]).toHaveAttribute("data-course-color", "lake");
    expect(items[0]).toHaveClass("bg-course-lake-wash", "text-course-lake", "border-course-lake");
    // Proportional: 10:30 is 90 of 420 minutes down; 50 minutes tall.
    expect(items[0]!.style.top).toBe("21.4286%");
    expect(items[0]!.style.height).toBe("11.9048%");
  });

  it("draws tentative sections dashed and says so", () => {
    const { container } = render(<WeekGrid startHour={9} endHour={16} blocks={week()} />);
    const tuesday = gridView(container).getByRole("list", { name: "Tuesday" });
    const his = within(tuesday)
      .getByText(/HIS 357 A, The Civil Rights Movement/)
      .closest("li")!;
    expect(his).toHaveAttribute("data-tentative");
    expect(his).toHaveClass("border-dashed");
    expect(his).toHaveTextContent("tentative");
    expect(screen.getByRole("list", { name: "Key" })).toHaveTextContent("Tentative");
    expect(screen.queryByTestId("week-conflicts")).not.toBeInTheDocument();
  });

  it("outlines conflicts, splits the lane and explains the overlap in words", () => {
    const { container } = render(
      <WeekGrid
        startHour={9}
        endHour={16}
        blocks={week([
          {
            id: "che-M",
            code: "CHE 115 A",
            day: "M",
            start: "11:00",
            end: "12:15",
            conflict: true,
          },
        ])}
      />,
    );
    const monday = gridView(container).getByRole("list", { name: "Monday" });
    const che = within(monday)
      .getByText(/CHE 115 A/)
      .closest("li")!;
    expect(che).toHaveAttribute("data-conflict");
    expect(che).toHaveClass("ring-danger");
    expect(che).toHaveTextContent("time conflict");
    expect(che).toHaveAttribute("data-lane", "2/2");
    expect(screen.getByTestId("week-conflicts")).toHaveTextContent(
      "Conflict: CHE 115 A overlaps CSC 221 A on Mon (11:00a–11:20a).",
    );
    expect(screen.getByTestId("week-conflicts")).toHaveTextContent(
      "Conflict: ECO 232 A overlaps CHE 115 A on Mon (11:30a–12:15p).",
    );
    expect(screen.getByRole("list", { name: "Key" })).toHaveTextContent("Time conflict");
  });

  it("lists TBA and out-of-view meetings instead of placing them", () => {
    const { container } = render(
      <WeekGrid
        startHour={9}
        endHour={16}
        blocks={[
          { id: "mus", code: "MUS 010 A", title: "Chamber Singers", tba: true },
          {
            id: "the",
            code: "THE 101 A",
            title: "Rehearsal",
            day: "R",
            start: "19:00",
            end: "21:30",
          },
        ]}
      />,
    );
    expect(screen.getByText("Time TBA", { selector: "p" }).nextElementSibling).toHaveTextContent(
      "MUS 010 AChamber SingersTime TBA",
    );
    expect(screen.getByText("Outside 9a–4p").nextElementSibling).toHaveTextContent(
      "THE 101 ARehearsalThu 7:00p–9:30p",
    );
    expect(gridView(container).queryByText(/MUS 010/)).not.toBeInTheDocument();
  });

  it("adds weekend columns when asked or needed", () => {
    const { container } = render(
      <WeekGrid
        startHour={9}
        endHour={16}
        blocks={[{ id: "s", code: "ENV 220 L", day: "S", start: "09:00", end: "12:00" }]}
      />,
    );
    expect(gridView(container).getByRole("list", { name: "Saturday" })).toBeInTheDocument();
    expect(
      tabsView(container)
        .getAllByRole("tab")
        .map((t) => t.textContent),
    ).toEqual([
      "MonMonday, no classes",
      "TueTuesday, no classes",
      "WedWednesday, no classes",
      "ThuThursday, no classes",
      "FriFriday, no classes",
      "SatSaturday, 1 class",
    ]);
  });

  it("switches days with tabs on narrow screens, starting on the requested day", async () => {
    const user = userEvent.setup();
    const { container } = render(
      <WeekGrid startHour={9} endHour={16} blocks={week()} label="Week" initialDay="W" />,
    );
    const tabs = tabsView(container);
    expect(tabs.getByRole("tab", { name: /Wednesday, 3 classes/ })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    const panel = tabs.getByRole("tabpanel");
    expect(within(panel).getAllByRole("listitem")).toHaveLength(3);
    expect(panel).toHaveTextContent("10:30a–11:20aCSC 221 AData StructuresWatson 132");

    await user.click(tabs.getByRole("tab", { name: /Tuesday/ }));
    const tuesday = tabs.getByRole("tabpanel");
    expect(tuesday).toHaveTextContent("ENG 260 A");
    expect(tuesday).toHaveTextContent("HIS 357 A");
    expect(tuesday).toHaveTextContent("Tentative");

    // Arrow keys move between days (Radix Tabs).
    await user.keyboard("{ArrowRight}");
    expect(tabs.getByRole("tab", { name: /Wednesday/ })).toHaveFocus();
  });

  it("defaults to the first day with a class and says when a day is empty", async () => {
    const user = userEvent.setup();
    const { container } = render(
      <WeekGrid
        startHour={9}
        endHour={16}
        blocks={[{ id: "x", code: "ENG 260 A", day: "T", start: "09:40", end: "10:55" }]}
      />,
    );
    const tabs = tabsView(container);
    expect(tabs.getByRole("tab", { name: /Tuesday/ })).toHaveAttribute("aria-selected", "true");
    await user.click(tabs.getByRole("tab", { name: /Monday/ }));
    expect(tabs.getByRole("tabpanel")).toHaveTextContent("No classes on Monday.");
  });
});

const WEDNESDAY: TimelineItem[] = [
  {
    id: "csc",
    kind: "class",
    code: "CSC 221 A",
    title: "Data Structures",
    start: "10:30",
    end: "11:20",
    location: "Watson 132",
    detail: "Terrence Lim",
    source: "course-schedule",
  },
  {
    id: "eco",
    kind: "class",
    code: "ECO 232 A",
    title: "Economics of Migration",
    start: "11:30",
    end: "12:20",
    location: "Watson 243",
    source: "course-schedule",
  },
  {
    id: "env",
    kind: "class",
    code: "ENV 237 A",
    title: "Intro to Interdisciplinary GIS",
    start: "14:30",
    end: "15:45",
    location: "Watson 247",
    detail: "Risper Nyairo",
    source: "course-schedule",
  },
];

describe("DayTimeline", () => {
  const NOW = new Date("2026-09-30T13:12:00Z"); // 9:12 AM EDT

  it("renders the mockup Wednesday: now-line, next class countdown and the lunch gap", () => {
    render(
      <DayTimeline
        now={NOW}
        timeZone="America/New_York"
        startHour={9}
        endHour={16}
        items={WEDNESDAY}
        showFreeGaps
        label="Schedule for Wednesday, September 30"
      />,
    );
    const list = screen.getByRole("list", { name: "Schedule for Wednesday, September 30, 9a–4p" });
    const items = within(list).getAllByRole("listitem");
    expect(items.map((li) => li.querySelector(".sr-only")?.textContent)).toEqual([
      "10:30a–11:20a:, CSC 221 A, Data Structures, Terrence Lim, Watson 132, in 1 h 18 m",
      "11:30a–12:20p:, ECO 232 A, Economics of Migration, Watson 243",
      ", 12:20p to 2:30p",
      "2:30p–3:45p:, ENV 237 A, Intro to Interdisciplinary GIS, Risper Nyairo, Watson 247",
    ]);
    expect(items[2]).toHaveTextContent("2 h 10 m free");
    expect(items[0]).toHaveTextContent("in 1 h 18 m");
    // Only the long ENV block shows the instructor line.
    expect(items[3]).toHaveTextContent("Risper Nyairo");
    expect(screen.getByText("Now: 9:12a")).toBeInTheDocument();
    const nowLine = screen.getByTestId("now-line");
    expect(nowLine).toHaveClass("border-urgent");
    expect(nowLine.style.top).toBe("2.8571%");
    // The time itself is a pill in the hour gutter, never over the blocks.
    const gutter = screen.getByTestId("timeline-gutter");
    const pill = within(gutter).getByTestId("now-pill");
    expect(pill).toHaveTextContent("9:12a");
    expect(pill.style.top).toBe("2.8571%");
    expect(list).not.toContainElement(pill);
    // "9a" would sit under the pill, so it is left out; the other hours stay.
    expect(within(gutter).queryByText("9a")).not.toBeInTheDocument();
    expect(within(gutter).getByText("10a")).toBeInTheDocument();
    // Classes carry no source tag, but still their source.
    expect(within(list).queryByText("Source:", { exact: false })).not.toBeInTheDocument();
    expect(items[0]).toHaveAttribute("data-source", "course-schedule");
  });

  it("on phones, a class block leads with the code and a title that may wrap; the room shows only when it fits", () => {
    render(
      <DayTimeline
        now={NOW}
        timeZone="America/New_York"
        startHour={9}
        endHour={16}
        items={WEDNESDAY}
        showFreeGaps={false}
        label="Schedule for Wednesday, September 30"
      />,
    );
    const phone = screen
      .getAllByRole("listitem")
      .map((li) => li.querySelector("[data-layout=phone]"))
      .filter((el): el is HTMLElement => el !== null);
    expect(phone).toHaveLength(3);
    // 50 minutes: code + title (two lines allowed, with an ellipsis), no room line.
    const eco = phone[1]!;
    expect(eco).toHaveClass("@min-[28rem]:hidden");
    const title = within(eco).getByText("Economics of Migration", { exact: false });
    expect(title).toHaveClass("line-clamp-2");
    expect(title).not.toHaveClass("truncate");
    expect(title).toHaveTextContent("ECO 232 AEconomics of Migration");
    expect(eco).not.toHaveTextContent("Watson 243");
    // 75 minutes: the room gets its own line.
    expect(phone[2]).toHaveTextContent("Watson 247");
  });

  it("clamps a long event location to two lines with an ellipsis instead of cutting it mid-line", () => {
    render(
      <DayTimeline
        now={NOW}
        timeZone="America/New_York"
        startHour={9}
        endHour={16}
        items={[
          {
            id: "neuro",
            kind: "event",
            title: "Fall 2026 Neuro Night",
            start: "13:30",
            end: "15:30",
            location:
              "Mauzé Family Terrace behind the Wall Academic Center (Cold Weather or Rain Location: Third floor in the Atrium Lounge of the Wall Academic Center)",
            source: "wildcatsync",
          },
        ]}
        showFreeGaps={false}
        label="Schedule"
      />,
    );
    expect(screen.getByTestId("timeline-event-meta")).toHaveClass("line-clamp-2");
  });

  it("uses the Davidson zone for now, whatever the server's zone", () => {
    render(
      <DayTimeline
        now={NOW}
        timeZone="UTC"
        startHour={9}
        endHour={16}
        items={WEDNESDAY}
        showFreeGaps={false}
      />,
    );
    // 13:12 UTC: the line is drawn at 1:12p, ECO is over and ENV is next.
    expect(screen.getByText("Now: 1:12p")).toBeInTheDocument();
    expect(
      screen.getByText(/ENV 237 A, Intro to Interdisciplinary GIS.*in 1 h 18 m/),
    ).toBeInTheDocument();
    expect(screen.queryByText(/free/)).not.toBeInTheDocument();
  });

  it("shows source tags on events and deadlines, and a point marker for deadlines", () => {
    render(
      <DayTimeline
        timeZone="America/New_York"
        startHour={9}
        endHour={16}
        showFreeGaps
        items={[
          ...WEDNESDAY,
          {
            id: "ps",
            kind: "deadline",
            code: "CSC 221",
            title: "Problem set",
            start: "13:00",
            source: "my-plan",
          },
          {
            id: "talk",
            kind: "event",
            title: "Faculty lunch talk",
            start: "12:30",
            end: "13:30",
            location: "Hurt Hub",
            source: "hurt-hub",
          },
        ]}
      />,
    );
    // 1:00p sits in a free stretch (12:20–2:30 less the talk): labelled in place.
    const deadline = screen.getByText("Problem set").closest("li")!;
    expect(deadline).toHaveAttribute("data-kind", "deadline");
    expect(deadline).toHaveTextContent("Due 1:00p");
    expect(within(deadline).getByText("Your plan").closest("[data-source]")).toHaveAttribute(
      "data-source",
      "my-plan",
    );
    const talk = screen.getByText(/Faculty lunch talk/, { selector: ".sr-only" }).closest("li")!;
    expect(talk).toHaveAttribute("data-kind", "event");
    expect(within(talk).getByText("Hurt Hub", { selector: "[data-source]" })).toBeInTheDocument();
    // No now given: no line, no countdown.
    expect(screen.queryByTestId("now-line")).not.toBeInTheDocument();
    expect(screen.queryByText(/ in \d/)).not.toBeInTheDocument();
  });

  it("splits overlapping items into lanes", () => {
    render(
      <DayTimeline
        timeZone="America/New_York"
        startHour={9}
        endHour={16}
        showFreeGaps={false}
        items={[
          WEDNESDAY[0]!,
          {
            id: "talk",
            kind: "event",
            title: "Talk",
            start: "11:00",
            end: "12:00",
            source: "hurt-hub",
          },
        ]}
      />,
    );
    const list = screen.getByRole("list", { name: /Today's schedule/ });
    const [csc, talk] = within(list)
      .getAllByRole("listitem")
      .filter((li) => li.hasAttribute("data-lane"));
    expect(csc).toHaveAttribute("data-density", "narrow");
    expect(csc).toHaveAttribute("data-lane", "1/2");
    expect(talk).toHaveAttribute("data-lane", "2/2");
    // Side by side only where two lanes fit 12px text; the tag in a lane is never cut short.
    expect(csc).toHaveClass("hidden", "@min-[28rem]:block");
    const tag = within(talk!).getByText("Hurt Hub", { selector: "[data-source]" });
    expect(tag).not.toHaveClass("truncate");
  });

  it("on narrow containers draws an overlap as one block and lists its items in full", () => {
    render(
      <DayTimeline
        now={new Date("2026-10-01T16:40:00Z")}
        timeZone="America/New_York"
        startHour={9}
        endHour={16}
        showFreeGaps={false}
        items={[
          {
            id: "talk",
            kind: "event",
            title: "Faculty lunch talk (sample)",
            start: "12:00",
            end: "13:00",
            location: "Hurt Hub",
            source: "hurt-hub",
          },
          {
            id: "dropin",
            kind: "event",
            title: "Advising drop-in (sample)",
            start: "12:30",
            end: "13:30",
            source: "registrar",
          },
          {
            id: "his",
            kind: "class",
            code: "HIS 357 A",
            title: "The Civil Rights Movement",
            start: "12:15",
            end: "13:30",
            source: "course-schedule",
          },
        ]}
      />,
    );
    const group = screen.getByTestId("overlap-group");
    expect(group).toHaveTextContent("3 at the same time12:00p–1:30p · listed below");
    // Three lanes need a wide container; below it the group block and the list show instead.
    expect(group).toHaveClass("@min-[38rem]:hidden");
    const lanes = screen
      .getByRole("list", { name: /Today's schedule/ })
      .querySelectorAll("li[data-lane]");
    expect([...lanes].every((li) => li.classList.contains("@min-[38rem]:block"))).toBe(true);
    const listed = screen.getByTestId("overlap-list");
    expect(listed).toHaveClass("@min-[38rem]:hidden");
    expect(listed).toHaveTextContent("At the same time, 12:00p–1:30p");
    const rows = within(listed).getAllByRole("listitem");
    expect(rows.map((r) => r.getAttribute("data-source"))).toEqual([
      "hurt-hub",
      "course-schedule",
      "registrar",
    ]);
    expect(rows[0]).toHaveTextContent(
      "12:00p–1:00pFaculty lunch talk (sample)Hurt HubSource: Hurt Hubnow · 20 m left",
    );
    expect(rows[1]).toHaveTextContent("12:15p–1:30pHIS 357 AThe Civil Rights Movement");
    expect(within(rows[2]!).getByText("Registrar", { selector: "[data-source]" })).toBeVisible();
  });

  it("never puts the now pill or a deadline label over a block", () => {
    render(
      <DayTimeline
        now={new Date("2026-09-30T14:45:00Z")} // 10:45, during CSC 221 A
        timeZone="America/New_York"
        startHour={9}
        endHour={16}
        showFreeGaps
        items={[
          ...WEDNESDAY,
          {
            id: "quiz",
            kind: "deadline",
            code: "ECO 232",
            title: "Reading quiz",
            start: "11:00",
            source: "my-plan",
          },
          {
            id: "ps",
            kind: "deadline",
            code: "CSC 221",
            title: "A problem set with a long title that has to wrap on a phone",
            start: "13:59",
            source: "my-plan",
          },
        ]}
      />,
    );
    const list = screen.getByRole("list", { name: /Today's schedule/ });
    // Now: the pill is in the gutter, the plot only has the line, drawn before (under) the blocks.
    const gutter = screen.getByTestId("timeline-gutter");
    expect(within(gutter).getByTestId("now-pill")).toHaveTextContent("10:45a");
    const nowLine = screen.getByTestId("now-line");
    expect(nowLine).toHaveTextContent("");
    expect(nowLine.compareDocumentPosition(list) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    // The 11:00 deadline falls during CSC 221 A: no label in the plot, a flag and a dashed line, and a list row.
    const labels = within(list).getAllByTestId("deadline-label");
    expect(labels).toHaveLength(1);
    expect(labels[0]).toHaveTextContent("A problem set with a long title");
    expect(within(list).queryByText("Reading quiz")).not.toBeInTheDocument();
    expect(screen.getAllByTestId("deadline-line")).toHaveLength(2);
    const deadlines = screen.getByTestId("deadline-list");
    expect(deadlines).toHaveTextContent("Deadlines");
    expect(within(deadlines).getByRole("listitem")).toHaveTextContent(
      "Due 11:00aECO 232Reading quizSource: Your plan",
    );
    // The flag for the listed deadline would meet the pill (15 minutes away), so it is left out.
    expect(within(gutter).queryByTestId("deadline-flag")).not.toBeInTheDocument();
    // A label's title wraps; it is never truncated before its code and tag.
    const title = within(labels[0]!).getByTestId("deadline-title");
    expect(title).not.toHaveClass("truncate");
    expect(title).toHaveClass("break-words");
  });

  it("clips items at the edges and lists what falls outside the view", () => {
    render(
      <DayTimeline
        now={new Date("2026-09-30T23:30:00Z")}
        timeZone="America/New_York"
        startHour={9}
        endHour={16}
        showFreeGaps
        items={[
          {
            id: "early",
            kind: "event",
            title: "Study group",
            start: "08:30",
            end: "09:30",
            source: "my-plan",
          },
          {
            id: "lab",
            kind: "class",
            code: "BIO 111 L",
            title: "Lab",
            start: "15:00",
            end: "17:50",
            source: "course-schedule",
          },
          {
            id: "club",
            kind: "event",
            title: "Club open house",
            start: "19:00",
            end: "20:30",
            location: "Union",
            source: "wildcatsync",
          },
          {
            id: "form",
            kind: "deadline",
            title: "Housing form",
            start: "23:59",
            source: "registrar",
          },
          {
            id: "late",
            kind: "event",
            title: "Late show",
            start: "22:00",
            end: "00:30",
            source: "hurt-hub",
          },
          {
            id: "bad",
            kind: "event",
            title: "Mystery",
            start: "TBA",
            end: "",
            source: "wildcatsync",
          },
        ]}
      />,
    );
    const lab = screen.getByText(/BIO 111 L/, { selector: ".sr-only" }).closest("li")!;
    expect(lab).toHaveTextContent("until 5:50p");
    expect(lab).toHaveClass("rounded-b-none");
    const early = screen.getByText(/Study group/, { selector: ".sr-only" }).closest("li")!;
    expect(early).toHaveAttribute("data-density", "tiny");
    expect(early).toHaveClass("rounded-t-none");
    const later = screen.getByText("Later today").nextElementSibling!;
    expect(later).toHaveTextContent("7:00p–8:30pClub open houseUnion");
    expect(later).toHaveTextContent("10:00p–12:30aLate show");
    expect(later).toHaveTextContent("Due 11:59pHousing form");
    expect(within(later as HTMLElement).getByText("WildcatSync")).toBeInTheDocument();
    expect(screen.getByText("Time not listed").nextElementSibling).toHaveTextContent("Mystery");
    // 7:30 PM is after the view: no now-line.
    expect(screen.queryByTestId("now-line")).not.toBeInTheDocument();
  });

  it("shows the next school day's first class", () => {
    render(
      <DayTimeline
        timeZone="America/New_York"
        startHour={9}
        endHour={16}
        items={[]}
        showFreeGaps
        nextUp={{
          code: "ENG 260 A",
          when: "Tomorrow 9:40",
          title: "British Literature Since 1800",
          location: "Chambers 3084",
        }}
      />,
    );
    expect(screen.getByText("Tomorrow 9:40").parentElement!.parentElement).toHaveTextContent(
      "ENG 260 ATomorrow 9:40 · British Literature Since 1800 · Chambers 3084",
    );
  });
});

describe("FiveDayStrip", () => {
  const days = [
    { date: "2026-09-28", label: "Mon", count: 3, isToday: false, href: "/today?day=2026-09-28" },
    { date: "2026-09-29", label: "Tue", count: 1, isToday: false, href: "/today?day=2026-09-29" },
    { date: "2026-09-30", label: "Wed", count: 5, isToday: true, href: "/today?day=2026-09-30" },
    { date: "2026-10-01", label: "Thu", count: 0, isToday: false, href: "/today?day=2026-10-01" },
    { date: "2026-10-02", label: "Fri", count: 2, isToday: false, href: "/today?day=2026-10-02" },
  ];

  it("is a labelled navigation with one link per day, today marked", () => {
    render(<FiveDayStrip days={days} />);
    const nav = screen.getByRole("navigation", { name: "This week" });
    const links = within(nav).getAllByRole("link");
    expect(links.map((l) => l.textContent)).toEqual([
      "Mon28Monday, September 28: 3 items",
      "Tue29Tuesday, September 29: 1 item",
      "Wed30Wednesday, September 30: 5 items, today, shown",
      "Thu1Thursday, October 1: 0 items",
      "Fri2Friday, October 2: 2 items",
    ]);
    // Today is the day the page shows.
    expect(links[2]).toHaveAttribute("aria-current", "page");
    expect(links[0]).not.toHaveAttribute("aria-current");
    expect(links[2]).toHaveClass("bg-primary-fill");
    expect(links[0]).toHaveAttribute("href", "/today?day=2026-09-28");
    // At most three dots, however busy the day.
    expect(links[2]!.querySelectorAll(".rounded-full")).toHaveLength(3);
    expect(links[3]!.querySelectorAll(".rounded-full")).toHaveLength(0);
  });

  it("fills the selected day when it is not today, and is a plain group without links", () => {
    const { rerender } = render(
      <FiveDayStrip days={days.map((d) => ({ ...d, selected: d.label === "Fri" }))} />,
    );
    const links = screen.getAllByRole("link");
    expect(links[4]).toHaveClass("bg-primary-fill");
    expect(links[2]).not.toHaveClass("bg-primary-fill");
    expect(links[2]).toHaveClass("border-primary");
    // The shown day is the current page and says so; today keeps aria-current="date".
    expect(links[4]).toHaveAttribute("aria-current", "page");
    expect(links[4]).toHaveTextContent("Friday, October 2: 2 items, shown");
    expect(links[2]).toHaveAttribute("aria-current", "date");
    expect(links[2]).not.toHaveTextContent("shown");

    rerender(
      <FiveDayStrip
        label="Next week"
        noun={["class", "classes"]}
        days={days.map((d) => ({ ...d, href: undefined }))}
      />,
    );
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    expect(screen.getByRole("group", { name: "Next week" })).toHaveTextContent(
      "Monday, September 28: 3 classes",
    );
    // Without links nothing is "shown": today is just today.
    expect(screen.getByText(/Wednesday, September 30/).closest("[aria-current]")).toHaveAttribute(
      "aria-current",
      "date",
    );
    rerender(
      <FiveDayStrip
        label="Next week"
        days={days.map((d) => ({ ...d, href: undefined, selected: d.label === "Thu" }))}
      />,
    );
    const thursday = screen.getByText(/Thursday, October 1/).closest("[aria-current]");
    expect(thursday).toHaveAttribute("aria-current", "true");
    expect(thursday).toHaveTextContent("Thursday, October 1: 0 items, shown");
  });
});
