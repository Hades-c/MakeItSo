import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  ShowInWeekLink,
  WeekFocus,
  weekFocusPending,
} from "@/app/(hub)/courses/_components/week-focus";

/** "Show in my week": after the ?crn= navigation the week card scrolls into view and its heading takes focus. */

describe("Show in my week", () => {
  it("moves focus to the week heading after the chosen section changes", () => {
    const scrolled = vi.fn();
    Element.prototype.scrollIntoView = scrolled;
    const ui = (crn: string) => (
      <>
        <WeekFocus crn={crn} />
        <ShowInWeekLink href="/courses/202602/CSC-221?crn=20136#week">
          Show in my week
        </ShowInWeekLink>
        <section id="week">
          <h2 id="week-title" tabIndex={-1}>
            Your week with CSC 221
          </h2>
        </section>
      </>
    );
    const view = render(ui("20135"));
    const heading = screen.getByRole("heading", { name: "Your week with CSC 221" });
    expect(heading).not.toHaveFocus();
    const link = screen.getByRole("link", { name: "Show in my week" });
    link.addEventListener("click", (event) => event.preventDefault());
    fireEvent.click(link);
    expect(weekFocusPending()).toBe(true);
    view.rerender(ui("20136"));
    expect(heading).toHaveFocus();
    expect(scrolled).toHaveBeenCalledWith(expect.objectContaining({ block: "start" }));
    expect(weekFocusPending()).toBe(false);
  });

  it("does nothing on a plain re-render or a modified click (new tab)", () => {
    const ui = (crn: string) => (
      <>
        <WeekFocus crn={crn} />
        <ShowInWeekLink href="/x">Show</ShowInWeekLink>
        <h2 id="week-title" tabIndex={-1}>
          Week
        </h2>
      </>
    );
    const view = render(ui("1"));
    const link = screen.getByRole("link", { name: "Show" });
    link.addEventListener("click", (event) => event.preventDefault());
    fireEvent.click(link, { metaKey: true });
    expect(weekFocusPending()).toBe(false);
    view.rerender(ui("2"));
    expect(screen.getByRole("heading", { name: "Week" })).not.toHaveFocus();
  });
});
