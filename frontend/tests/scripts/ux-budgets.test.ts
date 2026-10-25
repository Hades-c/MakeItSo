import { describe, expect, it } from "vitest";
import { H2_ORDER_WARN_ONLY } from "../e2e/ux/h2-order-baseline";
import { budgetTable, h2OrderScope, judge, judgeH2Order, verdict } from "../e2e/ux/metrics";

const DOM = ["Today", "Degree progress", "Due for you"];
const SCREEN = ["Today", "Due for you", "Degree progress"];
const QW8 = { until: "QW8 (Today's JSX in phone order)" };

describe("ux budgets: the h2 order check", () => {
  it("passes a page in order where it passes today, and says the check is hard there", () => {
    const r = judgeH2Order(1440, { same: true, dom: DOM, visual: DOM }, undefined);
    expect(verdict(r)).toBe("PASS");
    expect(r).toMatchObject({ hard: true, detail: "hard: in order today" });
  });

  it("fails a page that passes today once it is out of order, with both sequences", () => {
    const r = judgeH2Order(1440, { same: false, dom: DOM, visual: SCREEN }, undefined);
    expect(verdict(r)).toBe("FAIL");
    expect(r.detail).toBe(
      "hard, a new mismatch: DOM Today > Degree progress > Due for you | screen Today > Due for you > Degree progress",
    );
  });

  it("only warns where the page is out of order today, whatever its headings say", () => {
    const r = judgeH2Order(1024, { same: false, dom: DOM, visual: SCREEN }, QW8);
    expect(verdict(r)).toBe("WARN");
    expect(r).toMatchObject({ hard: false, pass: false, width: 1024 });
    expect(r.detail).toBe("warning only, until QW8 (Today's JSX in phone order)");
    // A count in a heading changed, or the order moved: still a warning, never a failure.
    const moved = ["Due for you 5", "Today", "Degree progress"];
    expect(verdict(judgeH2Order(390, { same: false, dom: DOM, visual: moved }, QW8))).toBe("WARN");
  });

  it("says when a warned page reads in order now, so its entry can go", () => {
    const r = judgeH2Order(1440, { same: true, dom: SCREEN, visual: SCREEN }, QW8);
    expect(verdict(r)).toBe("PASS");
    expect(r.hard).toBe(false);
    expect(r.detail).toBe(
      "warning only, until QW8 (Today's JSX in phone order): in order now, remove its h2-order-baseline.ts entry to make it hard",
    );
  });

  it("says, per page, where the check is hard and where it only warns", () => {
    const warnOnly = { "today@1440": QW8, "today@1024": QW8, "events@1440": { until: "M9" } };
    expect(h2OrderScope("today", [1440, 1024, 768, 390], warnOnly)).toBe(
      "h2 order: hard at 768 and 390 (in order today); " +
        "a warning at 1440 and 1024 (out of order today, until QW8 (Today's JSX in phone order))",
    );
    expect(h2OrderScope("courses", [1440, 390], warnOnly)).toBe(
      "h2 order: hard at 1440 and 390 (in order today)",
    );
    expect(h2OrderScope("events", [1440], warnOnly)).toBe(
      "h2 order: a warning at 1440 (out of order today, until M9)",
    );
  });

  it("keeps every warning tied to a measured page and width, with a reason", () => {
    for (const [key, entry] of Object.entries(H2_ORDER_WARN_ONLY)) {
      expect(key).toMatch(/^[a-z0-9-]+@(1440|1024|768|390)$/);
      expect(entry.until, key).not.toBe("");
    }
  });
});

describe("ux budgets: the table", () => {
  it("says PASS, WARN and FAIL, with the detail after the value", () => {
    const table = budgetTable("today", [
      judge({ check: "red", op: "==", target: 1 }, 1440, 1),
      judge({ check: "words", op: "<=", target: 420 }, 1440, 876),
      judge({ check: "railLabelsVisible", op: "==", target: 6, hard: true }, 1024, 5),
      judgeH2Order(390, { same: false, dom: DOM, visual: SCREEN }, QW8),
      judgeH2Order(768, { same: true, dom: DOM, visual: DOM }, undefined),
    ]);
    expect(table.split("\n").slice(4, 9)).toEqual([
      "| 1440 | red | == 1 | 1 | PASS |",
      "| 1440 | words | <= 420 | 876 | WARN |",
      "| 1024 | railLabelsVisible | == 6 | 5 | FAIL |",
      "| 390 | h2Order | == 1 | 0 (warning only, until QW8 (Today's JSX in phone order)) | WARN |",
      "| 768 | h2Order | == 1 | 1 (hard: in order today) | PASS |",
    ]);
  });

  it("escapes the pipe in a detail so the Markdown row keeps its columns", () => {
    const table = budgetTable("today", [
      judgeH2Order(390, { same: false, dom: DOM, visual: SCREEN }, undefined),
    ]);
    expect(table).toContain("Degree progress > Due for you \\| screen Today");
  });
});
