import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import Link from "next/link";
import { describe, expect, it, vi } from "vitest";
import { Button } from "@/components/ui/button";

describe("Button", () => {
  it("renders a button that handles clicks", async () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Save plan</Button>);
    const button = screen.getByRole("button", { name: "Save plan" });
    expect(button).toBeEnabled();
    await userEvent.click(button);
    expect(onClick).toHaveBeenCalledOnce();
  });

  it("draws only the primary variant as a red fill; danger is outlined crimson, never a fill", () => {
    render(
      <>
        <Button>Save plan</Button>
        <Button variant="secondary">Cancel</Button>
        <Button variant="danger">Delete account</Button>
      </>,
    );
    expect(screen.getByRole("button", { name: "Save plan" })).toHaveClass(
      "bg-primary-fill",
      "text-on-primary",
    );
    expect(screen.getByRole("button", { name: "Cancel" }).className).not.toMatch(/-fill\b/);
    const danger = screen.getByRole("button", { name: "Delete account" });
    expect(danger).toHaveClass("border-danger", "bg-surface", "text-danger");
    expect(danger.className).not.toMatch(/\bbg-[\w-]*fill\b/);
  });

  it("renders its child element instead of a button with asChild", () => {
    render(
      <Button asChild>
        <Link href="/courses">Browse courses</Link>
      </Button>,
    );
    expect(screen.getByRole("link", { name: "Browse courses" })).toHaveAttribute(
      "href",
      "/courses",
    );
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});
