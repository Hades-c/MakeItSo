import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

/**
 * global-error replaces the root layout when the layout itself fails, so it renders its own <html>. That <html>
 * must carry the same next/font variables as the layout's (app/fonts.ts), or `font-display` and `font-sans` have no
 * family to resolve and the last-resort page drops Playfair (and even its Georgia fallback) for the browser's sans.
 */

// next/font only works under the Next compiler: stand in for the shared definitions with their class names.
vi.mock("@/app/fonts", () => ({
  fontVariables: "font-vars-inter font-vars-playfair font-vars-mono",
}));

const { default: GlobalError } = await import("@/app/global-error");
const { default: RootLayout } = await import("@/app/layout");

function htmlClass(markup: string): string | null {
  return /<html[^>]*\sclass="([^"]*)"/.exec(markup)?.[1] ?? null;
}

describe("the fonts on every document", () => {
  it("global-error's own <html> sets the layout's font variables, so its title is in Playfair", () => {
    const markup = renderToStaticMarkup(
      <GlobalError
        error={Object.assign(new Error("boom"), { digest: "abc123" })}
        reset={() => {}}
      />,
    );
    expect(htmlClass(markup)).toBe("font-vars-inter font-vars-playfair font-vars-mono");
    expect(markup).toMatch(/<h1 class="font-display[^"]*">MakeItSo could not load<\/h1>/);
  });

  it("is the same set the root layout puts on its <html>", () => {
    const markup = renderToStaticMarkup(<RootLayout>{null}</RootLayout>);
    expect(htmlClass(markup)).toBe("font-vars-inter font-vars-playfair font-vars-mono");
  });
});
