import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AiChip } from "@/components/ui/ai-chip";
import { CourseCode } from "@/components/ui/course-code";
import { SourceTag, SourceTagList } from "@/components/ui/source-tag";
import { TooltipProvider } from "@/components/ui/tooltip";

describe("SourceTag", () => {
  it("names the source in words (uppercased by CSS, not in the DOM)", () => {
    render(<SourceTag source="davidson-one" />);
    const tag = screen.getByText("Davidson One", { exact: false });
    expect(tag).toHaveClass("uppercase");
    expect(tag).toHaveAttribute("data-source", "davidson-one");
    expect(tag).toHaveTextContent("Source: Davidson One");
  });

  it("adds an 'as of' time for screen readers and a focusable tooltip trigger", () => {
    render(
      <TooltipProvider>
        <SourceTag source="handshake" asOf="2026-09-30T13:05:00Z" />
      </TooltipProvider>,
    );
    const tag = screen.getByText("Handshake", { exact: false });
    expect(tag).toHaveTextContent("Source: Handshake, as of Sep 30, 9:05 AM");
    expect(tag).toHaveAttribute("tabindex", "0");
  });

  it("drops an unparseable 'as of' date instead of throwing", () => {
    render(<SourceTag source="library" asOf="yesterday-ish" />);
    const tag = screen.getByText("Library", { exact: false });
    expect(tag).toHaveTextContent("Source: Library");
    expect(tag).not.toHaveAttribute("tabindex");
  });

  it("renders a labelled list", () => {
    render(<SourceTagList label="Sources for events" sources={["wildcatsync", "library"]} />);
    const list = screen.getByRole("list", { name: "Sources for events" });
    expect(list.querySelectorAll("li")).toHaveLength(2);
  });
});

describe("AiChip", () => {
  it("shows the verify reminder and announces AI content", () => {
    render(<AiChip />);
    expect(screen.getByText("AI · verify with your advisor")).toHaveAttribute("aria-hidden");
    expect(screen.getByText("AI-generated content: verify with your advisor")).toHaveClass(
      "sr-only",
    );
  });
});

describe("CourseCode", () => {
  it("prints the code in mono with its department colour", () => {
    render(<CourseCode code="CSC 221" section="A" />);
    const code = screen.getByText("CSC 221 A");
    expect(code).toHaveClass("font-mono", "text-course-lake");
    expect(code).toHaveAttribute("data-course-color", "lake");
  });

  it("uses the wash for chips and the solid colour for tabs", () => {
    render(
      <>
        <CourseCode code="ECO 232" variant="chip" />
        <CourseCode code="HIS 357" variant="tab" />
      </>,
    );
    expect(screen.getByText("ECO 232")).toHaveClass("bg-course-pine-wash", "text-course-pine");
    expect(screen.getByText("HIS 357")).toHaveClass("bg-course-teal", "text-surface");
  });
});
