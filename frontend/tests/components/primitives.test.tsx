import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Chip, ToggleChip } from "@/components/ui/chip";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { SectionCard } from "@/components/ui/section-card";
import { StatNumber } from "@/components/ui/stat-number";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

describe("Field", () => {
  it("labels the control and wires hint and error to it", () => {
    render(
      <Field id="email" label="Email" hint="Use your Davidson email." error="Enter a valid email">
        <Input type="email" />
      </Field>,
    );
    const input = screen.getByLabelText("Email");
    expect(input).toHaveAttribute("id", "email");
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(input).toHaveAccessibleDescription("Use your Davidson email. Enter a valid email");
  });
});

describe("page building blocks", () => {
  it("PageHeader renders one h1 with subtitle and actions", () => {
    render(
      <PageHeader
        kicker="Fall 2026"
        title="Courses"
        subtitle="Search"
        actions={<button>New</button>}
      />,
    );
    expect(screen.getByRole("heading", { level: 1, name: "Courses" })).toBeInTheDocument();
    expect(screen.getByText("Fall 2026")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "New" })).toBeInTheDocument();
  });

  it("SectionCard is a labelled region with count and link", () => {
    render(
      <SectionCard id="due" title="Due soon" count={4} link={{ href: "/plan", label: "All" }}>
        <p>items</p>
      </SectionCard>,
    );
    const region = screen.getByRole("region", { name: "Due soon 4" });
    expect(region).toContainElement(screen.getByRole("link", { name: "All" }));
  });

  it("StatNumber reads as one phrase", () => {
    render(<StatNumber value={12} label="of 32 courses" />);
    expect(screen.getByText("12").parentElement).toHaveTextContent("12 of 32 courses");
  });

  it("EmptyState and ErrorState explain and offer a next step", () => {
    render(
      <>
        <EmptyState
          title="Nothing here yet"
          description="Add a course."
          action={<button>Add</button>}
        />
        <ErrorState reference="abc123" action={<button>Try again</button>} />
      </>,
    );
    expect(screen.getByRole("heading", { name: "Nothing here yet" })).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("Something went wrong");
    expect(screen.getByRole("alert")).toHaveTextContent("Reference: abc123");
  });

  it("ErrorState has a compact inline variant and a configurable heading level", () => {
    render(<ErrorState variant="inline" headingLevel={3} title="Not generated" />);
    expect(screen.getByRole("heading", { level: 3, name: "Not generated" })).toHaveClass(
      "text-base",
    );
    expect(screen.getByRole("alert")).toHaveClass("bg-danger-wash", "items-start", "text-left");
    expect(screen.getByRole("alert")).not.toHaveClass("shadow-card");
  });

  it("Badge and Chip use semantic tokens", () => {
    render(
      <>
        <Badge variant="urgent">Due today</Badge>
        <Chip variant="done" mono>
          VPRQ
        </Chip>
      </>,
    );
    expect(screen.getByText("Due today")).toHaveClass("bg-urgent-wash", "text-urgent");
    expect(screen.getByText("VPRQ")).toHaveClass("bg-success-wash", "font-mono");
  });

  it("Chip wraps long text only when asked to", () => {
    render(
      <>
        <Chip>Fixed</Chip>
        <Chip wrap>Introduction to Something With a Very Long Section Title</Chip>
      </>,
    );
    expect(screen.getByText("Fixed")).toHaveClass("whitespace-nowrap");
    const long = screen.getByText(/Very Long Section Title/);
    expect(long).toHaveClass("whitespace-normal", "min-w-0", "max-w-full");
    expect(long).not.toHaveClass("whitespace-nowrap");
  });
});

describe("interactive primitives", () => {
  it("ToggleChip exposes its pressed state", async () => {
    function Filter() {
      const [on, setOn] = useState(false);
      return (
        <ToggleChip pressed={on} onClick={() => setOn(!on)}>
          Open seats
        </ToggleChip>
      );
    }
    render(<Filter />);
    const chip = screen.getByRole("button", { name: "Open seats" });
    expect(chip).toHaveAttribute("aria-pressed", "false");
    await userEvent.click(chip);
    expect(chip).toHaveAttribute("aria-pressed", "true");
  });

  it("Checkbox and Switch toggle with their labels", async () => {
    render(
      <>
        <Checkbox id="done" />
        <label htmlFor="done">Completed</label>
        <Switch id="notify" />
        <label htmlFor="notify">Email me</label>
      </>,
    );
    const box = screen.getByRole("checkbox", { name: "Completed" });
    await userEvent.click(box);
    expect(box).toBeChecked();
    const sw = screen.getByRole("switch", { name: "Email me" });
    await userEvent.click(sw);
    expect(sw).toBeChecked();
  });

  it("Tabs switch panels with the keyboard", async () => {
    render(
      <Tabs defaultValue="next">
        <TabsList aria-label="Plan views">
          <TabsTrigger value="next">Next semester</TabsTrigger>
          <TabsTrigger value="four">4-year plan</TabsTrigger>
        </TabsList>
        <TabsContent value="next">Week grid</TabsContent>
        <TabsContent value="four">Plan map</TabsContent>
      </Tabs>,
    );
    await userEvent.click(screen.getByRole("tab", { name: "Next semester" }));
    await userEvent.keyboard("{ArrowRight}");
    expect(screen.getByRole("tab", { name: "4-year plan" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(screen.getByRole("tabpanel")).toHaveTextContent("Plan map");
  });
});
