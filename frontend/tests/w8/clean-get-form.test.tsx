import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { CleanGetForm, cleanQuery } from "@/app/(hub)/courses/_components/clean-get-form";

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
