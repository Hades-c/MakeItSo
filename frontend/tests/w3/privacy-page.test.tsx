import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import PrivacyPage from "@/app/(marketing)/privacy/page";

describe("/privacy", () => {
  it("says what MakeItSo is, stores, sends to AI, keeps, and how to leave", () => {
    render(<PrivacyPage />);
    expect(
      screen.getByRole("heading", { level: 1, name: "Privacy at MakeItSo" }),
    ).toBeInTheDocument();
    const text = document.body.textContent ?? "";
    expect(text).toMatch(/independent student project/);
    expect(text).toMatch(/not a Davidson\s+College service/);
    expect(text).toMatch(/Anthropic/);
    expect(text).toMatch(/off until you turn them on/);
    expect(text).toMatch(
      /never sends your name, your email address, your account id or any grades/,
    );
    expect(text).toMatch(/LinkedIn/);
    expect(text).toMatch(/removed or corrected/);
    expect(text).toMatch(/30 days/);
    expect(text).toMatch(/15 minutes/);
    expect(text).toMatch(/within 24 hours/);
    expect(text).toMatch(/60 days/);
    expect(text).toMatch(/Download my data/);
    expect(text).toMatch(/Delete account/);
    for (const id of ["what-we-store", "ai", "alumni", "retention", "your-data", "contact"]) {
      expect(document.getElementById(id)).not.toBeNull();
    }
    const contact = screen.getByRole("link", { name: /MakeItSo project on GitHub/ });
    expect(contact).toHaveAttribute("rel", "noopener noreferrer");
    expect(contact.getAttribute("href")).toMatch(/^https:\/\//);
  });
});
