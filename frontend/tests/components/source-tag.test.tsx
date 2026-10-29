import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AiChip } from "@/components/ui/ai-chip";
import { CourseCode } from "@/components/ui/course-code";
import {
  provenance,
  runHeads,
  SourceLine,
  SourceLink,
  SourceNote,
} from "@/components/ui/source-tag";

describe("SourceNote", () => {
  it("says the source in quiet sentence-case words, with the sr-only Source: prefix", () => {
    render(<SourceNote source="registrar" />);
    const note = screen.getByText("via Registrar", { exact: false });
    expect(note).toHaveAttribute("data-source", "registrar");
    expect(note).toHaveTextContent("Source: via Registrar");
    expect(note).toHaveClass("text-fg-3");
    // No box, no caps: not a tag.
    expect(note.className).not.toMatch(/border|uppercase/);
  });

  it("takes its own words, and is screen-reader text only after the first row of a run", () => {
    const { container } = render(
      <>
        <SourceNote source="my-plan" label="From your syllabus" />
        <SourceNote source="wildcatsync" hidden />
      </>,
    );
    expect(screen.getByText("From your syllabus", { exact: false })).toHaveTextContent(
      "Source: From your syllabus",
    );
    const hidden = container.querySelector('[data-source="wildcatsync"]')!;
    expect(hidden).toHaveClass("sr-only");
    expect(hidden).toHaveAttribute("data-source-run");
    expect(hidden).toHaveTextContent("Source: via WildcatSync");
  });

  it("stays Inter inside a Playfair (font-display) heading: labels are never in the display face", () => {
    render(
      <h3 className="font-display">
        Conflict check <SourceNote source="course-schedule" />
      </h3>,
    );
    expect(screen.getByText("via Course schedule", { exact: false })).toHaveClass("font-sans");
    // The same for the other small labels that can sit in a title.
    render(<AiChip />);
    expect(
      screen.getByText("AI-generated content: verify with your advisor").parentElement,
    ).toHaveClass("font-sans");
  });
});

describe("runHeads, provenance and SourceLine", () => {
  it("marks the first row of each run of one label", () => {
    expect(runHeads(["a", "a", null, "a", "b", "b"])).toEqual([
      true,
      false,
      false,
      true,
      true,
      false,
    ]);
  });

  it("ties a list to its one quiet source line", () => {
    expect(provenance(["registrar", "registrar", "davidson-offices"])).toEqual({
      "data-provenance": "registrar davidson-offices",
    });
    render(<SourceLine testId="line">Course schedule · seats as of Sep 30, 12:00 PM</SourceLine>);
    expect(screen.getByTestId("line")).toHaveClass("l0", "text-xs", "text-fg-3");
  });
});

describe("SourceLink", () => {
  it("names the source once, as the link to the item's page there, keeping the tag's contract", () => {
    render(
      <SourceLink
        source="ratemyprofessors"
        href="https://www.ratemyprofessors.com/professor/1"
        what="Katy Williams’s page"
      />,
    );
    const link = screen.getByRole("link", {
      name: "Source: RateMyProfessors, Katy Williams’s page (opens in a new tab)",
    });
    expect(link).toHaveAttribute("data-source", "ratemyprofessors");
    expect(link.textContent?.startsWith("Source:")).toBe(true);
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
    // Sentence case, not a boxed uppercase tag, and a text link: near-black and underlined, never red text.
    expect(link).not.toHaveClass("uppercase");
    expect(link).toHaveClass("link");
    expect(link).not.toHaveClass("text-primary");
  });

  it("is the same words as plain text without a link", () => {
    const { container } = render(<SourceLink source="ratemyprofessors" href={null} />);
    expect(screen.queryByRole("link")).toBeNull();
    const text = container.querySelector('[data-source="ratemyprofessors"]')!;
    expect(text).toHaveTextContent("Source: RateMyProfessors");
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

  it("compact: only 'AI' on screen, its label still read out", () => {
    render(<AiChip compact label="read from your syllabus: check the dates" />);
    expect(screen.getByText("AI")).toHaveAttribute("aria-hidden");
    expect(
      screen.getByText("AI-generated content: read from your syllabus: check the dates"),
    ).toHaveClass("sr-only");
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
