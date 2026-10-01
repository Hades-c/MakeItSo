import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Every hub page checks the session itself (hardening regression): Next renders the hub layout and the page in
 * parallel, so a page that relied on the layout's requireUser() alone streamed its content into the redirect sent
 * to signed-out visitors (GET /careers → 307 with 96 KB of the page).
 */
function pages(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) return pages(full);
    return name === "page.tsx" ? [full] : [];
  });
}

describe("hub pages", () => {
  const root = path.join(process.cwd(), "app", "(hub)");
  const files = pages(root);

  it("are found", () => {
    expect(files.length).toBeGreaterThanOrEqual(9);
  });

  it.each(files.map((file) => [path.relative(root, file), file]))(
    "%s calls requireUser() itself",
    (_name, file) => {
      expect(readFileSync(file, "utf8")).toMatch(/await requireUser\(/);
    },
  );
});
