import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  CleanGetForm,
  cleanQuery,
  takeResultsFocusRequest,
} from "@/app/(hub)/courses/_components/clean-get-form";

const router = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));

/** The /courses filter form leaves empty selects ("All departments", "Any time") out of the URL. */

describe("CleanGetForm", () => {
  it("drops empty fields and keeps repeated ones in order", () => {
    const data = new FormData();
    data.append("q", "data");
    data.append("term", "202602");
    data.append("dept", "");
    data.append("days", "T");
    data.append("days", "R");
    data.append("after", "  ");
    expect(cleanQuery(data)).toBe("?q=data&term=202602&days=T&days=R");
    expect(cleanQuery(new FormData())).toBe("");
  });

  it("navigates to the cleaned URL on submit, and stays a native GET form without JS", () => {
    render(
      <CleanGetForm action="/courses" aria-label="Course search">
        <input name="q" defaultValue="art" aria-label="q" />
        <select name="dept" defaultValue="" aria-label="dept">
          <option value="">All</option>
        </select>
        <button type="submit">Go</button>
      </CleanGetForm>,
    );
    const form = screen.getByRole("form", { name: "Course search" });
    expect(form).toHaveAttribute("method", "get");
    expect(form).toHaveAttribute("action", "/courses");
    fireEvent.click(screen.getByRole("button", { name: "Go" }));
    expect(router.push).toHaveBeenCalledWith("/courses?q=art");
  });
});

describe("search focus and announcements", () => {
  it("after a submitted search the results heading takes focus once the new results render", async () => {
    const { ResultsHeading } = await import("@/app/(hub)/courses/_components/results-heading");
    const ui = (navKey: string, text: string) => (
      <>
        <CleanGetForm action="/courses" aria-label="Course search">
          <input name="q" defaultValue="biology" aria-label="q" />
          <button type="submit">Search</button>
        </CleanGetForm>
        <ResultsHeading navKey={navKey} visible>
          {text}
        </ResultsHeading>
      </>
    );
    takeResultsFocusRequest(); // the earlier submit test left a request
    const view = render(ui("/courses", "214 courses in Spring 2027"));
    const heading = screen.getByRole("heading", { name: "214 courses in Spring 2027" });
    expect(heading).not.toHaveFocus();
    expect(heading.closest("[role=status]")).toHaveAttribute("aria-live", "polite");
    fireEvent.click(screen.getByRole("button", { name: "Search" }));
    expect(router.push).toHaveBeenLastCalledWith("/courses?q=biology");
    view.rerender(ui("/courses?q=biology", "12 courses in Spring 2027"));
    expect(screen.getByRole("heading", { name: "12 courses in Spring 2027" })).toHaveFocus();
    // A navigation that was not a submitted search (a "remove filter" link) leaves focus alone.
    screen.getByRole("button", { name: "Search" }).focus();
    view.rerender(ui("/courses?q=bio", "30 courses in Spring 2027"));
    expect(screen.getByRole("button", { name: "Search" })).toHaveFocus();
  });

  it("keeps the live region mounted but hidden when there are no results", async () => {
    const { ResultsHeading } = await import("@/app/(hub)/courses/_components/results-heading");
    render(
      <ResultsHeading navKey="/courses?q=zzz" visible={false}>
        No Spring 2027 courses found
      </ResultsHeading>,
    );
    expect(screen.queryByRole("heading")).toBeNull();
    const status = screen.getByRole("status");
    expect(status).toHaveTextContent("No Spring 2027 courses found");
    expect(status).toHaveClass("sr-only");
  });
});
