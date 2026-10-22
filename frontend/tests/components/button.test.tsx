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
