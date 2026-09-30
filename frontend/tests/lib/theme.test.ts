import { describe, expect, it } from "vitest";
import { isExplicitTheme, THEME_INIT_SCRIPT, THEME_STORAGE_KEY } from "@/lib/theme";

// The inline script runs before React; exercise it against a tiny fake document.
function run(stored: string | null, throws = false) {
  const attrs: Record<string, string> = {};
  const fakeStorage = {
    getItem: (key: string) => {
      if (throws) throw new Error("blocked");
      return key === THEME_STORAGE_KEY ? stored : null;
    },
  };
  const fakeDocument = {
    documentElement: { setAttribute: (k: string, v: string) => (attrs[k] = v) },
  };
  new Function("localStorage", "document", THEME_INIT_SCRIPT)(fakeStorage, fakeDocument);
  return attrs;
}

describe("theme init script", () => {
  it("applies a stored explicit theme", () => {
    expect(run("dark")).toEqual({ "data-theme": "dark" });
    expect(run("light")).toEqual({ "data-theme": "light" });
  });

  it("leaves the system preference alone otherwise, and never throws", () => {
    expect(run(null)).toEqual({});
    expect(run("purple")).toEqual({});
    expect(run("dark", true)).toEqual({});
  });

  it("recognises explicit themes", () => {
    expect(isExplicitTheme("dark")).toBe(true);
    expect(isExplicitTheme("system")).toBe(false);
  });
});
