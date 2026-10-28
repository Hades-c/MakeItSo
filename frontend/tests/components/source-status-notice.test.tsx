import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SourceStatusNotice } from "@/components/app/source-status-notice";

const NOW = new Date("2026-09-30T16:00:00Z");

describe("SourceStatusNotice", () => {
  it("renders nothing while every source is current", () => {
    const { container } = render(<SourceStatusNotice problems={[]} now={NOW} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("names each source that is out of date or failing, in words with an icon", () => {
    render(
      <SourceStatusNotice
        now={NOW}
        timeZone="America/New_York"
        problems={[
          { label: "WildcatSync", status: "stale", lastSync: new Date("2026-09-29T16:00:00Z") },
          { label: "Course schedule", status: "error", lastSync: new Date("2026-09-30T13:05:00Z") },
          { label: "RateMyProfessors", status: "error", lastSync: null },
        ]}
      />,
    );
    expect(screen.getByTestId("source-status-notice")).toHaveTextContent(
      "Some information may be out of date: WildcatSync (last synced Sep 29); " +
        "Course schedule (sync failed, last synced 9:05 AM); RateMyProfessors (could not sync yet).",
    );
    expect(screen.getByTestId("source-status-notice").querySelector("svg")).not.toBeNull();
  });
});
